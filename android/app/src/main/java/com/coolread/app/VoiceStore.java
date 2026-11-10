package com.coolread.app;

import android.content.Context;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Voices are not part of the APK (the models are about 85 MB): a voice is downloaded from
 * GitHub the first time read aloud is used and kept in the app's own storage
 * (files/voices/&lt;id&gt;). Every file is checked against its SHA-256 before it is accepted,
 * and an interrupted download carries on from where it stopped.
 */
final class VoiceStore {

    static final class Part {
        final String name, sha256;
        final long size;

        Part(String name, long size, String sha256) {
            this.name = name;
            this.size = size;
            this.sha256 = sha256;
        }
    }

    static final class Voice {
        final String id, name, lang, base;
        final Part[] parts;

        Voice(String id, String name, String lang, String base, Part... parts) {
            this.id = id;
            this.name = name;
            this.lang = lang;
            this.base = base;
            this.parts = parts;
        }

        long size() {
            long n = 0;
            for (Part p : parts) n += p.size;
            return n;
        }
    }

    interface Progress {
        void at(long received, long total);
    }

    // The files live in this repository's history. The address names a commit, not a branch,
    // so it keeps working whatever happens to the files later.
    static final Voice[] VOICES = {
        new Voice("silero-eugene", "Eugene", "ru",
            "https://raw.githubusercontent.com/lscnsk/coolread/3df975934cb512de29b55a925893e466c1ee3e34/android/app/src/main/assets/voices/silero-eugene/",
            new Part("front.onnx", 14809783L, "c460886f350d70425fbf5a7ace4469b02843c5c29affca4c9ca06f9b78ae2a36"),
            new Part("back.onnx", 35038415L, "9ad20ede1d0449dd82e13dcaae7cbf3c37068f700096d2b3291fb3945ac50308"),
            new Part("homo.onnx", 32402793L, "f1b8ae6ec4aaf0a27966fb8fbaa873fdc01eb4589b1a5a40b33e73ba874fa6ea"),
            new Part("accentor.bin", 2170180L, "874a241509b112d0e88efccfbba327203150c86fa35829598e9a388846774be3"),
            new Part("exceptions.txt", 444305L, "fae88ef2ffc2cb22494b94367d4f5d92f4972944694f2f9f2900fadcd2c0fc22"),
            new Part("homodict.txt", 85927L, "1cce43a685413d00dde123e1e2fbc9582833e27d419303a4fac62cb8b2710cb5"),
            new Part("ngrams.txt", 1087501L, "dc298d0c05a79d4f7d6f013e5093e23d26d154b82409ce274a080c1d448f702b"),
            new Part("vocab.txt", 1080681L, "851c34d3ef9ced9b227ff748198b95a34d5197091450c6f075741a6fb643ba3a")),
    };

    private static final String PARTIAL = ".part";

    private VoiceStore() {}

    static Voice find(String id) {
        for (Voice v : VOICES) if (v.id.equals(id)) return v;
        return null;
    }

    static File dir(Context ctx, String id) {
        return new File(new File(ctx.getFilesDir(), "voices"), id);
    }

    /** Every file is in place. A file gets its final name only after its checksum matched. */
    static boolean installed(Context ctx, Voice v) {
        File dir = dir(ctx, v.id);
        for (Part p : v.parts) {
            File f = new File(dir, p.name);
            if (!f.isFile() || f.length() != p.size) return false;
        }
        return true;
    }

    /** Bytes already on the phone, finished files and the unfinished one. */
    private static long have(File dir, Voice v) {
        long n = 0;
        for (Part p : v.parts) {
            File f = new File(dir, p.name);
            if (f.isFile() && f.length() == p.size) n += p.size;
            else n += Math.min(p.size, new File(dir, p.name + PARTIAL).length());
        }
        return n;
    }

    /** Downloads what is missing. Throws InterruptedException when cancelled. */
    static void download(Context ctx, Voice v, Progress progress, AtomicBoolean cancelled) throws IOException, InterruptedException {
        download(dir(ctx, v.id), v, progress, cancelled);
    }

    static void download(File dir, Voice v, Progress progress, AtomicBoolean cancelled) throws IOException, InterruptedException {
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("no storage");
        long total = v.size();
        long need = total - have(dir, v);
        if (dir.getUsableSpace() < need + (16L << 20)) throw new IOException("no space");
        long[] received = {total - need};
        progress.at(received[0], total);
        for (Part p : v.parts) {
            File f = new File(dir, p.name);
            if (f.isFile() && f.length() == p.size) continue;
            File part = new File(dir, p.name + PARTIAL);
            // Two tries: a file that fails its checksum is thrown away and fetched again once
            for (int attempt = 0; ; attempt++) {
                long before = part.length();
                fetch(new URL(v.base + p.name), part, p.size, n -> {
                    received[0] += n;
                    progress.at(received[0], total);
                }, cancelled, () -> {
                    // The server started the file over instead of continuing it
                    received[0] -= before;
                });
                if (part.length() == p.size && p.sha256.equals(sha256(part))) break;
                received[0] -= part.length();
                part.delete();
                if (attempt >= 1) throw new IOException("damaged download");
                progress.at(received[0], total);
            }
            if (!part.renameTo(f)) throw new IOException("no storage");
        }
    }

    static void delete(Context ctx, String id) {
        File[] files = dir(ctx, id).listFiles();
        if (files != null) for (File f : files) f.delete();
    }

    private interface Count {
        void add(long n);
    }

    private static void fetch(URL url, File part, long size, Count count, AtomicBoolean cancelled, Runnable restarted) throws IOException, InterruptedException {
        long start = part.length();
        if (start > size) {
            part.delete();
            restarted.run();
            start = 0;
        }
        if (start == size) return;
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        try {
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            c.setInstanceFollowRedirects(true);
            // The checksum is of the file as stored, so ask for it unpacked
            c.setRequestProperty("Accept-Encoding", "identity");
            if (start > 0) c.setRequestProperty("Range", "bytes=" + start + "-");
            int code = c.getResponseCode();
            boolean append = code == HttpURLConnection.HTTP_PARTIAL;
            if (code != HttpURLConnection.HTTP_OK && !append) throw new IOException("server answered " + code);
            if (!append && start > 0) restarted.run();
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part, append)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (cancelled.get()) throw new InterruptedException();
                    out.write(buf, 0, n);
                    count.add(n);
                }
            }
        } finally {
            c.disconnect();
        }
    }

    private static String sha256(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest()) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IOException(e);
        }
    }
}
