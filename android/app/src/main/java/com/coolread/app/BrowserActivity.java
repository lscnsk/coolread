package com.coolread.app;

import android.annotation.SuppressLint;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import com.getcapacitor.JSObject;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * A plain browser window. Whatever a site offers as a download is saved into
 * the app and handed to the library, the same way as a file opened with the app.
 */
public class BrowserActivity extends AppCompatActivity {

    public static final String EXTRA_URL = "url";
    public static final String EXTRA_BG = "bg";
    public static final String EXTRA_FG = "fg";

    private WebView webView;
    private TextView titleView;
    private ProgressBar progress;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    // Files a page builds in memory (blob: links) arrive in base64 pieces
    private final Map<String, BlobDownload> blobDownloads = new HashMap<>();
    // Finished downloads go to the library together when the browser closes
    private final List<JSObject> finished = new ArrayList<>();
    private boolean closed = false;

    private void complete(JSObject file) {
        synchronized (finished) {
            if (closed) {
                // The browser was closed while this download ran: hand it over on its own
                List<JSObject> one = new ArrayList<>();
                one.add(file);
                IncomingFilesPlugin.deliver(one);
            } else {
                finished.add(file);
            }
        }
    }

    private static class BlobDownload {
        File file;
        OutputStream out;
        String name;
        String mime;
    }

    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int bg = parseColor(getIntent().getStringExtra(EXTRA_BG), 0xFF23211F);
        int fg = parseColor(getIntent().getStringExtra(EXTRA_FG), 0xFFFFFFF0);
        getWindow().setStatusBarColor(bg);

        float dp = getResources().getDisplayMetrics().density;
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(bg);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding((int) (4 * dp), 0, (int) (4 * dp), 0);
        bar.setBackgroundColor(bg);

        TextView back = barButton("⬅️", dp);
        back.setOnClickListener(v -> { if (webView.canGoBack()) webView.goBack(); });
        TextView forward = barButton("➡️", dp);
        forward.setOnClickListener(v -> { if (webView.canGoForward()) webView.goForward(); });
        TextView reload = barButton("🔄", dp);
        reload.setOnClickListener(v -> webView.reload());
        TextView close = barButton("❌", dp);
        close.setOnClickListener(v -> finish());

        titleView = new TextView(this);
        titleView.setTextColor(fg);
        titleView.setTextSize(13);
        titleView.setSingleLine(true);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        titleView.setTypeface(Typeface.SERIF);
        titleView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        titleView.setLayoutParams(titleParams);

