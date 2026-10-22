package com.coolread.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IncomingFilesPlugin.class);
        registerPlugin(BrowserPlugin.class);
        registerPlugin(ReadAloudPlugin.class);
        registerPlugin(NowPlayingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
