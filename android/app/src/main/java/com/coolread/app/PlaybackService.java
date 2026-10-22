package com.coolread.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.drawable.Icon;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

/**
 * One player notification for both audiobooks and reading aloud, like music apps have:
 * cover, title, back / play-pause / forward, also on the lock screen and headset buttons.
 * While it runs the app keeps going with the screen off.
 *
 * Whoever plays (the audiobook player in the web layer, or the native speech queue) passes
 * what is playing with update() and gets the button presses through its Controller.
 */
public class PlaybackService extends Service {

    public interface Controller {
        /** action is one of PLAY, PAUSE, BACK, FORWARD, SEEK (arg: milliseconds), STOP. */
        void onAction(String action, long arg);
    }

    static final String PLAY = "play", PAUSE = "pause", BACK = "back", FORWARD = "forward", SEEK = "seek", STOP = "stop";

    /** What is playing. Speech has sentence skips instead of ±10 s and no seek bar. */
    static final class NowPlaying {
        String title = "", subtitle = "";
        Bitmap cover;
        int color;
        boolean playing, loading, speech;
        long positionMs = -1, durationMs = -1;
        float speed = 1f;

        NowPlaying copy() {
            NowPlaying n = new NowPlaying();
            n.title = title; n.subtitle = subtitle; n.cover = cover; n.color = color;
            n.playing = playing; n.loading = loading; n.speech = speech;
            n.positionMs = positionMs; n.durationMs = durationMs; n.speed = speed;
            return n;
        }
    }

    private static final String CHANNEL = "playback";
    private static final int NOTIFICATION_ID = 7;
    // A paused player goes away after a while, like in music apps
    private static final long IDLE_MS = 15 * 60 * 1000;

    private static NowPlaying state;
    private static Controller controller;
    private static PlaybackService instance;

