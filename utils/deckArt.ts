// Art for the audiobook player ("Tape" mode): deck lids, cassette-box flaps, key faces and
// covers for books without one. Everything is painted on a canvas once and cached as a data URL,
// so switching styles or books costs a few milliseconds only the first time.
import { variantOf } from './styleVariants';

export type DeckKey = 'Cool' | 'Marcel' | 'Bimbo' | 'Surf' | 'Roll' | 'Final' | 'Code' | 'Byte' | 'Mint' | 'Jazz';

/** The deck look for the app's style (an added style wins over its base) */
export function deckKeyOf(appStyle: string, styleName?: string): DeckKey {
  const v = variantOf(styleName);
  if (v) return v.name as DeckKey;
  if (appStyle === 'Dragon') return 'Roll';
  if (appStyle === 'Final Fantasy') return 'Final';
  return (['Cool', 'Marcel', 'Bimbo', 'Surf', 'Final'].includes(appStyle) ? appStyle : 'Cool') as DeckKey;
}

/** Colours and fonts of the deck, cassette and record for each style (CSS custom properties) */
export const DECK_VARS: Record<DeckKey, Record<string, string>> = {
  Cool: { '--bg':'#23211f','--line':'#45413e','--card':'#2c2a28','--text':'#fffff0','--muted':'#8a8680','--accent':'#fffff0','--on-accent':'#1c1c1c','--track':'#3a3734','--door':'#2c2a28','--door-ink':'#fffff0','--deck1':'#36332f','--deck2':'#1d1b19','--key1':'#4a4642','--key2':'#2f2c29','--key-shadow':'#121110','--key-text':'#fffff0','--key-on1':'#fffff0','--key-on2':'#d9d6c8','--key-on-text':'#1c1c1c','--shell1':'#3d3a36','--shell2':'#1c1a18','--window':'#121110','--label':'#f3eedf','--ink':'#2a2622','--label-font':"'Caveat',cursive",'--label-size':'7cqw','--tape':'#5b3b27','--hub':'#ece6dc','--ui':"'Literata',Georgia,serif",'--shell-fx':'none' },
  Marcel: { '--bg':'#F3EFFB','--line':'#C4B5E6','--card':'#ffffff','--text':'#2F2440','--muted':'#766594','--accent':'#544372','--on-accent':'#F3EFFB','--track':'#C4B5E6','--door':'#f6f2fd','--door-ink':'#544372','--deck1':'#ebe5f8','--deck2':'#d3c8ee','--key1':'#ffffff','--key2':'#e6dff5','--key-shadow':'#ac97d7','--key-text':'#544372','--key-on1':'#7a66a0','--key-on2':'#544372','--key-on-text':'#F3EFFB','--shell1':'rgba(196,181,230,.85)','--shell2':'rgba(152,130,200,.9)','--window':'#3a2f4f','--label':'#fffaf3','--ink':'#2F2440','--label-font':"'Parisienne','Caveat',cursive",'--label-size':'7cqw','--tape':'#6b4a3a','--hub':'#f6f2ff','--ui':"'Literata',Georgia,serif",'--shell-fx':'linear-gradient(120deg,rgba(255,255,255,.35),transparent 40%)' },
  Bimbo: { '--bg':'#FFF0F5','--line':'#FBCFE8','--card':'#ffffff','--text':'#BE123C','--muted':'#d9466b','--accent':'#BE123C','--on-accent':'#ffffff','--track':'#FBCFE8','--door':'#ffd6e7','--door-ink':'#BE123C','--deck1':'#ffe4ef','--deck2':'#fbcfe8','--key1':'#ffffff','--key2':'#fde2ee','--key-shadow':'#f9a8d4','--key-text':'#BE123C','--key-on1':'#fb7185','--key-on2':'#e11d48','--key-on-text':'#ffffff','--shell1':'rgba(249,168,212,.92)','--shell2':'rgba(236,72,153,.9)','--window':'#4a1027','--label':'#ffffff','--ink':'#BE123C','--label-font':"'Dancing Script','Caveat',cursive",'--label-size':'6.6cqw','--tape':'#7a3b4a','--hub':'#fff5f9','--ui':"'Literata',Georgia,serif",'--shell-fx':'radial-gradient(circle at 20% 30%,rgba(255,255,255,.7) 0 .4cqw,transparent .6cqw),radial-gradient(circle at 78% 70%,rgba(255,255,255,.6) 0 .3cqw,transparent .5cqw),radial-gradient(circle at 60% 15%,rgba(255,255,255,.6) 0 .3cqw,transparent .5cqw),linear-gradient(120deg,rgba(255,255,255,.35),transparent 45%)' },
  Surf: { '--bg':'#F0F9FF','--line':'#BAE6FD','--card':'#ffffff','--text':'#0C4A6E','--muted':'#0369A1','--accent':'#0ea5e9','--on-accent':'#ffffff','--track':'#e0f2fe','--door':'#ffffff','--door-ink':'#0284c7','--deck1':'#e0f2fe','--deck2':'#bae6fd','--key1':'#ffffff','--key2':'#e0f2fe','--key-shadow':'#7dd3fc','--key-text':'#0284c7','--key-on1':'#38bdf8','--key-on2':'#0284c7','--key-on-text':'#ffffff','--shell1':'rgba(125,211,252,.75)','--shell2':'rgba(14,165,233,.85)','--window':'#0c3550','--label':'#fdf3dc','--ink':'#0c4a6e','--label-font':"'Caveat',cursive",'--label-size':'7.4cqw','--tape':'#6a4a32','--hub':'#ffffff','--ui':"'Literata',Georgia,serif",'--shell-fx':'linear-gradient(120deg,rgba(255,255,255,.45),transparent 45%)' },
  Roll: { '--bg':'#271c19','--line':'#4a2511','--card':'#1a0f0d','--text':'#fcd34d','--muted':'#b45309','--accent':'#ea580c','--on-accent':'#1a0f0d','--track':'#4a2511','--door':'#2e1d18','--door-ink':'#fcd34d','--deck1':'#3d2a22','--deck2':'#1f0f05','--key1':'#5c3c2e','--key2':'#3a1a0e','--key-shadow':'#120806','--key-text':'#fcd34d','--key-on1':'#f59e0b','--key-on2':'#c2410c','--key-on-text':'#1a0f0d','--shell1':'#4a2511','--shell2':'#1a0f0d','--window':'#0f0806','--label':'#f2e3c2','--ink':'#5a0d0d','--label-font':"'Uncial Antiqua','Caveat',cursive",'--label-size':'5.6cqw','--tape':'#3d2418','--hub':'#fcd34d','--ui':"'Literata',Georgia,serif",'--shell-fx':'none' },
  Final: { '--bg':'#0b1d3a','--line':'#2a4a7a','--card':'#13244a','--text':'#f0deba','--muted':'#8faada','--accent':'#cca972','--on-accent':'#0b1d3a','--track':'#17335e','--door':'#132a4e','--door-ink':'#cca972','--deck1':'#17335e','--deck2':'#081832','--key1':'#20447c','--key2':'#132a4e','--key-shadow':'#040c1a','--key-text':'#f0deba','--key-on1':'#dfc894','--key-on2':'#c1a05f','--key-on-text':'#0b1d3a','--shell1':'#1f3358','--shell2':'#0b1c38','--window':'#050d1c','--label':'#f0deba','--ink':'#0b1d3a','--label-font':"'Cinzel','Literata',serif",'--label-size':'5cqw','--tape':'#4a3424','--hub':'#cca972','--ui':"'Literata',Georgia,serif",'--shell-fx':'linear-gradient(#cca97255,#cca97255) top/100% .5cqw no-repeat' },
  Code: { '--bg':'#060b07','--line':'#14532d','--card':'#030604','--text':'#86efac','--muted':'#15803d','--accent':'#22c55e','--on-accent':'#030604','--track':'#0c2414','--door':'#050b07','--door-ink':'#4ade80','--deck1':'#0a1a0f','--deck2':'#030604','--key1':'#0c2414','--key2':'#06120a','--key-shadow':'#000','--key-text':'#86efac','--key-on1':'#4ade80','--key-on2':'#16a34a','--key-on-text':'#030604','--shell1':'#0c1a10','--shell2':'#030604','--window':'#000','--label':'#06120a','--ink':'#86efac','--label-font':"'Share Tech Mono',ui-monospace,monospace",'--label-size':'5.6cqw','--tape':'#1f3a26','--hub':'#4ade80','--ui':"'Share Tech Mono',ui-monospace,monospace",'--shell-fx':'repeating-linear-gradient(transparent 0 .6cqw,rgba(34,197,94,.05) .6cqw 1.2cqw)' },
  Byte: { '--bg':'#170a2b','--line':'#4c1d95','--card':'#1f0c3a','--text':'#fde7ff','--muted':'#c4a1ff','--accent':'#ff4fd8','--on-accent':'#170a2b','--track':'#2a1250','--door':'#1f0c3a','--door-ink':'#5eead4','--deck1':'#2a1250','--deck2':'#0d0519','--key1':'#3b1766','--key2':'#1f0c3a','--key-shadow':'#06020d','--key-text':'#5eead4','--key-on1':'#ff4fd8','--key-on2':'#c026d3','--key-on-text':'#170a2b','--shell1':'rgba(109,40,217,.85)','--shell2':'rgba(42,18,80,.95)','--window':'#0a0414','--label':'#fde7ff','--ink':'#3b1766','--label-font':"'VT323',ui-monospace,monospace",'--label-size':'8cqw','--tape':'#3a2050','--hub':'#5eead4','--ui':"'Literata',Georgia,serif",'--shell-fx':'linear-gradient(120deg,rgba(255,79,216,.25),transparent 45%)' },
  Mint: { '--bg':'#F2F6EC','--line':'#d3e2c1','--card':'#ffffff','--text':'#2E4220','--muted':'#4e7330','--accent':'#6E9A45','--on-accent':'#ffffff','--track':'#e5eeda','--door':'#fbfcf8','--door-ink':'#5b8538','--deck1':'#e5eeda','--deck2':'#d3e2c1','--key1':'#ffffff','--key2':'#e9f1df','--key-shadow':'#b4cf98','--key-text':'#4e7330','--key-on1':'#8db66a','--key-on2':'#5b8538','--key-on-text':'#ffffff','--shell1':'rgba(180,207,152,.85)','--shell2':'rgba(110,154,69,.9)','--window':'#1c2616','--label':'#fbfaf3','--ink':'#2e4220','--label-font':"'Satisfy','Caveat',cursive",'--label-size':'6.6cqw','--tape':'#6a4a32','--hub':'#f5f8f1','--ui':"'Literata',Georgia,serif",'--shell-fx':'linear-gradient(120deg,rgba(255,255,255,.4),transparent 45%)' },
  Jazz: { '--bg':'#0b0b0a','--line':'#3b3220','--card':'#151411','--text':'#f1dfae','--muted':'#a8894c','--accent':'#a8894c','--on-accent':'#0b0b0a','--track':'#211d15','--door':'#13120f','--door-ink':'#d4b46a','--deck1':'#1d1a12','--deck2':'#080807','--key1':'#2a2519','--key2':'#13120f','--key-shadow':'#000','--key-text':'#f1dfae','--key-on1':'#d4b46a','--key-on2':'#a8894c','--key-on-text':'#0b0b0a','--shell1':'#1a1814','--shell2':'#080807','--window':'#050504','--label':'#f1dfae','--ink':'#0b0b0a','--label-font':"'Poiret One',serif",'--label-size':'6cqw','--tape':'#3d2c1c','--hub':'#d4b46a','--ui':"'Literata',Georgia,serif",'--shell-fx':'repeating-linear-gradient(90deg,transparent 0 3cqw,rgba(212,180,106,.08) 3cqw 3.3cqw)' },
};

