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
    expect(books).toHaveLength(10);
    const dm = books.find(b => b.id === 'dm')!;
    expect(dm.author).toBe('Эмиль Дюркгейм');
    expect(dm.downloadUrl).toBe('https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/dm.fb2');
    expect(dm.coverUrl).toBe('https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/covers/dm.jpg');
    expect(dm.coverBg).toBe('from-[#1e293b] to-[#0f172a]');
    expect(books.some(b => b.id === 'ww')).toBe(true);
    expect(series.map(s => s.name)).toContain('The Greater Britain');
    expect(Date.now() - lastCatalogSyncTime()).toBeLessThan(5000);
    vi.unstubAllGlobals();
  });
});
