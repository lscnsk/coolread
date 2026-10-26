package com.coolread.app;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;
import java.io.BufferedReader;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.ByteBuffer;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Silero TTS v5 (Russian), voice "eugene", running on ONNX Runtime.
 *
 * The original model is a PyTorch package; its networks were exported to ONNX and the Python
 * text processing (stress and "ё" placement, homograph choice) is reproduced here step by step:
 *  - front.onnx: characters → durations and encoder output
 *  - back.onnx: encoder output stretched by the durations → spectrum (decoder and vocoder)
 *  - homo.onnx: small BERT that picks the reading of a homograph ("з+амок" or "зам+ок")
 *  - accentor.bin: n-gram model that puts stress and "ё" on every other word
 * The spectrum is turned into sound here (inverse FFT with overlap-add).
 */
final class SileroTts implements AutoCloseable {

    interface Assets {
        InputStream open(String name) throws IOException;
        ByteBuffer model(String name) throws IOException;
    }

    static final class Result {
        float[] audio;
        /** Start time in seconds of each whitespace-separated word of the input, or -1 if it is not spoken. */
        double[] marks;
    }

    static final int SAMPLE_RATE = 48000;
    private static final int HOP = 600, NFFT = 2400, BINS = NFFT / 2 + 1, SPEAKER = 3, DIM = 128;
    private static final String SYMBOLS = "_~|!+,-.:;?абвгдежзийклмнопрстуфхцчшщъыьэюяё–… ";
    private static final String VOWELS = "аоуыэиеяёю";
    private static final Pattern HOMO_WORD = Pattern.compile("(?=.*[а-яё])[а-яё+]+", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    private final OrtEnvironment env;
    private final OrtSession front, back, homo;

    // Accentor
    private final Map<String, Integer> ngrams = new HashMap<>();
    private final int unkGram;
    private final byte[] embQ;
    private final float embScale, embZero;
    private final int embDim;
    private final float[][][] stressClf = new float[4][][], yoClf = new float[4][][];
    private final Map<String, int[]> exceptions = new HashMap<>();

    // Homographs
    private final Map<String, String[]> homodict = new HashMap<>();
    private final Map<String, Integer> vocab = new HashMap<>();
    private final int unkId, clsId, sepId, homoStart, homoEnd;

    private final double[] window = new double[NFFT], cosT = new double[NFFT], sinT = new double[NFFT];
    private static final int[] FACTORS = {5, 5, 3, 2, 2, 2, 2, 2};

    SileroTts(Assets assets, int threads) throws IOException, OrtException {
        env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions opts = new OrtSession.SessionOptions();
        opts.setIntraOpNumThreads(Math.max(1, threads));
        opts.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        front = env.createSession(assets.model("front.onnx"), opts);
        back = env.createSession(assets.model("back.onnx"), opts);
        homo = env.createSession(assets.model("homo.onnx"), opts);

        String[] grams = readText(assets, "ngrams.txt").split("\n", -1);
        for (int i = 0; i < grams.length; i++) ngrams.put(grams[i], i);
        unkGram = ngrams.get("UNK");
        try (DataInputStream in = new DataInputStream(new java.io.BufferedInputStream(assets.open("accentor.bin")))) {
            int rows = Integer.reverseBytes(in.readInt());
            embDim = Integer.reverseBytes(in.readInt());
            embScale = Float.intBitsToFloat(Integer.reverseBytes(in.readInt()));
            embZero = Float.intBitsToFloat(Integer.reverseBytes(in.readInt()));
            embQ = new byte[rows * embDim];
            in.readFully(embQ);
            for (float[][][] clf : new float[][][][] {stressClf, yoClf}) {
                for (int l = 0; l < 4; l++) {
                    int out = Integer.reverseBytes(in.readInt()), inn = Integer.reverseBytes(in.readInt());
                    float[] w = readFloats(in, out * inn), b = readFloats(in, out);
                    float[][] layer = new float[out + 1][];
                    for (int o = 0; o < out; o++) layer[o] = Arrays.copyOfRange(w, o * inn, (o + 1) * inn);
                    layer[out] = b;
                    clf[l] = layer;
                }
            }
        }
        for (String line : readText(assets, "exceptions.txt").split("\n")) {
            String[] p = line.split(" ");
            if (p.length == 3) exceptions.put(p[0], new int[] {Integer.parseInt(p[1]), Integer.parseInt(p[2])});
        }
        for (String line : readText(assets, "homodict.txt").split("\n")) {
            String[] p = line.split("\t");
            if (p.length > 1) {
                String[] v = Arrays.copyOfRange(p, 1, p.length);
                Arrays.sort(v);
                homodict.put(p[0], v);
            }
        }
        String[] tokens = readText(assets, "vocab.txt").split("\n", -1);
        for (int i = 0; i < tokens.length; i++) vocab.put(tokens[i], i);
        unkId = vocab.get("[UNK]");
        clsId = vocab.get("[CLS]");
        sepId = vocab.get("[SEP]");
        homoStart = vocab.get("[HOMO]");
        homoEnd = vocab.get("[/HOMO]");

        for (int n = 0; n < NFFT; n++) {
            window[n] = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / NFFT);
            cosT[n] = Math.cos(2 * Math.PI * n / NFFT);
            sinT[n] = Math.sin(2 * Math.PI * n / NFFT);
        }
    }

