package com.coolread.app;

import android.content.Intent;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Opens a web page in the built-in browser (BrowserActivity). */
@CapacitorPlugin(name = "WebBrowser")
public class BrowserPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("No url");
            return;
        }
        Intent intent = new Intent(getContext(), BrowserActivity.class);
        intent.putExtra(BrowserActivity.EXTRA_URL, url);
        intent.putExtra(BrowserActivity.EXTRA_BG, call.getString("background", "#23211f"));
        intent.putExtra(BrowserActivity.EXTRA_FG, call.getString("foreground", "#fffff0"));
        getActivity().startActivity(intent);
        call.resolve();
    }
}
