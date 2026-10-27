package com.coolread.app;

import android.content.res.AssetManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Reads text aloud with the built-in Silero "eugene" voice (see SileroTts), stored in
 * assets/voices/silero-eugene.
 *
 * The web layer hands over the sentences of the chapter on screen (speak) and, when the
 * queue asks for them, of the following chapters (append). Speaker plays them by itself,
 * so reading goes on with the screen off, and reports which word is being said ("speech"
 * events) for highlighting; "need" asks for the next chapter.
 */
@CapacitorPlugin(name = "ReadAloud")
public class ReadAloudPlugin extends Plugin {

    private static final String ASSET_VOICES = "voices";

    // One thread: the engine is not thread safe and sentences must come out in order
    private final ExecutorService engineThread = Executors.newSingleThreadExecutor();

    private SileroTts silero;
    private String sileroVoice;
    private Speaker speaker;
    private volatile String voice = "";

    private String[] builtInVoices() {
        try {
            String[] list = getContext().getAssets().list(ASSET_VOICES);
            return list == null ? new String[0] : list;
        } catch (IOException e) {
            return new String[0];
        }
    }

    /** "silero-eugene" → "Eugene" */
    private static String niceName(String id) {
        String s = id.replaceFirst("^silero-", "");
        if (s.isEmpty()) return id;
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    @PluginMethod
    public void listVoices(PluginCall call) {
        JSArray voices = new JSArray();
        for (String id : builtInVoices()) {
            JSObject v = new JSObject();
            v.put("id", id);
            v.put("name", niceName(id));
            v.put("lang", "ru");
            v.put("builtIn", true);
            voices.put(v);
        }
        JSObject ret = new JSObject();
        ret.put("voices", voices);
        call.resolve(ret);
    }

    private int threads() {
        return Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors() - 1));
    }

    /** Runs on engineThread. */
    private SileroTts engine(String id) throws Exception {
        if (silero != null && id.equals(sileroVoice)) return silero;
        if (silero != null) {
            silero.close();
            silero = null;
        }
        boolean known = false;
        for (String b : builtInVoices()) known |= b.equals(id);
        if (!known) throw new IOException("voice not found");
        AssetManager am = getContext().getAssets();
        String dir = ASSET_VOICES + "/" + id + "/";
        silero = new SileroTts(new SileroTts.Assets() {
            @Override
            public InputStream open(String name) throws IOException {
                return am.open(dir + name);
            }

            @Override
            public java.nio.ByteBuffer model(String name) throws IOException {
                // Models are stored uncompressed, so they can be mapped straight from the APK
                try (android.content.res.AssetFileDescriptor fd = am.openFd(dir + name);
                     java.io.FileInputStream in = fd.createInputStream()) {
                    return in.getChannel().map(java.nio.channels.FileChannel.MapMode.READ_ONLY, fd.getStartOffset(), fd.getLength());
                }
            }
        }, threads());
        sileroVoice = id;
        return silero;
    }

    /** Loads a voice ahead of time so the first sentence starts quickly. */
    @PluginMethod
    public void prepare(PluginCall call) {
        String id = call.getString("voice", "");
        engineThread.submit(() -> {
            try {
                engine(id);
                call.resolve();
            } catch (Throwable e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        });
    }

    // ---- Reading ----

    private final android.os.Handler main = new android.os.Handler(android.os.Looper.getMainLooper());

    /** Speaker lives on the main thread; plugin calls arrive on another one. */
    private void ui(PluginCall call, Runnable r) {
        main.post(() -> {
            try {
                r.run();
                if (!call.isKeptAlive()) call.resolve();
            } catch (Throwable e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        });
    }

    private Speaker speaker() {
        if (speaker == null) {
            speaker = new Speaker(getContext(), engineThread, text -> engine(voice).synthesize(text), new Speaker.Listener() {
                @Override
                public void onState(String state) {
                    JSObject o = new JSObject();
                    o.put("state", state);
                    notifyListeners("speech", o);
                }

                @Override
                public void onPosition(int chapter, int index, int word) {
                    JSObject o = new JSObject();
                    o.put("chapter", chapter);
                    o.put("index", index);
                    o.put("word", word);
                    notifyListeners("speech", o);
                }

                @Override
                public void onNeed(int chapter) {
                    JSObject o = new JSObject();
                    o.put("chapter", chapter);
                    notifyListeners("need", o);
                }

                @Override
                public void onSpeed(float speed) {
                    JSObject o = new JSObject();
                    o.put("speed", speed);
                    notifyListeners("speech", o);
                }
            });
        }
        return speaker;
    }

    private static List<Speaker.Item> items(PluginCall call) {
        int chapter = call.getInt("chapter", 0);
        JSArray arr = call.getArray("sentences");
        List<Speaker.Item> list = new ArrayList<>();
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) list.add(new Speaker.Item(chapter, i, arr.optString(i, "")));
        }
        return list;
    }

    /** Starts reading a chapter's sentences from `start`. */
    @PluginMethod
    public void speak(PluginCall call) {
        voice = call.getString("voice", "");
        PlaybackService.NowPlaying np = NowPlayingPlugin.info(call.getObject("info", new JSObject()));
        List<Speaker.Item> list = items(call);
        ui(call, () -> {
            Speaker s = speaker();
            s.setSpeed(call.getFloat("speed", 1f));
            s.start(list, call.getInt("start", 0), call.getBoolean("last", false), np, call.getString("title", ""));
        });
    }

    /** The next chapter, after a "need" event (no sentences and last: the book is over). */
    @PluginMethod
    public void append(PluginCall call) {
        List<Speaker.Item> list = items(call);
        ui(call, () -> speaker().append(list, call.getBoolean("last", false), call.getString("title", "")));
    }

    @PluginMethod
    public void pauseSpeech(PluginCall call) {
        ui(call, () -> { if (speaker != null && speaker.active()) speaker.pause(); });
    }

    /** Resumes a pause; resumed is false when there is nothing to resume. */
    @PluginMethod
    public void resumeSpeech(PluginCall call) {
        main.post(() -> {
            boolean ok = speaker != null && speaker.active();
            if (ok) speaker.resume();
            JSObject ret = new JSObject();
            ret.put("resumed", ok);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void skipSpeech(PluginCall call) {
        ui(call, () -> { if (speaker != null && speaker.active()) speaker.skip(call.getInt("delta", 1)); });
    }

    @PluginMethod
    public void setSpeechSpeed(PluginCall call) {
        ui(call, () -> speaker().setSpeed(call.getFloat("speed", 1f)));
    }

    @PluginMethod
    public void stopSpeech(PluginCall call) {
        ui(call, () -> { if (speaker != null) speaker.stop(); });
    }

    @Override
    protected void handleOnDestroy() {
        main.post(() -> { if (speaker != null) speaker.stop(); });
        super.handleOnDestroy();
    }
}