    private static String readText(Assets a, String name) throws IOException {
        try (InputStream in = a.open(name)) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    private static float[] readFloats(DataInputStream in, int n) throws IOException {
        byte[] b = new byte[n * 4];
        in.readFully(b);
        float[] f = new float[n];
        ByteBuffer.wrap(b).order(java.nio.ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(f);
        return f;
    }

    @Override
    public void close() {
        try { front.close(); } catch (Exception ignored) {}
        try { back.close(); } catch (Exception ignored) {}
        try { homo.close(); } catch (Exception ignored) {}
    }

    // ---- Text ----

    /** Lower case, only the characters the model knows, words separated by single spaces. */
    static String clean(String s) {
        s = s.toLowerCase(Locale.ROOT).replace('—', '–').replace('‑', '-');
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (Character.isWhitespace(c)) b.append(' ');
            else if (c != '_' && c != '~' && c != '|' && SYMBOLS.indexOf(c) >= 0) b.append(c);
        }
        return b.toString().trim().replaceAll(" +", " ");
    }

    private static final String[] LATIN = {
        "а", "б", "к", "д", "е", "ф", "г", "х", "и", "дж", "к", "л", "м", "н", "о", "п", "к", "р", "с", "т", "у", "в", "в", "кс", "й", "з"
    };

    /** What Silero would drop: digits become words, Latin letters become Russian ones. */
    static String spellOut(String token) {
        StringBuilder b = new StringBuilder();
        String t = token.replace("%", " процентов ").replace("№", " номер ").replace("&", " и ").replace("+", " плюс ");
        Matcher m = Pattern.compile("\\d+").matcher(t);
        int last = 0;
        while (m.find()) {
            b.append(t, last, m.start()).append(' ').append(number(m.group())).append(' ');
            last = m.end();
        }
        b.append(t.substring(last));
        String s = b.toString().toLowerCase(Locale.ROOT);
        s = s.replace("sh", "ш").replace("ch", "ч").replace("th", "т").replace("ph", "ф").replace("kh", "х").replace("zh", "ж").replace("ck", "к").replace("oo", "у").replace("ee", "и");
        StringBuilder r = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= 'a' && c <= 'z') r.append(LATIN[c - 'a']);
            else r.append(c);
        }
        return r.toString();
    }

    private static final String[] ONES = {"ноль", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"};
    private static final String[] TEENS = {"десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"};
    private static final String[] TENS = {"", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"};
    private static final String[] HUNDREDS = {"", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"};
    private static final String[][] SCALES = {
        {"тысяча", "тысячи", "тысяч"}, {"миллион", "миллиона", "миллионов"}, {"миллиард", "миллиарда", "миллиардов"}
    };

    static String number(String digits) {
        String d = digits.replaceFirst("^0+(?=\\d)", "");
        if (d.length() > 12 || (digits.length() > 1 && digits.charAt(0) == '0')) {
            StringBuilder b = new StringBuilder();
            for (char c : digits.toCharArray()) b.append(b.length() > 0 ? " " : "").append(ONES[c - '0']);
            return b.toString();
        }
        long n = Long.parseLong(d);
        if (n == 0) return ONES[0];
        List<String> words = new ArrayList<>();
        int[] groups = new int[4];
        for (int i = 0; i < 4; i++) { groups[i] = (int) (n % 1000); n /= 1000; }
        for (int g = 3; g >= 0; g--) {
            int v = groups[g];
            if (v == 0) continue;
            // "тысяча девятьсот…", not "одна тысяча девятьсот…"
            if (!(g == 1 && v == 1)) triple(v, g == 1, words);
            if (g > 0) {
                int t = v % 100, u = v % 10;
                String[] f = SCALES[g - 1];
                words.add(t >= 11 && t <= 14 ? f[2] : u == 1 ? f[0] : u >= 2 && u <= 4 ? f[1] : f[2]);
            }
        }
        return String.join(" ", words);
    }

    private static void triple(int v, boolean feminine, List<String> out) {
        if (v / 100 > 0) out.add(HUNDREDS[v / 100]);
        int t = v % 100;
        if (t >= 10 && t < 20) { out.add(TEENS[t - 10]); return; }
        if (t / 10 > 1) out.add(TENS[t / 10]);
        int u = t % 10;
        if (u > 0) out.add(feminine && u == 1 ? "одна" : feminine && u == 2 ? "две" : ONES[u]);
    }

    // ---- Homographs (HomoSolver) ----

    private String solveHomographs(String sentence) throws OrtException {
        Matcher m = HOMO_WORD.matcher(sentence);
        List<int[]> spans = new ArrayList<>();
        List<String> words = new ArrayList<>();
        List<Long> logits = new ArrayList<>();
        List<Float> values = new ArrayList<>();
        while (m.find()) {
            String word = m.group();
            if (!homodict.containsKey(word.toLowerCase(Locale.ROOT))) continue;
            String marked = sentence.substring(0, m.start()) + " [HOMO] " + word + " [/HOMO] " + sentence.substring(m.end());
            long[] ids = bertIds(marked);
            int s = -1, e = -1;
            for (int i = 0; i < ids.length; i++) {
                if (s < 0 && ids[i] == homoStart) s = i;
                if (e < 0 && ids[i] == homoEnd) e = i;
            }
            float logit;
            try (OnnxTensor ti = OnnxTensor.createTensor(env, LongBuffer.wrap(ids), new long[] {1, ids.length});
                 OnnxTensor ts = OnnxTensor.createTensor(env, new long[] {s});
                 OnnxTensor te = OnnxTensor.createTensor(env, new long[] {e});
                 OrtSession.Result r = homo.run(map3("ids", ti, "start", ts, "end", te))) {
                logit = ((float[]) r.get(0).getValue())[0];
            }
            spans.add(new int[] {m.start(), m.end()});
            words.add(word);
            values.add(logit);
        }
        if (spans.isEmpty()) return sentence;
        String out = sentence;
        int offset = 0;
        for (int i = 0; i < spans.size(); i++) {
            int start = spans.get(i)[0] + offset, end = spans.get(i)[1] + offset;
            String word = words.get(i);
            // round(sigmoid(logit)) picks the second (sorted) reading when the logit is positive
            int pred = values.get(i) > 0 ? 1 : 0;
            String[] variants = homodict.get(word.toLowerCase(Locale.ROOT));
            String pick = variants[Math.min(pred, variants.length - 1)];
            int stressIdx = pick.indexOf('+');
            String plain = pick.replace("+", "");
            StringBuilder cased = new StringBuilder();
            for (int k = 0; k < Math.min(word.length(), plain.length()); k++) {
                char c1 = word.charAt(k), c2 = plain.charAt(k);
                cased.append(Character.isLowerCase(c1) ? Character.toLowerCase(c2) : Character.toUpperCase(c2));
            }
            String w = cased.toString();
            // Stress goes on every word, one-vowel words too
            w = w.substring(0, stressIdx) + "+" + w.substring(stressIdx);
            offset += 1;
            out = out.substring(0, start) + w + out.substring(end);
        }
        return out;
    }

    private static Map<String, OnnxTensor> map3(String a, OnnxTensor x, String b, OnnxTensor y, String c, OnnxTensor z) {
        Map<String, OnnxTensor> m = new HashMap<>();
        m.put(a, x);
        m.put(b, y);
        m.put(c, z);
        return m;
    }

    private static boolean isPunct(char c) {
        if ((c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126)) return true;
        switch (Character.getType(c)) {
            case Character.CONNECTOR_PUNCTUATION: case Character.DASH_PUNCTUATION: case Character.START_PUNCTUATION:
            case Character.END_PUNCTUATION: case Character.INITIAL_QUOTE_PUNCTUATION: case Character.FINAL_QUOTE_PUNCTUATION:
            case Character.OTHER_PUNCTUATION:
                return true;
            default:
                return false;
        }
    }

    /** BERT tokenizer of the homograph model: split on spaces and punctuation, then WordPiece. */
    private long[] bertIds(String text) {
        List<String> basic = new ArrayList<>();
        for (String tok : text.trim().split("\\s+")) {
            if (tok.isEmpty()) continue;
            if (tok.equals("[HOMO]") || tok.equals("[/HOMO]")) { basic.add(tok); continue; }
            StringBuilder cur = null;
            for (int i = 0; i < tok.length(); i++) {
                char c = tok.charAt(i);
                if (isPunct(c)) {
                    if (cur != null) { basic.add(cur.toString()); cur = null; }
                    basic.add(String.valueOf(c));
                } else {
                    if (cur == null) cur = new StringBuilder();
                    cur.append(c);
                }
            }
            if (cur != null) basic.add(cur.toString());
        }
        List<Long> ids = new ArrayList<>();
        ids.add((long) clsId);
        for (String tok : basic) {
            if (tok.length() > 100) { ids.add((long) unkId); continue; }
            List<Long> sub = new ArrayList<>();
            int start = 0;
            boolean bad = false;
            while (start < tok.length()) {
                int end = tok.length();
                Integer found = null;
                while (start < end) {
                    String piece = (start > 0 ? "##" : "") + tok.substring(start, end);
                    found = vocab.get(piece);
                    if (found != null) break;
                    end--;
                }
                if (found == null) { bad = true; break; }
                sub.add((long) found);
                start = end;
            }
            if (bad) ids.add((long) unkId);
            else ids.addAll(sub);
        }
        ids.add((long) sepId);
        long[] r = new long[ids.size()];
        for (int i = 0; i < r.length; i++) r[i] = ids.get(i);
        return r;
    }

    // ---- Stress and "ё" (AccentorNgram) ----

    private float[][] accentPredict(String word) {
        String w = "<" + word + ">";
        List<Integer> idx = new ArrayList<>();
        for (int n = 1; n <= word.length() + 3; n++) {
            for (int i = 0; i + n <= w.length(); i++) {
                Integer id = ngrams.get(w.substring(i, i + n));
                if (id != null) idx.add(id);
            }
        }
        if (word.length() < 1) {
            Integer id = ngrams.get(word);
            if (id != null) idx.add(id);
        }
        if (idx.isEmpty()) idx.add(unkGram);
        float[] e = new float[embDim];
        for (int id : idx) {
            int o = id * embDim;
            for (int k = 0; k < embDim; k++) e[k] += embScale * (embQ[o + k] - embZero);
        }
        for (int k = 0; k < embDim; k++) e[k] /= idx.size();
        return new float[][] {softmax(mlp(stressClf, e)), softmax(mlp(yoClf, e))};
    }

    private static float[] mlp(float[][][] layers, float[] x) {
        for (int l = 0; l < layers.length; l++) {
            float[][] L = layers[l];
            int out = L.length - 1;
            float[] y = new float[out];
            for (int o = 0; o < out; o++) {
                float s = L[out][o];
                float[] w = L[o];
                for (int i = 0; i < w.length; i++) s += w[i] * x[i];
                y[o] = l < layers.length - 1 ? Math.max(0f, s) : s;
            }
            x = y;
        }
        return x;
    }

    private static float[] softmax(float[] x) {
        float m = Float.NEGATIVE_INFINITY;
        for (float v : x) m = Math.max(m, v);
        double s = 0;
        float[] r = new float[x.length];
        for (int i = 0; i < x.length; i++) { r[i] = (float) Math.exp(x[i] - m); s += r[i]; }
        for (int i = 0; i < x.length; i++) r[i] /= s;
        return r;
    }

    private static int argmax(float[] x) {
        int b = 0;
        for (int i = 1; i < x.length; i++) if (x[i] > x[b]) b = i;
        return b;
    }

    private static int countVowels(String s) {
        int n = 0;
        for (int i = 0; i < s.length(); i++) if (VOWELS.indexOf(s.charAt(i)) >= 0) n++;
        return n;
    }

    private static String keepCyrillic(String s) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if ((c >= 'А' && c <= 'я') || c == 'ё' || c == 'Ё') b.append(c);
        }
        return b.toString();
    }

    private String accentuate(String sentence) {
        List<String> raw = new ArrayList<>();
        List<Boolean> mask = new ArrayList<>();
        Matcher sp = Pattern.compile("\\s+").matcher(sentence);
        List<String> pieces = new ArrayList<>();
        int last = 0;
        while (sp.find()) {
            pieces.add(sentence.substring(last, sp.start()));
            pieces.add(sp.group());
            last = sp.end();
        }
        pieces.add(sentence.substring(last));
        for (String word : pieces) {
            String[] parts = word.split("-", -1);
            if (parts.length == 1) {
                raw.add(word);
                mask.add(true);
            } else {
                for (int i = 0; i < parts.length - 1; i++) { raw.add(parts[i] + "-"); mask.add(true); }
                raw.add(parts[parts.length - 1]);
                mask.add(!parts[parts.length - 1].equals("то"));
            }
        }
        StringBuilder out = new StringBuilder();
        for (int wi = 0; wi < raw.size(); wi++) {
            String rawWord = raw.get(wi);
            String clean = keepCyrillic(rawWord.toLowerCase(Locale.ROOT));
            if (!mask.get(wi) || clean.isEmpty()) { out.append(rawWord); continue; }
            String lower = rawWord.toLowerCase(Locale.ROOT);
            boolean haveStress = lower.indexOf('+') >= 0, haveYo = lower.indexOf('ё') >= 0;
            if (haveStress && haveYo) { out.append(rawWord); continue; }
            if (!haveStress && haveYo) {
                StringBuilder w = new StringBuilder(rawWord);
                int ins = 0;
                for (int i = 0; i < lower.length(); i++) if (lower.charAt(i) == 'ё') { w.insert(i + ins, '+'); ins++; }
                out.append(w);
                continue;
            }
            int[] exc = exceptions.get(clean);
            if (exc != null) { out.append(exception(rawWord, exc, haveStress)); continue; }

            float[][] p = accentPredict(clean);
            int stressPred = argmax(p[0]), yoPred = argmax(p[1]);
            boolean setStress = p[0][stressPred] > 0.5f && !haveStress;
            boolean setYo = p[1][yoPred] > 0.5f;
            List<Integer> stressIds = new ArrayList<>();
            if (haveStress) for (String part : lower.split("\\+", -1)) stressIds.add(countVowels(part));
            else stressIds.add(stressPred);

            List<Integer> vowelIds = new ArrayList<>(), yeIds = new ArrayList<>();
            for (int i = 0; i < lower.length(); i++) {
                if (VOWELS.indexOf(lower.charAt(i)) >= 0) vowelIds.add(i);
                if (lower.charAt(i) == 'е') yeIds.add(i);
            }
            if (vowelIds.isEmpty()) { out.append(rawWord); continue; }
            List<Integer> stressPos = new ArrayList<>();
            for (int id : stressIds) if (id < vowelIds.size()) stressPos.add(vowelIds.get(id));
            List<Integer> yoPos = new ArrayList<>();
            if (yoPred > 0 && yoPred - 1 < yeIds.size()) yoPos.add(yeIds.get(yoPred - 1));
            String word = rawWord;
            for (int pos : yoPos) {
                if (stressPos.contains(pos) && setYo && lower.charAt(pos) == 'е') {
                    word = word.substring(0, pos) + (Character.isLowerCase(word.charAt(pos)) ? 'ё' : 'Ё') + word.substring(pos + 1);
                }
            }
            if (vowelIds.size() == 1) {
                stressPos.clear();
                stressPos.add(vowelIds.get(0));
                setStress = true;
            }
            if (!haveStress && setStress) {
                for (int i = 0; i < stressPos.size(); i++) {
                    int pos = stressPos.get(i) + i;
                    word = word.substring(0, pos) + "+" + word.substring(pos);
                }
            }
            out.append(word);
        }
        return out.toString();
    }

    private static String exception(String rawWord, int[] exc, boolean haveStress) {
        int stress = exc[0], yo = exc[1];
        if (haveStress) {
            List<Integer> marks = new ArrayList<>();
            for (int i = 0; i < rawWord.length(); i++) if (rawWord.charAt(i) == '+') marks.add(i);
            String w = rawWord.replace("+", "");
            if (yo != -1 && marks.contains(yo + 1) && yo < w.length()) {
                w = w.substring(0, yo) + (Character.isLowerCase(w.charAt(yo)) ? 'ё' : 'Ё') + w.substring(yo + 1);
            }
            for (int pos : marks) w = w.substring(0, Math.min(pos, w.length())) + "+" + w.substring(Math.min(pos, w.length()));
            return w;
        }
        String w = rawWord;
        if (yo != -1 && yo < w.length()) w = w.substring(0, yo) + (Character.isLowerCase(w.charAt(yo)) ? 'ё' : 'Ё') + w.substring(yo + 1);
        int s = Math.min(stress, w.length());
        return w.substring(0, s) + "+" + w.substring(s);
    }

    /** The text exactly as the model reads it: stress marks and "ё" in place. */
    String prepare(String sentence) throws OrtException {
        return accentuate(solveHomographs(sentence));
    }

    // ---- Speech ----

    Result synthesize(String text) throws OrtException {
        String[] tokens = text.trim().isEmpty() ? new String[0] : text.trim().split("\\s+");
        int[] tokenWord = new int[tokens.length];
        StringBuilder sb = new StringBuilder();
        int words = 0;
        for (int i = 0; i < tokens.length; i++) {
            String c = clean(spellOut(RomanNumerals.say(tokens, i)));
            if (c.isEmpty()) { tokenWord[i] = -1; continue; }
            if (sb.length() > 0) sb.append(' ');
            tokenWord[i] = words;
            for (int k = 0; k < c.length(); k++) if (c.charAt(k) == ' ') words++;
            words++;
            sb.append(c);
        }
        String sentence = sb.toString();
        Result res = new Result();
        res.marks = new double[tokens.length];
        Arrays.fill(res.marks, -1);
        boolean hasText = false;
        for (int i = 0; i < sentence.length() && !hasText; i++) {
            char c = sentence.charAt(i);
            hasText = (c >= 'а' && c <= 'я') || c == '-';
        }
        if (!hasText) {
            res.audio = new float[SAMPLE_RATE / 4];
            return res;
        }

        if (sentence.length() > 1200) sentence = sentence.substring(0, 1200);
        String said = prepare(sentence);
        String seqText = "|" + said + "~";
        int T = seqText.length();
        long[] seq = new long[T];
        for (int i = 0; i < T; i++) seq[i] = Math.max(0, SYMBOLS.indexOf(seqText.charAt(i)));

        float[] logDur;
        float[] enc;
        try (OnnxTensor ts = OnnxTensor.createTensor(env, LongBuffer.wrap(seq), new long[] {1, T});
             OnnxTensor tk = OnnxTensor.createTensor(env, new long[] {SPEAKER})) {
            Map<String, OnnxTensor> in = new HashMap<>();
            in.put("seq", ts);
            in.put("spk", tk);
            try (OrtSession.Result r = front.run(in)) {
                logDur = toArray(((OnnxTensor) r.get(0)).getFloatBuffer());
                enc = toArray(((OnnxTensor) r.get(1)).getFloatBuffer());
            }
        }

        // Durations in frames, with the same limits as the original model
        int[] dur = new int[T];
        for (int i = 0; i < T; i++) {
            float d = (float) Math.exp(logDur[i]) - 1f;
            dur[i] = (int) Math.rint(Math.max(0f, d));
        }
        dur[0] = Math.min(dur[0], 5);
        dur[T - 1] = Math.min(dur[T - 1], 7);
        dur[T - 2] = 13;
        dur[T - 3] = Math.min(dur[T - 3], 13);
        int frames = 0;
        for (int d : dur) frames += d;
        frames = Math.min(frames, 4990);

        // Word starts: where each word's first character begins
        int[] cum = new int[T + 1];
        for (int i = 0; i < T; i++) cum[i + 1] = cum[i] + dur[i];
        List<Integer> wordStart = new ArrayList<>();
        wordStart.add(cum[1]);
        for (int i = 0; i < said.length(); i++) if (said.charAt(i) == ' ') wordStart.add(cum[i + 2]);
        for (int i = 0; i < tokens.length; i++) {
            int w = tokenWord[i];
            if (w >= 0 && w < wordStart.size()) res.marks[i] = wordStart.get(w) * (double) HOP / SAMPLE_RATE;
        }

        float[] x = new float[frames * DIM];
        int f = 0;
        for (int i = 0; i < T && f < frames; i++) {
            for (int k = 0; k < dur[i] && f < frames; k++, f++) System.arraycopy(enc, i * DIM, x, f * DIM, DIM);
        }
        float[] re, im;
        try (OnnxTensor tx = OnnxTensor.createTensor(env, FloatBuffer.wrap(x), new long[] {1, frames, DIM})) {
            Map<String, OnnxTensor> in = new HashMap<>();
            in.put("x", tx);
            try (OrtSession.Result r = back.run(in)) {
                re = toArray(((OnnxTensor) r.get(0)).getFloatBuffer());
                im = toArray(((OnnxTensor) r.get(1)).getFloatBuffer());
            }
        }
        res.audio = istft(re, im, frames);
        return res;
    }

    private static float[] toArray(FloatBuffer b) {
        float[] a = new float[b.remaining()];
        b.get(a);
        return a;
    }

    // ---- Spectrum to sound ----

    /** Inverse STFT ("same" padding): re/im are [BINS][frames], row-major. */
    private float[] istft(float[] re, float[] im, int frames) {
        int len = (frames - 1) * HOP + NFFT, pad = (NFFT - HOP) / 2;
        double[] y = new double[len], envl = new double[len];
        double[] zr = new double[NFFT], zi = new double[NFFT], or = new double[NFFT], oi = new double[NFFT];
        // Two real frames per complex transform: ifft(A + iB) = a + ib
        for (int t = 0; t < frames; t += 2) {
            boolean two = t + 1 < frames;
            Arrays.fill(zr, 0);
            Arrays.fill(zi, 0);
            for (int k = 0; k < BINS; k++) {
                double ar = re[k * frames + t], ai = (k == 0 || k == NFFT / 2) ? 0 : im[k * frames + t];
                double br = two ? re[k * frames + t + 1] : 0, bi = two && k != 0 && k != NFFT / 2 ? im[k * frames + t + 1] : 0;
                // Hermitian completion of each spectrum, then Z = A + iB
                zr[k] += ar - bi;
                zi[k] += ai + br;
                if (k > 0 && k < NFFT / 2) {
                    int j = NFFT - k;
                    zr[j] += ar + bi;
                    zi[j] += -ai + br;
                }
            }
            fft(zr, zi, or, oi);
            for (int n = 0; n < NFFT; n++) {
                double w = window[n];
                y[t * HOP + n] += or[n] / NFFT * w;
                envl[t * HOP + n] += w * w;
                if (two) {
                    y[(t + 1) * HOP + n] += oi[n] / NFFT * w;
                    envl[(t + 1) * HOP + n] += w * w;
                }
            }
        }
        float[] out = new float[len - 2 * pad];
        for (int i = 0; i < out.length; i++) {
            double e = envl[i + pad];
            out[i] = (float) (e > 1e-11 ? y[i + pad] / e : 0);
        }
        return out;
    }

    /** Inverse DFT of length 2400 (mixed radix 5·5·3·2⁵), unscaled. */
    private void fft(double[] inR, double[] inI, double[] outR, double[] outI) {
        fftRec(inR, inI, 0, 1, outR, outI, 0, NFFT, 0);
    }

    private void fftRec(double[] inR, double[] inI, int inOff, int stride, double[] outR, double[] outI, int outOff, int n, int fi) {
        if (n == 1) {
            outR[outOff] = inR[inOff];
            outI[outOff] = inI[inOff];
            return;
        }
        int p = FACTORS[fi], m = n / p;
        for (int q = 0; q < p; q++) fftRec(inR, inI, inOff + q * stride, stride * p, outR, outI, outOff + q * m, m, fi + 1);
        int step = NFFT / n;
        double[] tr = new double[p], ti = new double[p];
        for (int k = 0; k < m; k++) {
            for (int q = 0; q < p; q++) {
                // Twiddle W_n^(q·k), inverse direction (+)
                int e = (q * k * step) % NFFT;
                double c = cosT[e], s = sinT[e];
                double xr = outR[outOff + q * m + k], xi = outI[outOff + q * m + k];
                tr[q] = xr * c - xi * s;
                ti[q] = xr * s + xi * c;
            }
            for (int s2 = 0; s2 < p; s2++) {
                double sr = 0, si = 0;
                for (int q = 0; q < p; q++) {
                    int e = (int) (((long) q * s2 * m * step) % NFFT);
                    double c = cosT[e], s = sinT[e];
                    sr += tr[q] * c - ti[q] * s;
                    si += tr[q] * s + ti[q] * c;
                }
                outR[outOff + k + s2 * m] = sr;
                outI[outOff + k + s2 * m] = si;
            }
        }
    }
}
