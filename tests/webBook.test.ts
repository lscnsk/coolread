// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { parseAzLib, importWikisource, buildFb2, webBookSite } from '../utils/webBook';

const AZ = `<html><head><title>Lib.ru/Классика: Конрад Джозеф. Лагуна</title></head><body>
<li>Год: 1897</li>
<!--Section Begins-->
<dd>&nbsp;&nbsp;Белый человек сказал: "Мы останемся здесь..."
<dd>&nbsp;&nbsp;- Хорошо, -- ответил он.
<h4><div align="center"><p><b>II</b></p></div></h4>
<dd>&nbsp;&nbsp;Вторая часть.
<!--Section Ends-->
</body></html>`;

describe('webBookSite', () => {
  it('recognizes the two sites', () => {
    expect(webBookSite('http://az.lib.ru/k/konrad_d/text.shtml')).toBe('azlib');
    expect(webBookSite('https://ru.wikisource.org/wiki/X')).toBe('wikisource');
    expect(webBookSite('https://example.com/')).toBeNull();
  });
});

describe('az.lib.ru', () => {
  const book = parseAzLib(AZ, 'http://az.lib.ru/k/konrad_d/text.shtml');
  it('reads title, author and year', () => {
    expect(book.title).toBe('Лагуна');
    expect(book.authors[0]).toMatchObject({ first: 'Джозеф', last: 'Конрад' });
    expect(book.date).toBe('1897');
  });
  it('makes typography and chapters', () => {
    const xml = buildFb2(book);
    expect(xml).toContain('«Мы останемся здесь…»');
    expect(xml).toContain('<p>— Хорошо, — ответил он.</p>');
    expect(xml).toMatch(/<title><p>II<\/p><\/title>/);
    expect(new DOMParser().parseFromString(xml, 'text/xml').querySelector('parsererror')).toBeNull();
  });
});

describe('Wikisource', () => {
  it('refuses a list of editions', async () => {
    const html = `<html><body><h1 id="firstHeading">Капитанская дочка (Пушкин)</h1><span id="ws-title">Список редакций: Капитанская дочка</span><div class="mw-parser-output"><p>x</p></div></body></html>`;
    await expect(importWikisource('https://ru.wikisource.org/wiki/K', html, async () => '')).rejects.toThrow(/editions/);
  });
});
