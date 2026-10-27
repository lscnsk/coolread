package com.coolread.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.PlaybackParams;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Reads a queue of sentences aloud by itself, so it keeps going with the screen off.
 *
 * The web layer hands over the sentences of a chapter and, when asked (onNeed), of the
 * next one. One thread synthesizes a few sentences ahead, another plays them one after
 * the other through an AudioTrack; the position (sentence and word) is reported back for
 * highlighting. All public methods run on the main thread.
 */
final class Speaker implements PlaybackService.Controller {

    interface Synth {
        SileroTts.Result run(String text) throws Exception;
    }

    interface Listener {
        /** state: "playing", "paused", "loading", "ended" or "error". */
        void onState(String state);
        void onPosition(int chapter, int index, int word);
        /** The queue is about to run out after this chapter. */
        void onNeed(int chapter);
        /** The speed was changed from the notification. */
        void onSpeed(float speed);
    }

    static final class Item {
        final int chapter, index;
        final String text;

        Item(int chapter, int index, String text) {
            this.chapter = chapter;
            this.index = index;
            this.text = text;
        }
    }

    private static final int RATE = SileroTts.SAMPLE_RATE;
    private static final int AHEAD = 3;

    private final Context ctx;
    private final ExecutorService engine;
    private final Synth synth;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AudioManager audio;

    private final Object lock = new Object();
    private final ArrayList<Item> items = new ArrayList<>(); // guarded by lock
    private boolean complete; // no more chapters; guarded by lock
    private boolean asked; // onNeed sent for the current end of the queue; guarded by lock

    private Session session;
    private float speed = 1f;
    private boolean paused, resumeOnFocus;
    private PlaybackService.NowPlaying info = new PlaybackService.NowPlaying();
    private final ArrayList<String> chapterTitles = new ArrayList<>();
    private Object focusRequest;

    private int lastChapter = -1, lastIndex = -1, lastWord = -1, lastPos = 0;
    private String lastState = "";

    Speaker(Context ctx, ExecutorService engine, Synth synth, Listener listener) {
        this.ctx = ctx;
        this.engine = engine;
        this.synth = synth;
        this.listener = listener;
        this.audio = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
    }

    private static final class Chunk {
        final int pos; // place in items
        final Item item;
        final short[] pcm;
        final double[] marks;
        long start; // frame where it starts in the track

        Chunk(int pos, Item item, short[] pcm, double[] marks) {
            this.pos = pos;
            this.item = item;
            this.pcm = pcm;
            this.marks = marks;
        }
    }

    private static final Chunk END = new Chunk(-1, null, new short[0], new double[0]);

    /** One run of playback from a given place in the queue; a skip starts a new one. */
    private final class Session {
        volatile boolean cancelled;
        volatile boolean fed; // everything has been written
        volatile long written;
        final AudioTrack track;
        final ArrayBlockingQueue<Chunk> ready = new ArrayBlockingQueue<>(AHEAD);
        final ArrayList<Chunk> chunks = new ArrayList<>(); // guarded by itself
        Thread writer;

        Session() {
            track = obtainTrack();
            applySpeed(track);
        }

        void start(int from) {
            engine.submit(() -> produce(from));
            writer = new Thread(this::write, "speech-writer");
            writer.start();
            if (!paused) {
                track.play();
                applySpeed(track); // some phones drop the speed when the track starts
            }
        }

        private void produce(int pos) {
            for (; !cancelled; pos++) {
                Item it;
                synchronized (lock) {
                    while (!cancelled && pos >= items.size() && !complete) {
                        askMore();
                        try { lock.wait(200); } catch (InterruptedException e) { return; }
                    }
                    if (cancelled) return;
                    if (pos >= items.size()) {
                        offer(END);
                        return;
                    }
                    it = items.get(pos);
                    if (pos >= items.size() - AHEAD - 2) askMore();
                }
                Chunk c;
                try {
                    SileroTts.Result r = synth.run(it.text);
                    short[] pcm = new short[r.audio.length];
                    for (int i = 0; i < pcm.length; i++) {
                        float s = Math.max(-1f, Math.min(1f, r.audio[i]));
                        pcm[i] = (short) Math.round(s * 32767f);
                    }
                    c = new Chunk(pos, it, pcm, r.marks);
                } catch (Throwable e) {
                    // A sentence the voice cannot say is skipped
                    c = new Chunk(pos, it, new short[0], new double[0]);
                }
                if (!offer(c)) return;
            }
        }

