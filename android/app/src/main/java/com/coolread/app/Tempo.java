package com.coolread.app;

/**
 * Changes the speed of speech without changing its pitch.
 *
 * Speech is made of repeating periods (the pitch of the voice). To speed it up, periods are
 * left out, cross-fading over the gap; to slow it down, periods are said twice. This is the
 * usual way to do it (Android's own speed setting works the same); it is done here because
 * phones differ in how they keep a track's speed setting, and some lose it after a pause.
 *
 * Mono, 16 bit. Sound is written in and read out in pieces; the speed may change in between.
 */
final class Tempo {
    private final int minPeriod, maxPeriod, need, skip;
    private float speed = 1f;
    private short[] in = new short[1 << 14], out = new short[1 << 14];
    private int inCount, outCount;
    // Samples to pass through unchanged before the next period is left out or repeated
    private int copy;
    private final float[] low;

    Tempo(int rate) {
        // Voices are between 65 and 400 Hz
        minPeriod = rate / 400;
        maxPeriod = rate / 65;
        need = 2 * maxPeriod;
        // The period is first looked for in a coarse copy of the sound (4 kHz)
        skip = Math.max(1, rate / 4000);
        low = new float[need / skip];
    }

    void setSpeed(float s) {
        speed = Math.max(0.1f, Math.min(s, 10f));
    }

    void write(short[] samples, int n) {
        if (inCount + n > in.length) in = java.util.Arrays.copyOf(in, Math.max(in.length * 2, inCount + n));
        System.arraycopy(samples, 0, in, inCount, n);
        inCount += n;
        process();
    }

    /** Moves up to max samples of finished sound to the buffer; how many were moved. */
    int read(short[] buffer, int max) {
        int n = Math.min(max, outCount);
        System.arraycopy(out, 0, buffer, 0, n);
        System.arraycopy(out, n, out, 0, outCount - n);
        outCount -= n;
        return n;
    }

    /** The end of the sound: what is still held back is finished (with a moment of silence after it). */
    void flush() {
        write(new short[2 * need], 2 * need);
        inCount = 0;
        copy = 0;
    }

    private void room(int n) {
        if (outCount + n > out.length) out = java.util.Arrays.copyOf(out, Math.max(out.length * 2, outCount + n));
    }

    private void pass(int pos, int n) {
        room(n);
        System.arraycopy(in, pos, out, outCount, n);
        outCount += n;
    }

    /** n samples that fade from the sound at `down` into the sound at `up`. */
    private void fade(int n, int down, int up) {
        room(n);
        for (int i = 0; i < n; i++) out[outCount + i] = (short) ((in[down + i] * (long) (n - i) + in[up + i] * (long) i) / n);
        outCount += n;
    }

    private void process() {
        float s = speed;
        int pos = 0;
        if (Math.abs(s - 1f) < 0.0001f) {
            pass(0, inCount);
            pos = inCount;
            copy = 0;
        } else {
            while (inCount - pos >= need) {
                if (copy > 0) {
                    int n = Math.min(copy, need);
                    pass(pos, n);
                    pos += n;
                    copy -= n;
                    continue;
                }
                int period = period(pos);
                if (s > 1f) {
                    // Leave a period out
                    int n;
                    if (s >= 2f) n = Math.max(1, (int) (period / (s - 1f)));
                    else {
                        n = period;
                        copy = (int) (period * (2f - s) / (s - 1f));
                    }
                    fade(n, pos, pos + period);
                    pos += period + n;
                } else {
                    // Say a period twice
                    int n;
                    if (s < 0.5f) n = Math.max(1, (int) (period * s / (1f - s)));
                    else {
                        n = period;
                        copy = (int) (period * (2f * s - 1f) / (1f - s));
                    }
                    pass(pos, period);
                    fade(n, pos + period, pos);
                    pos += n;
                }
            }
        }
        System.arraycopy(in, pos, in, 0, inCount - pos);
        inCount -= pos;
    }

    /** Length of the period of the voice at pos: the shift at which the sound best matches itself. */
    private int period(int pos) {
        for (int i = 0; i < low.length; i++) {
            int sum = 0;
            for (int k = 0; k < skip; k++) sum += in[pos + i * skip + k];
            low[i] = sum / (float) skip;
        }
        int coarse = best(low, 0, Math.max(1, minPeriod / skip), maxPeriod / skip, 1, null) * skip;
        if (skip == 1) return coarse;
        // Then exactly, around what was found
        return best(null, pos, Math.max(minPeriod, coarse - skip), Math.min(maxPeriod, coarse + skip), 4, in);
    }

    private static int best(float[] f, int pos, int from, int to, int stride, short[] s) {
        int best = from;
        double bestDiff = Double.MAX_VALUE;
        for (int p = from; p <= to; p++) {
            double diff = 0;
            if (f != null) for (int i = 0; i < p; i += stride) diff += Math.abs(f[i] - f[i + p]);
            else for (int i = 0; i < p; i += stride) diff += Math.abs(s[pos + i] - s[pos + i + p]);
            // Per sample: a longer period is not worse for having more samples to differ
            if (diff * best < bestDiff * p) {
                bestDiff = diff;
                best = p;
            }
        }
        return best;
    }
}