    private MediaSession session;
    private PowerManager.WakeLock wakeLock;
    private boolean noisyRegistered;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable idleStop = () -> dispatch(STOP, 0);

    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            // Headphones unplugged: pause instead of playing out loud
            dispatch(PAUSE, 0);
        }
    };

    // ---- Used by the players (main thread) ----

    static void update(Context ctx, NowPlaying np, Controller c) {
        state = np.copy();
        controller = c;
        if (instance != null) {
            instance.refresh();
            return;
        }
        Intent i = new Intent(ctx, PlaybackService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Exception ignored) {
            // Not allowed from the background on new Android versions; the next update retries
        }
    }

    /** Removes the player, if c still owns it (null: whoever owns it). */
    static void end(Controller c) {
        if (c != null && controller != c) return;
        state = null;
        controller = null;
        if (instance != null) instance.shutdown();
    }

    static boolean owns(Controller c) {
        return controller == c && state != null;
    }

    // ---- Service ----

    @Override
    public void onCreate() {
        super.onCreate();
        init();
    }

    private void init() {
        instance = this;
        if (session != null) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, getString(R.string.playback_channel), NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        session = new MediaSession(this, "CoolRead");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { dispatch(PLAY, 0); }
            @Override public void onPause() { dispatch(PAUSE, 0); }
            @Override public void onSkipToPrevious() { dispatch(BACK, 0); }
            @Override public void onSkipToNext() { dispatch(FORWARD, 0); }
            @Override public void onRewind() { dispatch(BACK, 0); }
            @Override public void onFastForward() { dispatch(FORWARD, 0); }
            @Override public void onSeekTo(long pos) { dispatch(SEEK, pos); }
            @Override public void onStop() { dispatch(STOP, 0); }
            @Override public void onCustomAction(String action, android.os.Bundle extras) { dispatch(action, 0); }
        });
        PowerManager pm = getSystemService(PowerManager.class);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "coolread:playback");
        wakeLock.setReferenceCounted(false);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        init();
        if (state == null) {
            // Started and then ended before it came up: it still has to go foreground once
            foreground(build(new NowPlaying()));
            shutdown();
            return START_NOT_STICKY;
        }
        String action = intent != null ? intent.getAction() : null;
        refresh();
        if (action != null) dispatch(action, 0);
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // The app was swiped away: stop playing
        dispatch(STOP, 0);
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        cleanup();
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void dispatch(String action, long arg) {
        Controller c = controller;
        if (STOP.equals(action)) end(null);
        if (c != null) c.onAction(action, arg);
    }

    private void refresh() {
        NowPlaying s = state;
        if (s == null) return;
        MediaMetadata.Builder meta = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, s.title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, s.subtitle);
        if (s.cover != null) meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, s.cover);
        if (s.durationMs > 0) meta.putLong(MediaMetadata.METADATA_KEY_DURATION, s.durationMs);
        session.setMetadata(meta.build());

        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP;
        PlaybackState.Builder ps = new PlaybackState.Builder();
        if (s.speech) {
            actions |= PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SKIP_TO_NEXT;
        } else {
            actions |= PlaybackState.ACTION_REWIND | PlaybackState.ACTION_FAST_FORWARD | PlaybackState.ACTION_SEEK_TO;
            // New Android versions put these in the back / forward places
            ps.addCustomAction(BACK, getString(R.string.playback_back), R.drawable.ic_playback_back);
            ps.addCustomAction(FORWARD, getString(R.string.playback_forward), R.drawable.ic_playback_forward);
        }
        int st = s.loading ? PlaybackState.STATE_BUFFERING : s.playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
        ps.setActions(actions).setState(st, s.positionMs >= 0 ? s.positionMs : PlaybackState.PLAYBACK_POSITION_UNKNOWN,
            s.playing && !s.loading ? s.speed : 0f, SystemClock.elapsedRealtime());
        session.setPlaybackState(ps.build());
        session.setActive(true);

        foreground(build(s));

        boolean active = s.playing || s.loading;
        if (active) wakeLock.acquire(6 * 60 * 60 * 1000L);
        else if (wakeLock.isHeld()) wakeLock.release();
        if (active && !noisyRegistered) {
            registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
            noisyRegistered = true;
        } else if (!active && noisyRegistered) {
            unregisterReceiver(noisy);
            noisyRegistered = false;
        }
        handler.removeCallbacks(idleStop);
        if (!active) handler.postDelayed(idleStop, IDLE_MS);
    }

    private PendingIntent action(String a, int code) {
        Intent i = new Intent(this, PlaybackService.class).setAction(a);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification build(NowPlaying s) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            b.setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        boolean playing = s.playing || s.loading;
        b.setSmallIcon(R.drawable.ic_playback)
            .setContentTitle(s.title)
            .setContentText(s.subtitle)
            .setLargeIcon(s.cover)
            .setDeleteIntent(action(STOP, 4))
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(playing)
            .setShowWhen(false)
            .setOnlyAlertOnce(true);
        if (s.color != 0) b.setColor(s.color);
        int back = s.speech ? R.drawable.ic_playback_previous : R.drawable.ic_playback_back;
        int fwd = s.speech ? R.drawable.ic_playback_next : R.drawable.ic_playback_forward;
        b.addAction(new Notification.Action.Builder(Icon.createWithResource(this, back), getString(R.string.playback_back), action(BACK, 1)).build());
        b.addAction(playing
            ? new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_playback_pause), getString(R.string.playback_pause), action(PAUSE, 2)).build()
            : new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_playback_play), getString(R.string.playback_play), action(PLAY, 2)).build());
        b.addAction(new Notification.Action.Builder(Icon.createWithResource(this, fwd), getString(R.string.playback_forward), action(FORWARD, 3)).build());
        b.setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        return b.build();
    }

    private void foreground(Notification n) {
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(NOTIFICATION_ID, n);
        } catch (Exception e) {
            // Not allowed right now (background start): at least keep the notification current
            try { getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, n); } catch (Exception ignored) {}
        }
    }

    private void cleanup() {
        handler.removeCallbacks(idleStop);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (noisyRegistered) {
            try { unregisterReceiver(noisy); } catch (Exception ignored) {}
            noisyRegistered = false;
        }
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
    }

    private void shutdown() {
        cleanup();
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
        if (instance == this) instance = null;
    }
}
