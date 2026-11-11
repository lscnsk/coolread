// Styles built on top of an existing one ("base"): the screens are laid out exactly as in
// the base style, and only the colours, fonts, names and emoji differ.
//
// Colours: every CSS rule and inline style that uses one of the base style's colours is
// repeated with the variant's colour (see applyStyleVariant), so the hundreds of colour
// choices made for the base style carry over without being written out again.

export interface StyleVariant {
  name: string;
  base: 'Dragon' | 'Final' | 'Surf' | 'Cool';
  theme: 'dark' | 'light';
  /** Header title: "<title> <titleEmoji> Read" */
  title: string;
  titleEmoji: string;
  titleClass: string;
  nameTracking: string;
  readTracking: string;
  emojiSize: string;
  /** Font class for this style's name on its settings button and in panel headings */
  fontClass: string;
  libraryEmoji: string;
  chaptersEmoji: string;
  ebookEmoji: string;
  audioEmoji: string;
  emptyPrompt: string;
  nextChapter: string;
  /** Panel headings ("Library", "Settings"): replaces the base style's classes */
  panelTitleClass: string;
  /** Extra CSS while the style is on (fonts of the base style swapped for this one) */
  css: string;
  bar: { background: string; foreground: string };
  accent: string;
  /** base colour -> this style's colour */
  palette: Record<string, string>;
  /** Text colours in the reader: bold words (and bionic reading), italics, drop cap */
  reader: Record<'dark' | 'light', { bold: string; italic: string; cap: string; capGlow?: string }>;
}

