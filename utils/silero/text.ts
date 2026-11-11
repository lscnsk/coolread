// What the Silero voice cannot read is put into words it can: digits, Latin letters, signs.
// Same rules as android/.../SileroTts.java (clean, spellOut, number): keep the two in step.

export const SYMBOLS = '_~|!+,-.:;?абвгдежзийклмнопрстуфхцчшщъыьэюяё–… ';

// What Java calls white space: no-break spaces are not
const WHITESPACE = new Set([9, 10, 11, 12, 13, 28, 29, 30, 31, 32, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x205f, 0x3000]);
const isWhitespace = (c: string) => WHITESPACE.has(c.charCodeAt(0));

/** Lower case, only the characters the model knows, words separated by single spaces. */
export function clean(s: string): string {
  s = s.toLowerCase().replace(/—/g, '–').replace(/‑/g, '-');
  let b = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (isWhitespace(c)) b += ' ';
    else if (c !== '_' && c !== '~' && c !== '|' && SYMBOLS.includes(c)) b += c;
  }
  return b.replace(/^[\0- ]+|[\0- ]+$/g, '').replace(/ +/g, ' ');
}

const LATIN = ['а', 'б', 'к', 'д', 'е', 'ф', 'г', 'х', 'и', 'дж', 'к', 'л', 'м', 'н', 'о', 'п', 'к', 'р', 'с', 'т', 'у', 'в', 'в', 'кс', 'й', 'з'];

/** What Silero would drop: digits become words, Latin letters become Russian ones. */
export function spellOut(token: string): string {
  const t = token.replace(/%/g, ' процентов ').replace(/№/g, ' номер ').replace(/&/g, ' и ').replace(/\+/g, ' плюс ');
  let s = t.replace(/[0-9]+/g, d => ' ' + number(d) + ' ').toLowerCase();
  s = s.replace(/sh/g, 'ш').replace(/ch/g, 'ч').replace(/th/g, 'т').replace(/ph/g, 'ф').replace(/kh/g, 'х').replace(/zh/g, 'ж').replace(/ck/g, 'к').replace(/oo/g, 'у').replace(/ee/g, 'и');
  return s.replace(/[a-z]/g, c => LATIN[c.charCodeAt(0) - 97]);
}

const ONES = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
const SCALES = [['тысяча', 'тысячи', 'тысяч'], ['миллион', 'миллиона', 'миллионов'], ['миллиард', 'миллиарда', 'миллиардов']];

export function number(digits: string): string {
  const d = digits.replace(/^0+(?=\d)/, '');
  if (d.length > 12 || (digits.length > 1 && digits[0] === '0')) return [...digits].map(c => ONES[+c]).join(' ');
  let n = Number(d);
  if (n === 0) return ONES[0];
  const words: string[] = [];
  const groups: number[] = [];
  for (let i = 0; i < 4; i++) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  for (let g = 3; g >= 0; g--) {
    const v = groups[g];
    if (v === 0) continue;
    // "тысяча девятьсот…", not "одна тысяча девятьсот…"
    if (!(g === 1 && v === 1)) triple(v, g === 1, words);
    if (g > 0) {
      const t = v % 100, u = v % 10;
      const f = SCALES[g - 1];
      words.push(t >= 11 && t <= 14 ? f[2] : u === 1 ? f[0] : u >= 2 && u <= 4 ? f[1] : f[2]);
    }
  }
  return words.join(' ');
}

function triple(v: number, feminine: boolean, out: string[]) {
  if (v >= 100) out.push(HUNDREDS[Math.floor(v / 100)]);
  const t = v % 100;
  if (t >= 10 && t < 20) { out.push(TEENS[t - 10]); return; }
  if (t >= 20) out.push(TENS[Math.floor(t / 10)]);
  const u = t % 10;
  if (u > 0) out.push(feminine && u === 1 ? 'одна' : feminine && u === 2 ? 'две' : ONES[u]);
}
