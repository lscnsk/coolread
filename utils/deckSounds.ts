// Mechanical sounds of the cassette deck, synthesised with Web Audio (no sound files):
// key clicks, the cassette going in and the door latching, the eject spring and the motor
// whirring while REW / FF are held. They play quietly over the book's own audio.

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC({ latencyHint: 'interactive' });
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/** A short filtered noise burst: the plastic part of a click */
function tick(c: AudioContext, at: number, freq: number, gain: number, len = 0.018) {
  const src = c.createBufferSource(); src.buffer = noise(c);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.4;
  const g = c.createGain(); g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  src.connect(bp).connect(g).connect(c.destination);
  src.start(at, Math.random() * 0.5); src.stop(at + len + 0.02);
}

/** A low decaying tone: the body of the deck answering a click */
function thump(c: AudioContext, at: number, freq: number, gain: number, len = 0.06) {
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(freq * 1.6, at); o.frequency.exponentialRampToValueAtTime(freq, at + len * 0.5);
  const g = c.createGain(); g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(c.destination); o.start(at); o.stop(at + len + 0.02);
}

export const deckSounds = {
  /** A key pressed down */
  keyDown() { const c = audio(); if (!c) return; const t = c.currentTime; tick(c, t, 2600, 0.22); thump(c, t, 140, 0.18); },
  /** A key coming back up (lighter) */
  keyUp() { const c = audio(); if (!c) return; const t = c.currentTime; tick(c, t, 3400, 0.1, 0.012); },
  /** PLAY latching: the key locks and the mechanism engages */
  latch() { const c = audio(); if (!c) return; const t = c.currentTime; tick(c, t, 2200, 0.25); thump(c, t, 110, 0.22, 0.09); tick(c, t + 0.07, 1500, 0.12, 0.03); },
  /** STOP while playing: PLAY springs back up, the mechanism lets go of the tape */
  release() { const c = audio(); if (!c) return; const t = c.currentTime; tick(c, t, 2000, 0.28); thump(c, t, 100, 0.22, 0.08); tick(c, t + 0.05, 3200, 0.16, 0.015); tick(c, t + 0.09, 1300, 0.1, 0.03); },
  /** The cassette sliding in, seating, and the door snapping shut */
  insert() {
    const c = audio(); if (!c) return; const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noise(c);
    const lp = c.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 900; lp.Q.value = 0.7;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(lp).connect(g).connect(c.destination); src.start(t); src.stop(t + 0.5);
    tick(c, t + 0.5, 1800, 0.25, 0.025); thump(c, t + 0.5, 95, 0.3, 0.1);
    tick(c, t + 1.0, 2800, 0.28, 0.02); thump(c, t + 1.0, 160, 0.2, 0.06);
  },
  /** The eject spring: a click, then the door flipping open */
  eject() {
    const c = audio(); if (!c) return; const t = c.currentTime;
    tick(c, t, 2400, 0.25); thump(c, t, 120, 0.2);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(420, t + 0.08); o.frequency.exponentialRampToValueAtTime(180, t + 0.3);
    const g = c.createGain(); g.gain.setValueAtTime(0.05, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(c.destination); o.start(t + 0.08); o.stop(t + 0.35);
    tick(c, t + 0.32, 1600, 0.18, 0.03);
  },
  /** REW / FF held: the motor and the tape whirring, rising as it speeds up. Returns a stop function. */
  wind(): () => void {
    const c = audio(); if (!c) return () => {};
    const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noise(c); src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2; bp.frequency.setValueAtTime(500, t); bp.frequency.linearRampToValueAtTime(1600, t + 2.5);
    const motor = c.createOscillator(); motor.type = 'sawtooth'; motor.frequency.setValueAtTime(70, t); motor.frequency.linearRampToValueAtTime(140, t + 2.5);
    const mf = c.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 400;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.2);
    const mg = c.createGain(); mg.gain.value = 0.35;
    src.connect(bp).connect(g); motor.connect(mf).connect(mg).connect(g); g.connect(c.destination);
    src.start(t); motor.start(t);
    let stopped = false;
    return () => {
      if (stopped) return; stopped = true;
      const e = c.currentTime;
      g.gain.cancelScheduledValues(e); g.gain.setValueAtTime(g.gain.value, e); g.gain.exponentialRampToValueAtTime(0.0001, e + 0.25);
      bp.frequency.cancelScheduledValues(e); bp.frequency.setValueAtTime(bp.frequency.value, e); bp.frequency.linearRampToValueAtTime(300, e + 0.25);
      src.stop(e + 0.3); motor.stop(e + 0.3);
    };
  },
};