        private boolean offer(Chunk c) {
            try {
                while (!cancelled) if (ready.offer(c, 100, TimeUnit.MILLISECONDS)) return true;
            } catch (InterruptedException ignored) {}
            return false;
        }

        private void write() {
            try {
                while (!cancelled) {
                    Chunk c = ready.poll(100, TimeUnit.MILLISECONDS);
                    if (c == null) continue;
                    if (c == END) break;
                    c.start = written;
                    synchronized (chunks) { chunks.add(c); }
                    int off = 0;
                    while (!cancelled && off < c.pcm.length) {
                        int n = track.write(c.pcm, off, c.pcm.length - off, AudioTrack.WRITE_NON_BLOCKING);
                        if (n < 0) return;
                        if (n == 0) Thread.sleep(20);
                        off += n;
                    }
                    written += c.pcm.length;
                }
                if (!cancelled) {
                    // Pad a little so the last words are not cut off when the track stops
                    short[] pad = new short[RATE / 5];
                    int off = 0;
                    while (!cancelled && off < pad.length) {
                        int n = track.write(pad, off, pad.length - off, AudioTrack.WRITE_NON_BLOCKING);
                        if (n < 0) break;
                        if (n == 0) Thread.sleep(20);
                        off += n;
                    }
                    fed = true;
                }
            } catch (InterruptedException ignored) {}
        }

        /** Stops this run. The track stays for the next run (keep) or is let go. */
        void cancel(boolean keep) {
            cancelled = true;
            synchronized (lock) { lock.notifyAll(); }
            try { track.pause(); } catch (Exception ignored) {}
            Thread w = writer;
            if (keep) {
                // The writer stops within one short wait; then nothing old is left in the track
                try { if (w != null) w.join(250); } catch (InterruptedException ignored) {}
                if (w == null || !w.isAlive()) {
                    try { track.flush(); } catch (Exception ignored) {}
                    return;
                }
                shared = null; // the writer is stuck: give the next run a fresh track
            }
            try { track.flush(); } catch (Exception ignored) {}
            new Thread(() -> {
                try { if (w != null) w.join(2000); } catch (InterruptedException ignored) {}
                track.release();
            }, "speech-release").start();
        }

        /** The chunk being heard and the time in it, or null while nothing is. */
        Chunk current(double[] time) {
            long head;
            try {
                head = track.getPlaybackHeadPosition() & 0xffffffffL;
            } catch (Exception e) {
                return null;
            }
            Chunk found = null;
            synchronized (chunks) {
                for (Chunk c : chunks) {
                    if (c.start <= head && head < c.start + c.pcm.length) found = c;
                }
                // Forget what has been played
                while (chunks.size() > 2 && chunks.get(1).start + chunks.get(1).pcm.length <= head) chunks.remove(0);
            }
            if (found != null) time[0] = (head - found.start) / (double) RATE;
            return found;
        }

        boolean finished() {
            if (!fed) return false;
            long head = track.getPlaybackHeadPosition() & 0xffffffffL;
            return head >= written;
        }
    }

    private void askMore() {
        // called with lock held
        if (asked || complete || items.isEmpty()) return;
        asked = true;
        int chapter = items.get(items.size() - 1).chapter;
        main.post(() -> listener.onNeed(chapter));
    }

    // One track for all runs: a new track for every skip lost the speed for a moment on some phones
    private AudioTrack shared;