export const STYLE_VARIANTS: Record<string, StyleVariant> = {
  Code: {
    name: 'Code',
    reader: { dark: { bold: '#4ade80', italic: '#a7f3c0', cap: '#22c55e', capGlow: 'rgba(34,197,94,0.5)' }, light: { bold: '#15803d', italic: '#166534', cap: '#15803d' } }, base: 'Dragon', theme: 'dark',
    title: 'Code', titleEmoji: '💾',
    titleClass: 'font-code text-2xl md:text-3xl text-[#86efac] drop-shadow-md',
    nameTracking: 'tracking-[0.05em]', readTracking: 'tracking-[0.05em]', emojiSize: 'text-4.5xl md:text-5.5xl',
    fontClass: 'font-code',
    libraryEmoji: '🖥️', chaptersEmoji: '🖲️', ebookEmoji: '📟', audioEmoji: '📼',
    emptyPrompt: 'Wake up, Neo… 🐇', nextChapter: 'Follow the white rabbit 🐇',
    panelTitleClass: 'font-code font-medium text-[22px] tracking-wide translate-y-[1px]',
    css: `.font-dragon:not(.style-label){font-family:"Share Tech Mono",ui-monospace,monospace!important}`,
    bar: { background: '#060b07', foreground: '#86efac' }, accent: '#22C55E',
    palette: {
      '#271c19': '#060b07', '#1a0f0d': '#030604', '#4a2511': '#0c2414', '#7f1d1d': '#14532d', '#991b1b': '#16a34a',
      '#450a0a': '#052e16', '#5a0d0d': '#064e1f', '#3a1a0e': '#08190d', '#fcd34d': '#86efac', '#f59e0b': '#4ade80',
      '#d97706': '#22c55e', '#b45309': '#15803d', '#ea580c': '#21c45d', '#c2410c': '#15a349', '#fed7aa': '#14522d',
      '#fdba74': '#166534', '#2a1508': '#0a1a0f', '#1f0f05': '#06120a', '#2a140b': '#071509', '#1c1412': '#050b07',
      '#3d2a22': '#10261a', '#2e1d18': '#0a190f', '#5c3c2e': '#173d24', '#7a4c3a': '#1f5130', '#c28469': '#3f8a52',
      '#fdf9f1': '#f4f9f4', '#f2eadd': '#e7f0e7', '#e8dcc8': '#d3e3d3', '#d6c5b4': '#b7cdb7',
    },
  },
  Byte: {
    name: 'Byte',
    reader: { dark: { bold: '#ff4fd8', italic: '#5eead4', cap: '#5eead4', capGlow: 'rgba(255,79,216,0.45)' }, light: { bold: '#a21caf', italic: '#0f766e', cap: '#7c3aed' } }, base: 'Final', theme: 'dark',
    title: 'Byte', titleEmoji: '👾',
    titleClass: 'font-byte text-[40px] leading-none text-[#5eead4] drop-shadow-[0_0_3px_#ff4fd866]',
    nameTracking: 'tracking-normal', readTracking: 'tracking-normal', emojiSize: 'text-4.5xl md:text-5.5xl',
    fontClass: 'font-byte',
    libraryEmoji: '🕹️', chaptersEmoji: '🎮', ebookEmoji: '💿', audioEmoji: '📻',
    emptyPrompt: 'Press start ▶️', nextChapter: 'Insert coin 🪙',
    panelTitleClass: 'font-byte text-[30px] leading-none translate-y-[1px]',
    css: `.font-ff:not(.style-label){font-family:"VT323",ui-monospace,monospace!important;font-size-adjust:0.62}`,
    bar: { background: '#170a2b', foreground: '#fde7ff' }, accent: '#FF4FD8',
    palette: {
      '#0b1d3a': '#170a2b', '#061124': '#0d0519', '#17335e': '#2a1250', '#406da3': '#6d28d9', '#f0deba': '#fde7ff',
      '#8faada': '#c4a1ff', '#a6c0ea': '#d8b4fe', '#d0deef': '#f5d0fe', '#6486c4': '#a78bfa', '#4364a1': '#7c3aed',
      '#dfc894': '#ff4fd8', '#c1a05f': '#e04bc0', '#132a4e': '#3b1766', '#0d2347': '#1f0c3a', '#cca972': '#ff4fd7',
      '#e0d6c1': '#e2d3f0', '#f5f1e7': '#f7f2fb', '#eae3d1': '#ece2f5', '#d6d0c0': '#d9c9ea', '#594d3f': '#4c2f6b',
      '#2b251e': '#1f1030', '#0d1a33': '#14072a', '#1f3358': '#33175e', '#2a4a7a': '#4c1d95', '#1a3a6e': '#3b1a78',
      '#13244a': '#250e45', '#081832': '#10061f', '#20447c': '#4c1d96', '#0f2547': '#1e0b38', '#0b1c38': '#160829',
    },
  },
  Mint: {
    name: 'Mint',
    reader: { dark: { bold: '#a3c97a', italic: '#c5dba8', cap: '#8db66b' }, light: { bold: '#4e7331', italic: '#6e9a46', cap: '#5b8539' } }, base: 'Surf', theme: 'light',
    title: 'Mint', titleEmoji: '🌿',
    titleClass: 'font-mint font-normal text-[34px] md:text-5xl text-[#5B8538] drop-shadow-md',
    nameTracking: 'tracking-normal pr-1.5 md:pr-2', readTracking: 'tracking-normal pl-0.5', emojiSize: 'text-4.5xl md:text-5.5xl',
    fontClass: 'font-mint',
    libraryEmoji: '🪴', chaptersEmoji: '🍃', ebookEmoji: '📗', audioEmoji: '🎐',
    emptyPrompt: 'Pour a cup and pick a book 🍵', nextChapter: 'One more cup 🫖',
    panelTitleClass: 'font-mint font-medium text-[28px] tracking-wide translate-y-[1px]',
    css: `.font-surf:not(.style-label){font-family:"Satisfy",cursive!important}`,
    bar: { background: '#F2F6EC', foreground: '#2E4220' }, accent: '#6E9A45',
    palette: {
      '#f0f9ff': '#f2f6ec', '#0c4a6e': '#2e4220', '#bae6fd': '#d3e2c1', '#0369a1': '#4e7330', '#0ea5e9': '#6e9a45',
      '#0284c7': '#5b8538', '#38bdf8': '#8db66a', '#7dd3fc': '#b4cf98', '#e0f2fe': '#e5eeda', '#111e25': '#141a10',
      '#b5cbd6': '#c9d5bd', '#1e3a4c': '#2a3a20', '#f4f7f9': '#f5f8f1', '#cce1ed': '#d9e6cc', '#182933': '#1c2616',
      '#2a526b': '#3d5a27', '#075985': '#3d5a28', '#0c4a6f': '#2e4221',
    },
  },
  Jazz: {
    name: 'Jazz',
    reader: { dark: { bold: '#d4b46a', italic: '#e8d39c', cap: '#d4b46a', capGlow: 'rgba(212,180,106,0.4)' }, light: { bold: '#8a6d2b', italic: '#6b5520', cap: '#8a6d2b' } }, base: 'Cool', theme: 'dark',
    title: 'Jazz', titleEmoji: '🥂',
    titleClass: 'font-jazz font-bold text-2xl md:text-3xl text-[#f1dfae]',
    nameTracking: 'tracking-[0.05em]', readTracking: 'tracking-[0.05em]', emojiSize: 'text-4.5xl md:text-5.5xl',
    fontClass: 'font-jazz',
    libraryEmoji: '🎩', chaptersEmoji: '🎷', ebookEmoji: '📰', audioEmoji: '🎺',
    emptyPrompt: 'Pick a story, old sport 🥂', nextChapter: 'Boats against the current ⛵',
    panelTitleClass: 'font-jazz font-bold text-[24px] tracking-wider translate-y-[1px]',
    css: '',
    bar: { background: '#0b0b0a', foreground: '#f1dfae' }, accent: '#A8894C',
    palette: {
      '#23211f': '#0b0b0a', '#2c2a28': '#151411', '#363330': '#211d15', '#45413e': '#3b3220', '#57534e': '#8a7440',
      '#fffff0': '#f1dfae', '#2a2724': '#13120f', '#5c5752': '#a8894c', '#1a1918': '#080807', '#2a2421': '#1d1a12',
      '#171412': '#0a0908',
    },
  },
};

