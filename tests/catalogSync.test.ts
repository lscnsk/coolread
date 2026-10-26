// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fixture from './fixtures-catalog.json';
import { syncCatalogFromGitHub, lastCatalogSyncTime } from '../utils/catalogSync';

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