/* Deck lids: one drawing per style, with a see-through window over the reels (cut = true).
   The same drawing without the window is the flap of the cassette boxes. */
// eslint-disable-next-line
function drawLidCanvas(name: string, H = 400, cut = true): string {
  const W = 600, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  let seed = name.length * 977 + name.charCodeAt(0) * 31; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const rr = (x, y, w, h, rad) => { g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad); g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath(); };
  const lin = (y0, y1, stops) => { const lg = g.createLinearGradient(0, y0, 0, y1); stops.forEach((s, i) => lg.addColorStop(i / (stops.length - 1), s)); return lg; };
  const WX = 60, WY = 48, WW = 480, WH = 188;
  let ink = '#fffff0';

  if (name === 'Cool') {
    ink = '#d9d4c7';
    g.fillStyle = lin(0, H, ['#47433e', '#2a2724', '#1c1a18']); g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 2) { g.fillStyle = `rgba(255,255,255,${r() * .05})`; g.fillRect(0, y, W, 1); }
    g.fillStyle = '#0d0c0b';
    for (const ox of [34, W - 34 - 90]) for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 10; xx++) { g.beginPath(); g.arc(ox + xx * 10 + (yy % 2) * 5, 270 + yy * 10, 2.6, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; rr(14, 14, W - 28, H - 28, 12); g.stroke();
  } else if (name === 'Marcel') {
    ink = '#544372';
    g.fillStyle = '#f7f3fd'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) { const x = r() * W, y = r() * H, R = 60 + r() * 110, rg = g.createRadialGradient(x, y, 0, x, y, R); rg.addColorStop(0, 'rgba(172,151,215,.35)'); rg.addColorStop(1, 'rgba(172,151,215,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
    g.strokeStyle = 'rgba(84,67,114,.7)'; g.lineWidth = 2; rr(16, 16, W - 32, H - 32, 18); g.stroke(); g.lineWidth = 1; rr(26, 26, W - 52, H - 52, 12); g.stroke();
    g.fillStyle = 'rgba(84,67,114,.7)'; for (const [x, y] of [[26, 26], [W - 26, 26], [26, H - 26], [W - 26, H - 26]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
  } else if (name === 'Bimbo') {
    ink = '#ffffff';
    // holographic foil: soft iridescent bands, a crinkle shimmer, four-point sparkles and tiny outlined hearts
    const base = g.createLinearGradient(0, 0, W, H);
    ['#ffd1e8', '#e9d5ff', '#c7f0ff', '#d9ffe8', '#fff1c7', '#ffc8e1', '#e3d2ff'].forEach((c2, i, a) => base.addColorStop(i / (a.length - 1), c2));
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 7; k++) { const y0 = r() * H, amp = 30 + r() * 50, f = .006 + r() * .01, ph = r() * 6, hue = [320, 280, 190, 150, 40][k % 5];
      g.strokeStyle = `hsla(${hue},95%,80%,.55)`; g.lineWidth = 26 + r() * 30; g.beginPath();
      for (let x = -20; x <= W + 20; x += 10) g.lineTo(x, y0 + Math.sin(x * f + ph) * amp + x * .25 - 60); g.stroke(); }
    for (let i = 0; i < 260; i++) { const x = r() * W, y = r() * H, L = 6 + r() * 20, a = r() * Math.PI; g.strokeStyle = `rgba(255,255,255,${.15 + r() * .35})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); }
    const spark = (x, y, s2) => { g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x, y - s2); g.quadraticCurveTo(x, y, x + s2, y); g.quadraticCurveTo(x, y, x, y + s2); g.quadraticCurveTo(x, y, x - s2, y); g.quadraticCurveTo(x, y, x, y - s2); g.fill(); };
    for (let i = 0; i < 26; i++) spark(r() * W, r() * H, 4 + r() * 9);
    spark(110, 300, 20); spark(W - 120, 250, 16); spark(W / 2 + 40, 350, 13);
    g.strokeStyle = 'rgba(236,72,153,.75)'; g.lineWidth = 2;
    const heartO = (x, y, s2) => { g.beginPath(); g.moveTo(x, y + s2 * .9); g.bezierCurveTo(x - s2 * 1.4, y - s2 * .1, x - s2 * .6, y - s2 * 1.1, x, y - s2 * .35); g.bezierCurveTo(x + s2 * .6, y - s2 * 1.1, x + s2 * 1.4, y - s2 * .1, x, y + s2 * .9); g.stroke(); };
    for (const [x, y] of [[200, 270], [W - 230, 320], [60, 380], [W - 50, 190], [330, 220], [260, 360]]) heartO(x, y, 9);
  } else if (name === 'Surf') {
    ink = '#ffffff';
    g.fillStyle = lin(0, H, ['#e0f2fe', '#bae6fd', '#7dd3fc']); g.fillRect(0, 0, W, H);
    const SX = 70, SY = 300; g.fillStyle = '#fde68a'; g.beginPath(); g.arc(SX, SY, 26, 0, 7); g.fill();
    g.strokeStyle = 'rgba(253,230,138,.6)'; g.lineWidth = 3; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.beginPath(); g.moveTo(SX + Math.cos(a) * 34, SY + Math.sin(a) * 34); g.lineTo(SX + Math.cos(a) * 44, SY + Math.sin(a) * 44); g.stroke(); }
    ([['#38bdf8', 300, 12, .018], ['#0ea5e9', 325, 11, .022], ['#0284c7', 350, 10, .016], ['#0c4a6e', 375, 8, .02]] as [string, number, number, number][]).forEach(([col, base, amp, f], k) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 6) g.lineTo(x, base + Math.sin(x * f + k * 1.7) * amp); g.lineTo(W, H); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.beginPath(); for (let x = 0; x <= W; x += 6) g.lineTo(x, base + Math.sin(x * f + k * 1.7) * amp); g.stroke(); });
    g.strokeStyle = '#0c4a6e'; g.lineWidth = 2; for (const [x, y] of [[W - 130, 268], [W - 90, 282]]) { g.beginPath(); g.arc(x - 8, y, 8, Math.PI * 1.1, Math.PI * 1.9); g.arc(x + 8, y, 8, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  } else if (name === 'Roll') {
    ink = '#fcd34d';
    // abstract facets: a jittered triangle mesh, each face shaded by a fake light from the top-left, thin gold edges
    const N = 11, M = 9, pts = [];
    for (let j = 0; j <= M; j++) { pts[j] = []; for (let i = 0; i <= N; i++) { const edge = i === 0 || i === N || j === 0 || j === M;
      pts[j][i] = [i / N * W + (edge && (i === 0 || i === N) ? 0 : (r() - .5) * W / N * .8), j / M * H + (edge && (j === 0 || j === M) ? 0 : (r() - .5) * H / M * .8)]; } }
    const face = (a, b, c) => { const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - a[0], vy = c[1] - a[1], nz = ux * vy - uy * vx;
      const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, shade = .5 + .5 * Math.sin((cx * .9 - cy * 1.3) * .012 + r() * 1.4), warm = cy / H;
      const R = 40 + shade * 150 + warm * 40, G2 = 14 + shade * 60 + warm * 20, B = 8 + shade * 14;
      g.fillStyle = `rgb(${R | 0},${G2 | 0},${B | 0})`; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.closePath(); g.fill();
      g.strokeStyle = `rgba(252,211,77,${.12 + shade * .3})`; g.lineWidth = 1; g.stroke(); };
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) { const p = pts[j][i], q = pts[j][i + 1], s2 = pts[j + 1][i], t = pts[j + 1][i + 1];
      if ((i + j) % 2) { face(p, q, t); face(p, t, s2); } else { face(p, q, s2); face(q, t, s2); } }
    const vg = g.createRadialGradient(W * .3, H * .2, 40, W / 2, H / 2, W * .75); vg.addColorStop(0, 'rgba(255,190,90,.12)'); vg.addColorStop(1, 'rgba(10,3,2,.55)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  } else if (name === 'Final') {
    ink = '#cca972';
    const bg = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * .7); bg.addColorStop(0, '#1f3f72'); bg.addColorStop(1, '#081832'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(240,222,186,${.2 + r() * .7})`; g.beginPath(); g.arc(r() * W, r() * H, r() * 1.6 + .3, 0, 7); g.fill(); }
    const crystal = (x, y, h) => { const cg = g.createLinearGradient(x, y - h, x, y + h * .4); cg.addColorStop(0, 'rgba(240,222,186,.95)'); cg.addColorStop(1, 'rgba(143,170,218,.6)'); g.fillStyle = cg;
      g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + h * .22, y - h * .2); g.lineTo(x, y + h * .4); g.lineTo(x - h * .22, y - h * .2); g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y - h); g.lineTo(x, y + h * .4); g.stroke(); };
    crystal(80, 330, 60); crystal(W - 80, 330, 60);
    g.strokeStyle = '#cca972'; g.lineWidth = 2.5; g.strokeRect(14, 14, W - 28, H - 28); g.lineWidth = 1; g.strokeRect(22, 22, W - 44, H - 44);
    g.fillStyle = '#cca972'; for (const [x, y] of [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]]) { g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 9, y); g.lineTo(x, y + 9); g.lineTo(x - 9, y); g.fill(); }
  } else if (name === 'Code') {
    ink = '#4ade80';
    g.fillStyle = '#020503'; g.fillRect(0, 0, W, H);
    const chars = '01アイウエオカキクケコサシスセソ<>/{}=';
    g.font = '15px "Share Tech Mono", monospace'; g.textAlign = 'center';
    for (let x = 8; x < W; x += 15) { const len = 4 + Math.floor(r() * 18), y0 = Math.floor(r() * H / 15) * 15 - 60;
      for (let k = 0; k < len; k++) { const a = (k + 1) / len; g.fillStyle = k === len - 1 ? '#caffd9' : `rgba(34,197,94,${a * .8})`; g.fillText(chars[Math.floor(r() * chars.length)], x, y0 + k * 15); } }
    g.fillStyle = 'rgba(0,0,0,.28)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  } else if (name === 'Byte') {
    ink = '#5eead4';
    g.fillStyle = '#1a0b33'; g.fillRect(0, 0, W, H);
    const P = 10;
    g.fillStyle = 'rgba(196,161,255,.08)'; for (let x = 0; x < W; x += P) g.fillRect(x, 0, 1, H); for (let y = 0; y < H; y += P) g.fillRect(0, y, W, 1);
    for (let i = 0; i < 60; i++) { g.fillStyle = r() > .5 ? '#fde7ff' : '#5eead4'; g.fillRect(Math.floor(r() * W / P) * P, Math.floor(r() * H / P) * P, P / 2, P / 2); }
    const sprite = (ox, oy, col) => { g.fillStyle = col; for (let y = 0; y < 6; y++) for (let x = 0; x < 3; x++) if (r() > .45) { g.fillRect(ox + (2 + x) * P, oy + y * P, P, P); g.fillRect(ox + (2 - x) * P, oy + y * P, P, P); } };
    sprite(30, 270, '#ff4fd8'); sprite(150, 280, '#5eead4'); sprite(W - 200, 280, '#ff4fd8'); sprite(W - 80, 270, '#5eead4');
    for (let x = 0; x < W; x += P * 2) { g.fillStyle = '#ff4fd8'; g.fillRect(x, H - P * 2, P, P); g.fillStyle = '#6d28d9'; g.fillRect(x + P, H - P * 2, P, P); }
  } else if (name === 'Mint') {
    ink = '#5b8538';
    g.fillStyle = lin(0, H, ['#f7faf2', '#e5eeda']); g.fillRect(0, 0, W, H);
    for (let i = 0; i < 34; i++) { const x = r() * W, y = r() * H, a = r() * Math.PI * 2, L = 18 + r() * 22;
      g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = ['#8db66a', '#6e9a45', '#b4cf98', '#a3c97a'][i % 4];
      g.beginPath(); g.moveTo(-L, 0); g.quadraticCurveTo(0, -L * .55, L, 0); g.quadraticCurveTo(0, L * .55, -L, 0); g.fill();
      g.strokeStyle = 'rgba(46,66,32,.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-L, 0); g.lineTo(L * .9, 0); g.stroke(); g.restore(); }
    g.strokeStyle = 'rgba(91,133,56,.55)'; g.lineWidth = 1.5; rr(16, 16, W - 32, H - 32, 16); g.stroke();
  } else if (name === 'Jazz') {
    ink = '#d4b46a';
    g.fillStyle = '#0b0b0a'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(212,180,106,.35)'; g.lineWidth = 1.2;
    for (let k = 0; k <= 36; k++) { const a = Math.PI + k / 36 * Math.PI; g.beginPath(); g.moveTo(W / 2, H + 30); g.lineTo(W / 2 + Math.cos(a) * 700, H + 30 + Math.sin(a) * 700); g.stroke(); }
    g.strokeStyle = '#d4b46a'; g.lineWidth = 2;
    const step = (i) => { const m = 12 + i * 9, s = 14; g.beginPath(); g.moveTo(m + s, m); g.lineTo(W - m - s, m); g.lineTo(W - m - s, m + s); g.lineTo(W - m, m + s); g.lineTo(W - m, H - m - s); g.lineTo(W - m - s, H - m - s); g.lineTo(W - m - s, H - m); g.lineTo(m + s, H - m); g.lineTo(m + s, H - m - s); g.lineTo(m, H - m - s); g.lineTo(m, m + s); g.lineTo(m + s, m + s); g.closePath(); g.stroke(); };
    step(0); g.lineWidth = 1; step(1);
    for (const sx of [1, -1]) for (let k = 1; k <= 4; k++) { g.beginPath(); g.arc(sx > 0 ? 40 : W - 40, H - 40, k * 14, sx > 0 ? -Math.PI / 2 : Math.PI, sx > 0 ? 0 : Math.PI * 1.5); g.stroke(); }
  }

  // window cut-out, frame and grip
  if (cut) {
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; rr(WX, WY, WW, WH, 14); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 9; rr(WX - 3, WY - 3, WW + 6, WH + 6, 16); g.stroke();
    g.strokeStyle = ink; g.lineWidth = 3; rr(WX - 5, WY - 5, WW + 10, WH + 10, 18); g.stroke();
    g.fillStyle = ink; g.globalAlpha = .55; rr(W / 2 - 42, H - 38, 84, 9, 4.5); g.fill(); g.globalAlpha = 1;
  }
  // grain, same as on the covers
  const d = g.getImageData(0, 0, W, H), px = d.data;
  for (let i = 0; i < px.length; i += 4) { if (!px[i + 3]) continue; const n = (r() - .5) * 18; px[i] += n; px[i + 1] += n; px[i + 2] += n; }
  g.putImageData(d, 0, 0);
  return c.toDataURL('image/png');
}



