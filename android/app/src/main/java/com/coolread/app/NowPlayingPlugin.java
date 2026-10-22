package com.coolread.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The player notification for audiobooks, which play in the web layer: it shows what
 * is playing and passes the button presses back as "action" events.
 */
@CapacitorPlugin(name = "NowPlaying")
public class NowPlayingPlugin extends Plugin implements PlaybackService.Controller {

    private static String lastCover;
    private static Bitmap lastBitmap;

    /** title, subtitle, cover (data URL) and color (#rrggbb) from the web layer. */
    static PlaybackService.NowPlaying info(JSObject o) {
        PlaybackService.NowPlaying np = new PlaybackService.NowPlaying();
        np.title = o.getString("title", "");
        np.subtitle = o.getString("subtitle", "");
        np.cover = cover(o.getString("cover", null));
        try {
            String c = o.getString("color", null);
            if (c != null) np.color = Color.parseColor(c);
        } catch (Exception ignored) {}
        return np;
    }

    private static synchronized Bitmap cover(String dataUrl) {
        if (dataUrl == null || dataUrl.isEmpty()) return null;
        if (dataUrl.equals(lastCover)) return lastBitmap;
        Bitmap b = null;
        try {
            int comma = dataUrl.indexOf(',');
            byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            b = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception ignored) {}
        lastCover = dataUrl;
        lastBitmap = b;
        return b;
    }

    @PluginMethod
    public void update(PluginCall call) {
        PlaybackService.NowPlaying np = info(call.getData());
        np.playing = call.getBoolean("playing", false);
        np.loading = call.getBoolean("loading", false);
        Double pos = call.getDouble("position");
        Double dur = call.getDouble("duration");
        if (pos != null) np.positionMs = Math.round(pos * 1000);
        if (dur != null && dur > 0) np.durationMs = Math.round(dur * 1000);
        np.speed = call.getFloat("speed", 1f);
        getActivity().runOnUiThread(() -> {
            PlaybackService.update(getContext(), np, this);
            call.resolve();
        });
    }

    @PluginMethod
    public void clear(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            PlaybackService.end(this);
            call.resolve();
        });
    }

    @Override
    public void onAction(String action, long arg) {
        JSObject o = new JSObject();
        o.put("action", action);
        o.put("position", arg / 1000.0);
        notifyListeners("action", o);
    }

    @Override
    protected void handleOnDestroy() {
        PlaybackService.end(this);
        super.handleOnDestroy();
    }
}
