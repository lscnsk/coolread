// Spooky and Cozy reuse the layout of two existing styles: Spooky is built on Dragon (dark,
// orange accents), Cozy on Marcel (light). Their own colors come from CSS overrides in
// AppStyles; this file swaps the icons that the base style would otherwise show.

const ICONS: Record<string, Record<string, string>> = {
  Spooky: {
    '🍻': '🦇', '🐉': '🎃', '🏰': '🕸️', '📯': '🔮', '📜': '🕯️', '🎲': '👻',
  },
  Cozy: {
    '🪶': '🧶', '🪻': '🍂', '🍵': '☕', '☕': '☕',
  },
};

/** The icon to show for this app style, given the icon of its base style. */
export const themedIcon = (appStyle: string | undefined, icon: string): string =>
  (appStyle && ICONS[appStyle]?.[icon]) || icon;

// Base color -> new color for each variant. scripts/gen-theme-variants.py reads this table.
/*palette-start*/
export const VARIANT_COLORS: Record<string, Record<string, string>> = {
  "Cozy": {
    "f3effb": "F7EFE3",
    "e8e0f5": "EFE3D1",
    "dbd0ef": "E5D5BE",
    "c4b5e6": "D9C3A5",
    "ac97d7": "C9A47A",
    "9b8eae": "A08C78",
    "766594": "8A6E55",
    "544372": "9A5B22",
    "2f2440": "3B2A1E",
    "eae4f7": "F0E6D6",
    "413459": "4A3526",
    "f4f0fa": "F9F3EA",
    "ede7f7": "F2E8D8",
    "c7bedb": "D6C6AE"
  },
  "Spooky": {
    "271c19": "17121F",
    "1a0f0d": "0F0B16",
    "4a2511": "2E1F47",
    "7f1d1d": "4C2A7A",
    "991b1b": "6D28D9",
    "fcd34d": "FDBA74",
    "b45309": "9F8FBF",
    "d97706": "F97316",
    "f59e0b": "FB923C",
    "2a1508": "1E1530",
    "1f0f05": "120D1C",
    "3d1f0d": "2A1C40",
    "fdf9f1": "F3E9D2",
    "3d2a22": "2A1F14",
    "e8dcc8": "D8C7A3",
    "1c1412": "120E18",
    "d6c5b4": "D8CFE6",
    "3a1a0e": "241838",
    "5a0d0d": "3B1F5C",
    "480607": "2B1745",
    "450a0a": "3B1F5C",
    "2a140b": "1A1228",
    "fffff0": "FDBA74",
    "ef4444": "F97316",
    "c2410c": "C2410C"
  }
};
/*palette-end*/

const hexToRgb = (h: string) => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));

/** Recolors a CSS string written for the base style (Dragon or Marcel) for Spooky or Cozy. */
export function themedCss(appStyle: string | undefined, css: string): string {
  const table = appStyle ? VARIANT_COLORS[appStyle] : undefined;
  if (!table) return css;
  const byRgb = new Map(Object.entries(table).map(([from, to]) => [hexToRgb(from).join(','), hexToRgb(to)]));
  return css
    .replace(/(?<!\\)#([0-9a-fA-F]{6})\b/g, (m, h) => (table[h.toLowerCase()] ? '#' + table[h.toLowerCase()] : m))
    .replace(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/g, (m, r, g, b, a) => {
      const to = byRgb.get(`${r},${g},${b}`);
      return to ? `rgba(${to[0]}, ${to[1]}, ${to[2]}, ${a})` : m;
    });
}