        bar.addView(back);
        bar.addView(forward);
        bar.addView(titleView);
        bar.addView(reload);
        bar.addView(close);
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (int) (52 * dp)));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(ColorStateList.valueOf(fg));
        root.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (int) (3 * dp)));

        webView = new WebView(this);
        root.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setSupportMultipleWindows(false); // links meant for a new tab open here
        s.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new BlobBridge(), "CoolReadDownloads");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                // Only web pages here; other links (intent:, tg:, mailto:) are ignored
                return !"http".equals(scheme) && !"https".equals(scheme);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // Pages often revoke a blob link right after clicking it; give us time to read it
                view.evaluateJavascript(
                    "if(!window.__crKeep){window.__crKeep=1;const r=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=u=>setTimeout(()=>r(u),120000);" +
                    // Remember the file name a page gives its download link (<a download="Chapter 1.cbz">)
                    "window.__crNames={};const note=a=>{try{if(a&&a.href&&a.hasAttribute&&a.hasAttribute('download')&&a.download)window.__crNames[a.href]=a.download;}catch(e){}};" +
                    "const c=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){note(this);return c.apply(this,arguments);};" +
                    "const d=EventTarget.prototype.dispatchEvent;EventTarget.prototype.dispatchEvent=function(e){if(this instanceof HTMLAnchorElement)note(this);return d.apply(this,arguments);};" +
                    "document.addEventListener('click',e=>{const a=e.target&&e.target.closest&&e.target.closest('a');note(a);},true);}",
                    null
                );
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress >= 100 ? View.INVISIBLE : View.VISIBLE);
            }

            @Override
            public void onReceivedTitle(WebView view, String title) {
                titleView.setText(title);
            }
        });
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                readBlobInPage(url, name, mimeType);
            } else {
                downloadHttp(url, userAgent, name, mimeType);
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack();
                else finish();
            }
        });

        String url = getIntent().getStringExtra(EXTRA_URL);
        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else if (url != null) webView.loadUrl(url);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        synchronized (finished) {
            closed = true;
            IncomingFilesPlugin.deliver(new ArrayList<>(finished));
            finished.clear();
        }
        for (BlobDownload d : blobDownloads.values()) {
            try { d.out.close(); } catch (Exception ignored) {}
            d.file.delete();
        }
        blobDownloads.clear();
        webView.destroy();
        super.onDestroy();
    }

    private TextView barButton(String emoji, float dp) {
        TextView b = new TextView(this);
        b.setText(emoji);
        b.setTextSize(20);
        b.setGravity(Gravity.CENTER);
        b.setPadding((int) (8 * dp), (int) (6 * dp), (int) (8 * dp), (int) (6 * dp));
        return b;
    }

    private static int parseColor(String s, int fallback) {
        try { return Color.parseColor(s); } catch (Exception e) { return fallback; }
    }

    private void toast(String text) {
        runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_SHORT).show());
    }

    private static String safeName(String name) {
        String n = name == null || name.isEmpty() ? "download" : name.replaceAll("[\\\\/:*?\"<>|]", "_");
        return n.length() > 150 ? n.substring(n.length() - 150) : n;
    }

    private static String fixExtension(String name, String mime) {
        if (name.contains(".") && !name.endsWith(".bin")) return name;
        String ext = mime == null ? null : MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
        if (ext == null) return name;
        return (name.endsWith(".bin") ? name.substring(0, name.length() - 4) : name) + "." + ext;
    }

    /** Ordinary download link: fetched here with the page's cookies. */
    private void downloadHttp(String url, String userAgent, String name, String mime) {
        toast("⬇️ " + name);
        String referer = webView.getUrl();
        executor.submit(() -> {
            File dest = null;
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(60000);
                conn.setInstanceFollowRedirects(true);
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) conn.setRequestProperty("Cookie", cookies);
                if (userAgent != null) conn.setRequestProperty("User-Agent", userAgent);
                if (referer != null) conn.setRequestProperty("Referer", referer);
                if (conn.getResponseCode() >= 400) throw new Exception("HTTP " + conn.getResponseCode());
                String finalName = fixExtension(safeName(URLUtil.guessFileName(conn.getURL().toString(), conn.getHeaderField("Content-Disposition"), conn.getContentType() != null ? conn.getContentType() : mime)), mime);
                if (finalName.startsWith("downloadfile")) finalName = fixExtension(safeName(name), mime);
                dest = new File(IncomingFilesPlugin.incomingDir(this), System.nanoTime() + "_" + finalName);
                try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(dest)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                complete(IncomingFilesPlugin.describe(dest, finalName, mime));
                toast("✅ " + finalName);
            } catch (Exception e) {
                if (dest != null) dest.delete();
                toast("Download failed: " + name);
            }
        });
    }

    /** A file the page built in memory: the page reads it and passes it here in pieces. */
    private void readBlobInPage(String url, String name, String mime) {
        String id = "d" + System.nanoTime();
        String js = "(async function(){" +
            "const id=" + jsString(id) + ";" +
            "try{" +
            "const r=await fetch(" + jsString(url) + ");const b=await r.blob();" +
            "let n=(window.__crNames||{})[" + jsString(url) + "]||b.name||'';" +
            // No name from the page: use the page title, numbered so chapters keep their order
            "if(!n){window.__crN=(window.__crN||0)+1;n=(document.title||'download').trim().slice(0,80)+' '+String(window.__crN).padStart(3,'0');}" +
            "CoolReadDownloads.start(id,n,b.type||" + jsString(mime == null ? "" : mime) + ");" +
            "const step=512*1024;" +
            "for(let i=0;i<b.size;i+=step){" +
            "const buf=new Uint8Array(await b.slice(i,i+step).arrayBuffer());let s='';" +
            "for(let j=0;j<buf.length;j+=0x8000){s+=String.fromCharCode.apply(null,buf.subarray(j,j+0x8000));}" +
            "CoolReadDownloads.chunk(id,btoa(s));}" +
            "CoolReadDownloads.finish(id);" +
            "}catch(e){CoolReadDownloads.fail(id,String(e));}})();";
        webView.evaluateJavascript(js, null);
    }

    private static String jsString(String s) {
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ") + "'";
    }

    private class BlobBridge {
        @JavascriptInterface
        public void start(String id, String name, String mime) {
            try {
                BlobDownload d = new BlobDownload();
                d.name = fixExtension(safeName(name), mime);
                d.mime = mime;
                d.file = new File(IncomingFilesPlugin.incomingDir(BrowserActivity.this), System.nanoTime() + "_" + d.name);
                d.out = new FileOutputStream(d.file);
                synchronized (blobDownloads) { blobDownloads.put(id, d); }
                toast("⬇️ " + d.name);
            } catch (Exception e) {
                toast("Download failed");
            }
        }

        @JavascriptInterface
        public void chunk(String id, String base64) {
            BlobDownload d;
            synchronized (blobDownloads) { d = blobDownloads.get(id); }
            if (d == null) return;
            try {
                d.out.write(Base64.decode(base64, Base64.DEFAULT));
            } catch (Exception e) {
                fail(id, e.toString());
            }
        }

        @JavascriptInterface
        public void finish(String id) {
            BlobDownload d;
            synchronized (blobDownloads) { d = blobDownloads.remove(id); }
            if (d == null) return;
            try {
                d.out.close();
                complete(IncomingFilesPlugin.describe(d.file, d.name, d.mime));
                toast("✅ " + d.name);
            } catch (Exception e) {
                d.file.delete();
                toast("Download failed");
            }
        }

        @JavascriptInterface
        public void fail(String id, String error) {
            BlobDownload d;
            synchronized (blobDownloads) { d = blobDownloads.remove(id); }
            if (d != null) {
                try { d.out.close(); } catch (Exception ignored) {}
                d.file.delete();
            }
            toast("Download failed");
        }
    }
}