const cache: Record<string, string> = {};
const memo = (k: string, make: () => string) => cache[k] || (cache[k] = make());
export const lidArt = (key: DeckKey) => memo('lid:' + key, () => drawLidCanvas(key));
export const flapArt = (key: DeckKey) => memo('flap:' + key, () => drawLidCanvas(key, 516, false));

/* Key faces: the style's material (brushed metal, pearl, copper facets…) under the icons */
export function keyFace(key: DeckKey, on = false): string {
  return memo(`key:${key}:${on}`, () => {
    const W = 240, H = 150, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d')!, v = DECK_VARS[key];
    let seed = key.charCodeAt(0) * 131 + (on ? 7 : 3); const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const base = g.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, on ? v['--key-on1'] : v['--key1']); base.addColorStop(1, on ? v['--key-on2'] : v['--key2']);
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    const dark = !['Marcel', 'Bimbo', 'Surf', 'Mint'].includes(key);
    const ink = (a: number) => dark ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * .6})`;
    if (key === 'Cool') {
      for (let y = 0; y < H; y += 1) { g.fillStyle = `rgba(255,255,255,${r() * .07})`; g.fillRect(0, y, W, 1); }
      const sh = g.createRadialGradient(W * .5, -H * .4, 10, W * .5, -H * .4, H * 1.3); sh.addColorStop(0, 'rgba(255,255,255,.16)'); sh.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sh; g.fillRect(0, 0, W, H);
    } else if (key === 'Marcel') {
      for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(122,102,160,${r() * .18})`; g.beginPath(); g.arc(r() * W, r() * H, r() * 1.4, 0, 7); g.fill(); }
      const gl = g.createLinearGradient(0, 0, W, H); gl.addColorStop(0, 'rgba(255,255,255,.5)'); gl.addColorStop(.4, 'rgba(255,255,255,0)'); g.fillStyle = gl; g.fillRect(0, 0, W, H);
    } else if (key === 'Bimbo') {
      const hues = [330, 280, 200, 150, 40];
      for (let k = 0; k < 5; k++) { const x = r() * W, y = r() * H, R = 60 + r() * 60, rg = g.createRadialGradient(x, y, 0, x, y, R); rg.addColorStop(0, `hsla(${hues[k]},90%,85%,${on ? .3 : .45})`); rg.addColorStop(1, `hsla(${hues[k]},90%,85%,0)`); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
      for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(r() * W, r() * H, .6 + r() * 1.2, 0, 7); g.fill(); }
    } else if (key === 'Surf') {
      g.strokeStyle = on ? 'rgba(255,255,255,.35)' : 'rgba(14,165,233,.22)'; g.lineWidth = 2;
      for (let y = 20; y < H; y += 26) { g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, y + Math.sin(x * .05 + y) * 4); g.stroke(); }
      for (let i = 0; i < 18; i++) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1; g.beginPath(); g.arc(r() * W, r() * H, 1.5 + r() * 3, 0, 7); g.stroke(); }
    } else if (key === 'Roll') {
      const N = 6, M = 4, pts: number[][][] = [];
      for (let j = 0; j <= M; j++) { pts[j] = []; for (let i = 0; i <= N; i++) pts[j][i] = [i / N * W + (i % N ? (r() - .5) * 20 : 0), j / M * H + (j % M ? (r() - .5) * 18 : 0)]; }
      const tri = (a: number[], b: number[], d: number[]) => { const s = r(); g.fillStyle = `rgba(${on ? '255,230,160' : '255,170,90'},${.04 + s * .14})`; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill(); g.strokeStyle = 'rgba(252,211,77,.18)'; g.lineWidth = 1; g.stroke(); };
      for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) { tri(pts[j][i], pts[j][i + 1], pts[j + 1][i + 1]); tri(pts[j][i], pts[j + 1][i + 1], pts[j + 1][i]); }
    } else if (key === 'Final') {
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(240,222,186,${.15 + r() * .5})`; g.beginPath(); g.arc(r() * W, r() * H, r() * 1.3 + .3, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(204,169,114,.55)'; g.lineWidth = 2; g.strokeRect(8, 8, W - 16, H - 16);
    } else if (key === 'Code') {
      g.fillStyle = 'rgba(0,0,0,.3)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
      g.fillStyle = on ? 'rgba(3,6,4,.25)' : 'rgba(74,222,128,.12)'; g.font = '12px "Share Tech Mono", monospace';
      for (let i = 0; i < 26; i++) g.fillText(r() > .5 ? '1' : '0', r() * W, r() * H);
    } else if (key === 'Byte') {
      const P = 10; for (let y = 0; y < H; y += P) for (let x = 0; x < W; x += P) if (r() > .82) { g.fillStyle = r() > .5 ? 'rgba(255,79,216,.22)' : 'rgba(94,234,212,.2)'; g.fillRect(x, y, P, P); }
    } else if (key === 'Mint') {
      g.strokeStyle = on ? 'rgba(255,255,255,.3)' : 'rgba(91,133,56,.22)'; g.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) { const x = r() * W, y = r() * H, a = r() * 6, L = 20 + r() * 20; g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(-L, 0); g.quadraticCurveTo(0, -L * .5, L, 0); g.quadraticCurveTo(0, L * .5, -L, 0); g.stroke(); g.restore(); }
    } else if (key === 'Jazz') {
      g.strokeStyle = on ? 'rgba(11,11,10,.25)' : 'rgba(212,180,106,.25)'; g.lineWidth = 1;
      for (let k = 0; k <= 18; k++) { const a = Math.PI + k / 18 * Math.PI; g.beginPath(); g.moveTo(W / 2, H + 10); g.lineTo(W / 2 + Math.cos(a) * 300, H + 10 + Math.sin(a) * 300); g.stroke(); }
    }
    // a soft top light and a darker lower lip, like a moulded key
    const lip = g.createLinearGradient(0, 0, 0, H); lip.addColorStop(0, ink(.14)); lip.addColorStop(.12, 'rgba(255,255,255,0)'); lip.addColorStop(.85, 'rgba(0,0,0,0)'); lip.addColorStop(1, 'rgba(0,0,0,.18)');
    g.fillStyle = lip; g.fillRect(0, 0, W, H);
    const d = g.getImageData(0, 0, W, H), px = d.data;
    for (let i = 0; i < px.length; i += 4) { const n = (r() - .5) * 10; px[i] += n; px[i + 1] += n; px[i + 2] += n; }
    g.putImageData(d, 0, 0);
    return c.toDataURL('image/png');
  });
}

/* A cover for a book that has none: painted gradient and shapes from its title, its name at the bottom.
   The same title always gives the same picture. */
export function generatedCover(title: string, author = ''): string {
  return memo('cover:' + title + '|' + author, () => {
    const S = 480, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!;
    let a = 7; for (const ch of title + author) a = (a * 31 + ch.charCodeAt(0)) % 2147483647; a = a || 7;
    const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    const hue = r() * 360, hsl = (h: number, s: number, l: number) => `hsl(${(h + 360) % 360},${s}%,${l}%)`;
    const pal = [hsl(hue, 55, 72), hsl(hue + 20, 50, 42), hsl(hue + 40, 35, 14)];
    const fig = [hsl(hue - 20, 70, 70), hsl(hue + 30, 60, 48), hsl(hue + 160, 40, 40), hsl(hue + 10, 55, 30), hsl(hue - 10, 45, 85)];
    const bg = g.createLinearGradient(0, 0, 0, S); bg.addColorStop(0, pal[0]); bg.addColorStop(.45, pal[1]); bg.addColorStop(1, pal[2]); g.fillStyle = bg; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 9; i++) { const x = r() * S, y = r() * S * .8, R = S * (.15 + r() * .3); const rg = g.createRadialGradient(x, y, 0, x, y, R);
      rg.addColorStop(0, fig[i % 5].replace('hsl', 'hsla').replace(')', ',.85)')); rg.addColorStop(1, fig[i % 5].replace('hsl', 'hsla').replace(')', ',0)')); g.fillStyle = rg; g.fillRect(0, 0, S, S); }
    g.fillStyle = fig[4]; g.beginPath(); g.ellipse(S * (.45 + r() * .25), S * .62, S * .2, S * .34, r() - .5, 0, Math.PI * 2); g.fill();
    g.fillStyle = fig[1]; g.beginPath(); g.ellipse(S * (.3 + r() * .15), S * .7, S * .16, S * .3, r() - .3, 0, Math.PI * 2); g.fill();
    g.fillStyle = fig[0]; g.beginPath(); g.arc(S * (.2 + r() * .6), S * .22, S * .08, 0, Math.PI * 2); g.fill();
    const d = g.getImageData(0, 0, S, S); for (let i = 0; i < d.data.length; i += 4) { const n = (r() - .5) * 30; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } g.putImageData(d, 0, 0);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, S * .74, S, S * .26);
    g.fillStyle = '#f6ecd6'; g.textAlign = 'center'; g.font = '700 34px Literata, Georgia, serif';
    // up to two lines of the title, cut with an ellipsis when longer
    const words = title.toUpperCase().split(/\s+/).filter(Boolean), lines: string[] = [];
    let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > S * .86 && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    if (lines.length > 2) { lines.length = 2; lines[1] += '…'; }
    lines.forEach((ln, k) => { let t = ln; while (g.measureText(t).width > S * .9 && t.length > 2) t = t.slice(0, -2) + '…'; g.fillText(t, S / 2, S * (lines.length > 1 ? .84 + k * .08 : .88)); });
    return c.toDataURL('image/jpeg', .86);
  });
}