/** Names of all variants, in the order their buttons appear in the settings */
export const VARIANT_NAMES = Object.keys(STYLE_VARIANTS);

export function variantOf(style?: string | null): StyleVariant | undefined {
  return style ? STYLE_VARIANTS[style] : undefined;
}

/** The style whose screens a style uses: the base for a variant, the style itself otherwise */
export function baseStyleOf(style: string): string {
  return STYLE_VARIANTS[style]?.base ?? style;
}

// ---------------------------------------------------------------------------
// Recolouring

const STYLE_ID = 'style-variant-colors';
let active: StyleVariant | undefined;
let colorMap = new Map<string, [number, number, number]>();
let observer: MutationObserver | undefined;
// Inline styles changed by us: element -> [original, ours]
const touched = new Map<Element, [string, string]>();

const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const toHex = (n: number) => n.toString(16).padStart(2, '0');

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+[\s,]+\d+[\s,]+\d+[^)]*\)/g;

function mapColors(value: string): string {
  return value.replace(COLOR_RE, (m) => {
    if (m[0] === '#') {
      if (m.length !== 4 && m.length !== 5 && m.length !== 7 && m.length !== 9) return m;
      const rgb = hexToRgb(m);
      const to = colorMap.get(rgb.join(','));
      if (!to) return m;
      const alpha = m.length === 9 ? m.slice(7) : m.length === 5 ? m[4] + m[4] : '';
      return '#' + to.map(toHex).join('') + alpha;
    }
    const nums = m.match(/\d+(\.\d+)?/g);
    if (!nums) return m;
    const to = colorMap.get(nums.slice(0, 3).join(','));
    if (!to) return m;
    let i = 0;
    return m.replace(/\d+(\.\d+)?/g, (n) => (i < 3 ? String(to[i++]) : n));
  });
}

function rulesCss(rules: CSSRuleList): string {
  let out = '';
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      const st = rule.style;
      if (!COLOR_RE.test(st.cssText)) { COLOR_RE.lastIndex = 0; continue; }
      COLOR_RE.lastIndex = 0;
      let decls = '';
      for (let i = 0; i < st.length; i++) {
        const prop = st[i];
        const val = st.getPropertyValue(prop);
        const mapped = mapColors(val);
        if (mapped !== val) decls += `${prop}:${mapped}${st.getPropertyPriority(prop) ? '!important' : ''};`;
      }
      // A shorthand that uses var() (Tailwind's border-color with --tw-border-opacity) leaves its
      // longhands empty above, so read those declarations straight from the rule's text.
      if (st.cssText.includes('var(')) {
        for (const d of st.cssText.split(';')) {
          const at = d.indexOf(':');
          if (at < 0 || d.includes('url(')) continue;
          const prop = d.slice(0, at).trim();
          const val = d.slice(at + 1).trim();
          if (prop.startsWith('--') || !val.includes('var(')) continue;
          const mapped = mapColors(val);
          if (mapped !== val) decls += `${prop}:${mapped};`;
        }
      }
      if (decls) out += `${rule.selectorText}{${decls}}`;
    } else if (rule instanceof CSSMediaRule) {
      const inner = rulesCss(rule.cssRules);
      if (inner) out += `@media ${rule.conditionText}{${inner}}`;
    } else if (typeof CSSSupportsRule !== 'undefined' && rule instanceof CSSSupportsRule) {
      const inner = rulesCss(rule.cssRules);
      if (inner) out += `@supports ${rule.conditionText}{${inner}}`;
    }
  }
  return out;
}