    private AudioTrack obtainTrack() {
        if (shared != null && shared.getState() == AudioTrack.STATE_INITIALIZED) return shared;
        int min = AudioTrack.getMinBufferSize(RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
        shared = new AudioTrack(
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build(),
            new AudioFormat.Builder().setSampleRate(RATE).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build(),
            Math.max(min, RATE / 5 * 2), AudioTrack.MODE_STREAM, AudioManager.AUDIO_SESSION_ID_GENERATE);
        return shared;
    }

    /** Puts the speed back if the phone dropped it. */
    private void keepSpeed(AudioTrack t) {
        try {
            if (Math.abs(t.getPlaybackParams().getSpeed() - speed) > 0.01f) applySpeed(t);
        } catch (Exception ignored) {}
    }

    private void applySpeed(AudioTrack t) {
        try {
            t.setPlaybackParams(new PlaybackParams().setSpeed(speed).setPitch(1f));
        } catch (Exception ignored) {}
    }

    // ---- Called by the plugin ----

    /** Starts reading these sentences from the given one, replacing what was queued. */
    void start(List<Item> list, int from, boolean last, PlaybackService.NowPlaying np, String chapterTitle) {
        stopSession();
        synchronized (lock) {
            items.clear();
            items.addAll(list);
            complete = last;
            asked = false;
            lock.notifyAll();
        }
        info = np;
        info.speech = true;
        info.speed = speed;
        chapterTitles.clear();
        if (!list.isEmpty()) setTitle(list.get(0).chapter, chapterTitle);
        paused = false;
        requestFocus();
        startAt(Math.max(0, Math.min(from, list.size() - 1)));
    }

    /** Adds the next chapter to the queue (empty and last: the book is over). */
    void append(List<Item> list, boolean last, String chapterTitle) {
        if (!list.isEmpty()) setTitle(list.get(0).chapter, chapterTitle);
        synchronized (lock) {
            items.addAll(list);
            if (last) complete = true;
            asked = false;
            lock.notifyAll();
        }
    }

    private void setTitle(int chapter, String title) {
        while (chapterTitles.size() <= chapter) chapterTitles.add(null);
        chapterTitles.set(chapter, title);
    }

    void pause() {
        paused = true;
        resumeOnFocus = false;
        if (session != null) session.track.pause();
        state("paused");
    }

    void resume() {
        if (session == null) return;
        paused = false;
        requestFocus();
        session.track.play();
        applySpeed(session.track); // some phones drop the speed after a pause
        state("playing");
    }

    void skip(int delta) {
        int pos;
        synchronized (lock) {
            if (items.isEmpty()) return;
            pos = Math.max(0, Math.min(items.size() - 1, lastPos + delta));
        }
        stopSession();
        startAt(pos);
    }

    void setSpeed(float s) {
        speed = s;
        if (session != null) applySpeed(session.track);
        info.speed = s;
        if (session != null) PlaybackService.update(ctx, info, this);
    }

    /** One step of 0.25 slower or faster, from the notification. */
    private void stepSpeed(int dir) {
        float s = Math.max(MIN_SPEED, Math.min(MAX_SPEED, Math.round((speed + dir * 0.25f) * 4f) / 4f));
        setSpeed(s);
        listener.onSpeed(s);
    }

    static final float MIN_SPEED = 0.5f, MAX_SPEED = 4f;

    void stop() {
        endSession();
        synchronized (lock) {
            items.clear();
            complete = false;
        }
        abandonFocus();
        PlaybackService.end(this);
        lastState = "";
    }

    boolean active() {
        return session != null;
    }

    // ---- Inside ----

    private void startAt(int pos) {
        lastPos = pos;
        lastChapter = lastIndex = lastWord = -1;
        session = new Session();
        session.start(pos);
        state(paused ? "paused" : "loading");
        main.removeCallbacks(monitor);
        main.post(monitor);
    }

    /** Ends the current run; the track is kept for the run that follows. */
    private void stopSession() {
        main.removeCallbacks(monitor);
        if (session != null) {
            session.cancel(true);
            session = null;
        }
    }

    /** Ends the current run and lets the track go (reading is over). */
    private void endSession() {
        main.removeCallbacks(monitor);
        if (session != null) {
            session.cancel(false);
            session = null;
        }
        shared = null;
    }

    private void state(String st) {
        if (!st.equals(lastState)) {
            lastState = st;
            listener.onState(st);
        }
        info.playing = !paused && !"ended".equals(st);
        info.loading = "loading".equals(st);
        if (lastChapter >= 0 && lastChapter < chapterTitles.size() && chapterTitles.get(lastChapter) != null) {
            info.title = chapterTitles.get(lastChapter);
        }
        PlaybackService.update(ctx, info, this);
    }

    /** Follows the track: which sentence and word are heard now. */
    private int ticks;
    private final Runnable monitor = new Runnable() {
        @Override
        public void run() {
            Session s = session;
            if (s == null) return;
            double[] t = new double[1];
            Chunk c = s.current(t);
            if (c != null) {
                int word = 0;
                for (int i = 0; i < c.marks.length; i++) {
                    if (c.marks[i] >= 0 && c.marks[i] <= t[0] + 0.03) word = i;
                }
                lastPos = c.pos;
                boolean chapterChanged = c.item.chapter != lastChapter;
                if (c.item.chapter != lastChapter || c.item.index != lastIndex || word != lastWord) {
                    lastChapter = c.item.chapter;
                    lastIndex = c.item.index;
                    lastWord = word;
                    listener.onPosition(lastChapter, lastIndex, word);
                }
                if (!paused && ("loading".equals(lastState) || chapterChanged)) {
                    lastState = "";
                    state("playing");
                }
            } else if (!paused && !s.fed && "playing".equals(lastState)) {
                // Waiting for the voice (or for the next chapter)
                state("loading");
            }
            if (!paused && ++ticks % 8 == 0) keepSpeed(s.track);
            if (s.finished()) {
                endSession();
                abandonFocus();
                lastState = "";
                listener.onState("ended");
                PlaybackService.end(Speaker.this);
                return;
            }
            main.postDelayed(this, 60);
        }
    };

    // ---- Audio focus: pause for calls and other players ----

    private final AudioManager.OnAudioFocusChangeListener focus = change -> {
        if (change == AudioManager.AUDIOFOCUS_LOSS) {
            if (session != null && !paused) pause();
        } else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            if (session != null && !paused) {
                pause();
                resumeOnFocus = true;
            }
        } else if (change == AudioManager.AUDIOFOCUS_GAIN) {
            if (resumeOnFocus && session != null && paused) resume();
            resumeOnFocus = false;
        }
    };

