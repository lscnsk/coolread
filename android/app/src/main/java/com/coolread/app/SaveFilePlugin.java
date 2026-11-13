package com.coolread.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Saves a file from the web layer into the phone's Downloads folder (the deck skin template).
 * Android 10 and later need no permission for this; older versions get the app's own folder.
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    @PluginMethod
    public void toDownloads(PluginCall call) {
        String name = call.getString("name", "file");
        String mime = call.getString("mime", "application/octet-stream");
        String data = call.getString("base64", "");
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            String where;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver cr = getContext().getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new Exception("no place in Downloads");
                try (OutputStream out = cr.openOutputStream(uri)) { out.write(bytes); }
                where = "Downloads/" + name;
            } else {
                File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                File f = new File(dir, name);
                try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
                where = f.getAbsolutePath();
            }
            JSObject r = new JSObject(); r.put("path", where); call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}
