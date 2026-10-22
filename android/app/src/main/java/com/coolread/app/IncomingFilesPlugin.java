package com.coolread.app;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;

/**
 * Receives files opened with the app ("Open with") or shared to it ("Share").
 * Each file is copied into the cache folder and reported to the web layer with
 * a "filesReceived" event, which waits until the web layer starts listening.
 */
@CapacitorPlugin(name = "IncomingFiles")
public class IncomingFilesPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    // Lets the built-in browser hand over the files it downloaded
    private static IncomingFilesPlugin instance;

    @Override
    public void load() {
        instance = this;
        handleIntent(getActivity().getIntent());
    }

    /** Folder where received files wait until the web layer imports them. */
    public static File incomingDir(android.content.Context context) {
        File dir = new File(context.getCacheDir(), "incoming");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    /** Describes a file saved in the incoming folder. */
    public static JSObject describe(File file, String name, String mimeType) {
        JSObject f = new JSObject();
        f.put("path", file.getAbsolutePath());
        f.put("name", name);
        f.put("mimeType", mimeType == null ? "" : mimeType);
        return f;
    }

    /** Reports files already saved in the incoming folder as one batch (used by BrowserActivity). */
    public static void deliver(List<JSObject> list) {
        IncomingFilesPlugin plugin = instance;
        if (plugin == null || list.isEmpty()) return;
        JSArray files = new JSArray();
        for (JSObject f : list) files.put(f);
        JSObject event = new JSObject();
        event.put("files", files);
        plugin.notifyListeners("filesReceived", event, true);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleIntent(intent);
    }

    @SuppressWarnings("deprecation")
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        final List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            uris.add(intent.getData());
        } else if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) uris.add(uri);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        }
        if (uris.isEmpty()) return;

        // Consume the intent so a restart of the activity does not import twice
        intent.setAction(Intent.ACTION_MAIN);
        intent.setData(null);
        intent.removeExtra(Intent.EXTRA_STREAM);

        executor.submit(() -> {
            JSArray files = new JSArray();
            for (Uri uri : uris) {
                JSObject file = copyToCache(uri);
                if (file != null) files.put(file);
            }
            if (files.length() == 0) return;
            JSObject event = new JSObject();
            event.put("files", files);
            notifyListeners("filesReceived", event, true);
        });
    }

    private JSObject copyToCache(Uri uri) {
        String name = null;
        try (Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) name = cursor.getString(idx);
            }
        } catch (Exception ignored) {}
        if (name == null || name.isEmpty()) {
            name = uri.getLastPathSegment();
        }
        if (name == null || name.isEmpty()) name = "file";
        name = name.replaceAll("[\\\\/:*?\"<>|]", "_");

        File dir = new File(getContext().getCacheDir(), "incoming");
        if (!dir.exists() && !dir.mkdirs()) return null;
        File dest = new File(dir, System.nanoTime() + "_" + name);
        try (InputStream in = getContext().getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(dest)) {
            if (in == null) return null;
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        } catch (Exception e) {
            dest.delete();
            return null;
        }
        JSObject file = new JSObject();
        file.put("path", dest.getAbsolutePath());
        file.put("name", name);
        String mime = getContext().getContentResolver().getType(uri);
        file.put("mimeType", mime == null ? "" : mime);
        return file;
    }

    /** Deletes the cached copies once the web layer has imported them. */
    @PluginMethod
    public void remove(PluginCall call) {
        JSONArray paths = call.getArray("paths");
        File dir = new File(getContext().getCacheDir(), "incoming");
        if (paths != null) {
            for (int i = 0; i < paths.length(); i++) {
                File f = new File(paths.optString(i));
                if (f.getParentFile() != null && f.getParentFile().equals(dir)) f.delete();
            }
        }
        call.resolve();
    }
}