function regenerate() {
  if (!active) return;
  let css = active.css;
  for (const sheet of Array.from(document.styleSheets)) {
    const owner = sheet.ownerNode as HTMLElement | null;
    if (owner && owner.id === STYLE_ID) continue;
    try { css += rulesCss(sheet.cssRules); } catch { /* another site's sheet */ }
  }
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = STYLE_ID; }
  // Always last in the page, so it wins over the rules it repeats
  if (el.textContent !== css) el.textContent = css;
  if (el.parentNode !== document.body || el !== document.body.lastElementChild) document.body.appendChild(el);
}

function recolorInline(el: Element) {
  const s = el.getAttribute('style');
  if (!s || (s.indexOf('#') < 0 && s.indexOf('rgb') < 0)) return;
  const prev = touched.get(el);
  if (prev && prev[1] === s) return;
  const mapped = mapColors(s);
  if (mapped !== s) { touched.set(el, [s, mapped]); el.setAttribute('style', mapped); }
}

function isStyleNode(n: Node | null): boolean {
  for (let x: Node | null = n; x; x = x.parentNode) {
    if (x.nodeName === 'STYLE' || x.nodeName === 'LINK') return (x as HTMLElement).id !== STYLE_ID;
    if (x.nodeType === 1 && x.nodeName !== 'STYLE') return false;
  }
  return false;
}

function onMutations(list: MutationRecord[]) {
  let styles = false;
  for (const m of list) {
    if (m.type === 'attributes') { recolorInline(m.target as Element); continue; }
    if (m.type === 'characterData') { if (isStyleNode(m.target.parentNode)) styles = true; continue; }
    if (isStyleNode(m.target)) styles = true;
    for (const n of [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)]) {
      if (n.nodeName === 'STYLE' || n.nodeName === 'LINK') { if ((n as HTMLElement).id !== STYLE_ID) styles = true; }
    }
    for (const n of Array.from(m.addedNodes)) {
      if (n.nodeType !== 1) continue;
      const e = n as Element;
      recolorInline(e);
      e.querySelectorAll('[style]').forEach(recolorInline);
      if (e.querySelector('style')) styles = true;
    }
  }
  if (styles) regenerate();
}

/** Turns a variant's colours on (or off, with undefined). Call after the base style's CSS is in the page. */
export function applyStyleVariant(v: StyleVariant | undefined) {
  if (typeof document === 'undefined') return;
  if (v === active) { if (v) regenerate(); return; }
  // Undo the previous variant
  observer?.disconnect(); observer = undefined;
  document.getElementById(STYLE_ID)?.remove();
  touched.forEach(([orig, ours], el) => { if (el.getAttribute('style') === ours) el.setAttribute('style', orig); });
  touched.clear();
  active = v;
  if (!v) return;
  colorMap = new Map(Object.entries(v.palette).map(([from, to]) => [hexToRgb(from).join(','), hexToRgb(to)]));
  regenerate();
  document.querySelectorAll('[style]').forEach(recolorInline);
  observer = new MutationObserver(onMutations);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style'] });
}

let chosen: string | undefined;
/** Remembers the chosen style while the app renders, for code that only knows the base style */
export function noteChosenStyle(style: string) { chosen = style; }

/** The added style now chosen, for code that only knows the base style (notifications, bars, reader) */
export function activeVariantFor(style?: string): StyleVariant | undefined {
  if (!style) return undefined;
  if (STYLE_VARIANTS[style]) return STYLE_VARIANTS[style];
  const v = variantOf(chosen);
  const base = style === 'Final Fantasy' ? 'Final' : style;
  return v && v.base === base ? v : undefined;
}
