// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fixture from './fixtures-catalog.json';
import { syncCatalogFromGitHub, lastCatalogSyncTime, buildCatalogSeriesFromBooks } from '../utils/catalogSync';

const catalog = JSON.stringify(fixture);

describe('lscnsk catalog', () => {
  it('reads catalog.json with one request', async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(url.includes('catalog.json') ? catalog : '[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { books, series } = await syncCatalogFromGitHub();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(books).toHaveLength(5);
    const lm = books.find(b => b.id === 'lm')!;
    expect(lm.author).toBe('Люсьен Леви-Брюль');
    expect(lm.downloadUrl).toBe('https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/lm.fb2');
    expect(lm.coverUrl).toBe('https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/covers/lm.jpg');
    expect(lm.coverBg).toBe('from-[#2a2421] to-[#171412]');
    expect(books.some(b => b.id === 'jk')).toBe(true);
    expect(series.map(s => s.name)).toContain('Далекая Республика');
    expect(Date.now() - lastCatalogSyncTime()).toBeLessThan(5000);
    vi.unstubAllGlobals();
  });
});

describe('catalog series', () => {
  it('lists only the series the books name', () => {
    expect(buildCatalogSeriesFromBooks([])).toEqual([]);
    const series = buildCatalogSeriesFromBooks([
      { id: 'a', filename: 'a.fb2', title: 'A', author: 'X', series: 'Greater Britain' } as any,
      { id: 'b', filename: 'b.fb2', title: 'B', author: 'Y', series: 'Troisième République' } as any,
    ]);
    expect(series.map(s => s.name)).toEqual(['Greater Britain', 'Troisième République']);
  });
});

describe('early access samplers', () => {
  it('keeps the link between a book and its sampler', async () => {
    const data = JSON.parse(catalog);
    data.books[0] = { ...data.books[0], sampler: 'ff' };
    data.books.push({ id: 'ff', filename: 'ff.fb2', title: 'Флэпперы и философы', author: 'Ф. Скотт Фицджеральд', year: '1920', samplerFor: data.books[0].id });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(data), { status: 200 })));
    const { books } = await syncCatalogFromGitHub();
    expect(books.find(b => b.id === data.books[0].id)!.sampler).toBe('ff');
    expect(books.find(b => b.id === 'ff')!.samplerFor).toBe(data.books[0].id);
    vi.unstubAllGlobals();
  });
});
