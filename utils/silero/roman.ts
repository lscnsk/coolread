// Roman numerals said in Russian before the text goes to the voice: "Глава IV" is read
// "глава четвёртая", "XIX век" "девятнадцатый век", "Пётр I" "Пётр первый", and a bare "IV"
// (a chapter heading) "четыре". Without this the letters are read one by one.
// Same rules as android/.../RomanNumerals.java: keep the two in step.

import { number } from './text';

// Words after which the number is an ordinal of that gender: "глава IV", "том II"
const FEMININE = new Set(['глава', 'часть', 'книга', 'песнь', 'картина', 'сцена', 'серия', 'тетрадь', 'редакция', 'лекция', 'статья', 'таблица', 'эпоха', 'династия']);
const MASCULINE = new Set(['том', 'акт', 'раздел', 'параграф', 'выпуск', 'эпизод', 'день', 'отдел', 'период', 'съезд', 'класс', 'полк', 'легион']);

const TOKEN = /^([^\p{L}\p{N}]*)([IVXLCDM]+)(?:-(\p{L}{1,3}))?([^\p{L}\p{N}]*)$/u;
const VALID = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

type Form = 'm' | 'f' | 'gen' | 'prep' | 'dat';

/** Number of a Roman numeral, or 0 if the text is not one. */
export function value(s: string): number {
  if (!s || !VALID.test(s)) return 0;
  let total = 0, prev = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const v = VALUES[s[i]];
    if (v < prev) total -= v;
    else { total += v; prev = v; }
  }
  return total;
}

/** Old texts often type Roman numerals with Cyrillic Х, І, С, М: "ХIХ". Only when a Latin numeral letter is there too. */
function latinize(token: string): string {
  if (!/[IVXLCDM]/.test(token) || !/^[^\p{L}]*[IVXLCDMХІСМ]+(-\p{L}{1,3})?[^\p{L}]*$/u.test(token)) return token;
  const dash = token.indexOf('-');
  const head = dash < 0 ? token : token.slice(0, dash), tail = dash < 0 ? '' : token.slice(dash);
  return head.replace(/Х/g, 'X').replace(/І/g, 'I').replace(/С/g, 'C').replace(/М/g, 'M') + tail;
}

const letters = (token: string) => token.replace(/[^\p{L}]/gu, '');
const word = (token: string) => letters(token).toLowerCase().replace(/ё/g, 'е');
const isCyrillic = (s: string) => /^[\u0400-\u04FF]*$/.test(s);

/** Token i of the sentence with a Roman numeral replaced by Russian words; the token itself otherwise. */
export function say(tokens: string[], i: number): string {
  const m = TOKEN.exec(latinize(tokens[i]));
  if (!m) return tokens[i];
  const roman = m[2], suffix = m[3];
  const n = value(roman);
  if (n === 0 || n > 3999) return tokens[i];

  const prev = i > 0 ? word(tokens[i - 1]) : '';
  let prevRaw = i > 0 ? letters(tokens[i - 1]) : '';
  if (prevRaw.length < 3) prevRaw = ''; // "В XIX" is not a ruler
  const next = i + 1 < tokens.length ? word(tokens[i + 1]) : '';
  const alone = tokens.length === 1;

  let form: Form | null = null; // ordinal form, or null for a plain number
  if (suffix !== undefined) {
    const s = suffix.toLowerCase();
    form = s === 'го' ? 'gen' : s === 'м' || s === 'ом' ? 'prep' : s === 'му' ? 'dat' : s.endsWith('я') ? 'f' : 'm';
  } else if (FEMININE.has(prev)) form = 'f';
  else if (MASCULINE.has(prev)) form = 'm';
  else if (next.startsWith('век') || next.startsWith('столет')) {
    form = next === 'века' || next === 'столетия' ? 'gen' : next === 'веке' || next === 'столетии' ? 'prep' : next === 'веку' ? 'dat' : 'm';
  } else if (prevRaw && /^\p{Uppercase}/u.test(prevRaw) && isCyrillic(prevRaw)) {
    // A ruler: "Пётр I", "Екатерина II", "Людовик XIV"
    form = prevRaw.endsWith('а') || prevRaw.endsWith('я') ? 'f' : 'm';
  }
  // One letter that may be a Latin word or a mark ("I", "C"): only in a clear context
  // "I. Детство": a numbered heading at the start of the line
  const numbered = i === 0 && m[1] === '' && /^[.)]$/.test(m[4]);
  if (roman.length === 1 && form === null && !alone && !numbered) return tokens[i];

  const words = form === null ? number(String(n)) : ordinal(n, form);
  return m[1] + words + m[4];
}

const UNITS = ['', 'первый', 'второй', 'третий', 'четвёртый', 'пятый', 'шестой', 'седьмой', 'восьмой', 'девятый'];
const TEENS = ['десятый', 'одиннадцатый', 'двенадцатый', 'тринадцатый', 'четырнадцатый', 'пятнадцатый', 'шестнадцатый', 'семнадцатый', 'восемнадцатый', 'девятнадцатый'];
const TENS = ['', '', 'двадцатый', 'тридцатый', 'сороковой', 'пятидесятый', 'шестидесятый', 'семидесятый', 'восьмидесятый', 'девяностый'];
const HUNDREDS = ['', 'сотый', 'двухсотый', 'трёхсотый', 'четырёхсотый', 'пятисотый', 'шестисотый', 'семисотый', 'восьмисотый', 'девятисотый'];

/** "двадцать четвёртая": the number with only its last word as an ordinal. */
export function ordinal(n: number, form: Form): string {
  const head: string[] = [];
  let last: string;
  const rest = n % 1000, thousands = Math.floor(n / 1000);
  if (rest === 0) {
    last = (thousands === 2 ? 'двух' : thousands === 3 ? 'трёх' : '') + 'тысячный';
  } else {
    if (n >= 1000) head.push(number(String(thousands * 1000)));
    const h = Math.floor(rest / 100), t = rest % 100;
    if (t === 0) last = HUNDREDS[h];
    else {
      if (h > 0) head.push(number(String(h * 100)));
      if (t < 10) last = UNITS[t];
      else if (t < 20) last = TEENS[t - 10];
      else if (t % 10 === 0) last = TENS[t / 10];
      else {
        head.push(number(String(Math.floor(t / 10) * 10)));
        last = UNITS[t % 10];
      }
    }
  }
  head.push(inflect(last, form));
  return head.join(' ');
}

/** Masculine nominative ordinal to the asked form: f, gen, prep, dat or m. */
function inflect(w: string, form: Form): string {
  if (form === 'm') return w;
  const soft = w.endsWith('ий'); // третий
  const stem = w.slice(0, -2);
  switch (form) {
    case 'f': return soft ? stem + 'ья' : stem + 'ая';
    case 'gen': return soft ? stem + 'ьего' : stem + 'ого';
    case 'prep': return soft ? stem + 'ьем' : stem + 'ом';
    case 'dat': return soft ? stem + 'ьему' : stem + 'ому';
    default: return w;
  }
}
