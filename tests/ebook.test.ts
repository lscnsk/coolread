// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseFb2, parseEpub } from '../utils/ebook';

const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description><title-info><author><first-name>Иван</first-name><last-name>Петров</last-name></author>
<book-title>Тестовая книга</book-title></title-info></description>
<body>
<section><title><p>Глава первая</p></title><p>Первый абзац.</p></section>
<section><title><p>Глава вторая</p></title><p>Второй абзац.</p></section>
</body></FictionBook>`;

describe('parseFb2', () => {
  it('reads title, author and chapters', async () => {
    const book = await parseFb2(new Blob([fb2], { type: 'text/xml' }), 'b1');
    expect(book.title).toBe('Тестовая книга');
    expect(book.author).toContain('Петров');
    const text = (book.chapters || []).map(c => c.content).join('\n');
    expect(text).toContain('Первый абзац.');
    expect(text).toContain('Второй абзац.');
    expect((book.chapters || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('parseEpub', () => {
  // Title and author are read with selectors like "metadata title", which match <dc:title> in
  // Chrome but not in the test DOM, so this test checks the chapters only.
  it('reads chapters in spine order', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip');
    zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
    zip.file('OEBPS/content.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>EPUB книга</dc:title><dc:creator>Анна Автор</dc:creator></metadata>
<manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="c2"/><itemref idref="c1"/></spine></package>`);
    const page = (t: string) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${t}</title></head><body><h1>${t}</h1><p>Текст ${t}</p></body></html>`;
    zip.file('OEBPS/c1.xhtml', page('Один'));
    zip.file('OEBPS/c2.xhtml', page('Два'));
    const blob = await zip.generateAsync({ type: 'blob' });
    const book = await parseEpub(blob, 'e1');
    const all = (book.chapters || []).map(c => c.content).join('\n');
    expect(all.indexOf('Текст Два')).toBeGreaterThanOrEqual(0);
    expect(all.indexOf('Текст Два')).toBeLessThan(all.indexOf('Текст Один'));
  });
});

describe('parseFb2 with control characters', () => {
  it('keeps the text after a stray control character', async () => {
    const broken = fb2.replace('Первый абзац.', 'Первый\u0016 абзац.');
    const book = await parseFb2(new Blob([broken]), 'b1');
    const text = (book.chapters || []).map(c => c.content || '').join(' ');
    expect(text).toContain('Второй абзац.');
  });
});

describe('fb2 metadata', () => {
  it('keeps the series when <sequence> comes after the cover', async () => {
    const { extractFb2Metadata } = await import('../utils/ebook');
    const xml = `<?xml version="1.0" encoding="UTF-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><author><first-name>Джозеф</first-name><last-name>Конрад</last-name></author><book-title>Король моря</book-title><coverpage><image l:href="#image1"/></coverpage><lang>ru</lang><sequence name="Далекая Республика"/></title-info></description><body><section><p>x</p></section></body></FictionBook>`;
    const meta = await extractFb2Metadata(new Blob([xml]));
    expect(meta.title).toBe('Король моря');
    expect(meta.series).toBe('Далекая Республика');
  });
});