    private void requestFocus() {
        if (Build.VERSION.SDK_INT >= 26) {
            if (focusRequest == null) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                    .setWillPauseWhenDucked(true)
                    .setOnAudioFocusChangeListener(focus, main)
                    .build();
            }
            audio.requestAudioFocus((AudioFocusRequest) focusRequest);
        } else {
            audio.requestAudioFocus(focus, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
    }

    private void abandonFocus() {
        if (Build.VERSION.SDK_INT >= 26) {
            if (focusRequest != null) audio.abandonAudioFocusRequest((AudioFocusRequest) focusRequest);
        } else {
            audio.abandonAudioFocus(focus);
        }
    }

    // ---- Buttons in the notification, on the lock screen and on headphones ----

    @Override
    public void onAction(String action, long arg) {
        switch (action) {
            case PlaybackService.PLAY: if (session != null) resume(); break;
            case PlaybackService.PAUSE: if (session != null) pause(); break;
            case PlaybackService.BACK: skip(-1); break;
            case PlaybackService.FORWARD: skip(1); break;
            case PlaybackService.SLOWER: stepSpeed(-1); break;
            case PlaybackService.FASTER: stepSpeed(1); break;
            case PlaybackService.STOP:
                endSession();
                abandonFocus();
                lastState = "";
                listener.onState("stopped");
                break;
            default: break;
        }
    }
}
