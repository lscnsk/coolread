package com.coolread.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
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
        final int pauseMs; // silence after it: around titles and at the end of a chapter

        Item(int chapter, int index, String text, int pauseMs) {
            this.chapter = chapter;
            this.index = index;
            this.text = text;
            this.pauseMs = pauseMs;
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
    private volatile float speed = 1f;
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
        volatile long end = -1; // frame where it ends in the track, once all of it is written
        // Which frame of the track is which sample of pcm: pairs {track frame, sample}, in order.
        // The speed is made here, not by the phone, so the two differ. Guarded by Session.chunks.
        final ArrayList<long[]> map = new ArrayList<>();

        /** Seconds into the sentence that are heard when the track is at this frame. */
        double timeAt(long head, float speed) {
            long[] a = null, b = null;
            for (long[] m : map) {
                if (m[0] <= head) a = m;
                else { b = m; break; }
            }
            if (a == null) return 0;
            double sample = b != null && b[0] > a[0]
                ? a[1] + (head - a[0]) * (double) (b[1] - a[1]) / (b[0] - a[0])
                : a[1] + (head - a[0]) * (double) speed;
            return Math.min(sample, pcm.length) / RATE;
        }

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
        }

        void start(int from) {
            engine.submit(() -> produce(from));
            writer = new Thread(this::write, "speech-writer");
            writer.start();
        }

        private volatile boolean started;

        /** First sound is in the track: play it. */
        private void begin() {
            if (started) return;
            started = true;
            main.post(() -> {
                if (cancelled || session != this) return;
                if (!paused) track.play();
            });
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
                    // The pause is silence at the end of the sentence's audio (zeros)
                    short[] pcm = new short[r.audio.length + Math.max(0, it.pauseMs) * RATE / 1000];
                    for (int i = 0; i < r.audio.length; i++) {
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

        // The speed is made here (see Tempo), and the track always plays at normal speed
        private final Tempo tempo = new Tempo(RATE);
        private final short[] block = new short[RATE / 10], out = new short[RATE / 5];

        /** Writes what the speed changer has ready; false if the track is gone. */
        private boolean drain() throws InterruptedException {
            int got;
            while (!cancelled && (got = tempo.read(out, out.length)) > 0) {
                int off = 0;
                while (!cancelled && off < got) {
                    int n = track.write(out, off, got - off, AudioTrack.WRITE_NON_BLOCKING);
                    if (n < 0) return false;
                    if (n > 0) begin();
                    if (n == 0) Thread.sleep(20);
                    off += n;
                }
                written += got;
            }
            return true;
        }

        private void write() {
            try {
                Chunk prev = null;
                while (!cancelled) {
                    Chunk c = ready.poll(100, TimeUnit.MILLISECONDS);
                    if (c == null) continue;
                    if (c == END) break;
                    if (prev != null) prev.end = written;
                    prev = c;
                    c.start = written;
                    synchronized (chunks) {
                        c.map.add(new long[] {written, 0});
                        chunks.add(c);
                    }
                    int off = 0;
                    while (!cancelled && off < c.pcm.length) {
                        // A tenth of a second at a time, so a change of speed is heard at once
                        int n = Math.min(block.length, c.pcm.length - off);
                        System.arraycopy(c.pcm, off, block, 0, n);
                        tempo.setSpeed(speed);
                        tempo.write(block, n);
                        off += n;
                        if (!drain()) return;
                        synchronized (chunks) { c.map.add(new long[] {written, off}); }
                    }
                }
                if (!cancelled) {
                    tempo.flush();
                    if (!drain()) return;
                    if (prev != null) prev.end = written;
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
                    if (c.start <= head && (c.end < 0 ? !fed : head < c.end)) found = c;
                }
                // Forget what has been played
                while (chunks.size() > 2 && chunks.get(1).end >= 0 && chunks.get(1).end <= head) chunks.remove(0);
                if (found != null) time[0] = found.timeAt(head, speed);
            }
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

    // One track for all runs
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

    private static final String TAG = "Speaker";

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
        info.speed = s;
        if (session != null) PlaybackService.update(ctx, info, this);
    }

    /** One step of 0.25 slower or faster, from the notification. */
    private void stepSpeed(int dir) {
        float s = Math.max(MIN_SPEED, Math.min(MAX_SPEED, Math.round((speed + dir * 0.25f) * 4f) / 4f));
        setSpeed(s);
        listener.onSpeed(s);
    }

    static final float MIN_SPEED = 0.5f, MAX_SPEED = 5f;

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
