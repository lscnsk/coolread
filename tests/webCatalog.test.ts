// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';

// Answers of the Wikisource API, as the real one gives them for "капитанская дочка"
const api = (url: string) => {
  const q = new URL(url).searchParams;
  if (q.get('list') === 'search') {
    return { continue: { sroffset: 40 }, query: { search: [
      { title: 'Капитанская дочка (Пушкин)' },
      { title: '«Капитанская дочка» Пушкина (Черняев)' },
      { title: 'Капитанская дочка (Пушкин)/1960 (СО)/Глава X' },
      { title: 'ЭСБЕ/Черняев, Николай Иванович' },
      { title: 'Сегодня в театрах Москвы (02.01.1954)' },
    ] } };
  }
  if (q.get('list') === 'allpages') {
    return { query: { allpages: [
      { title: 'Капитанская дочка (Пушкин)/1960 (СО)' },
      { title: 'Капитанская дочка (Пушкин)/1960 (СО)/Глава I' },
      { title: 'Капитанская дочка (Пушкин)/1978 (СО)' },
    ] } };
  }
  const cats: Record<string, string[]> = {
    'Капитанская дочка (Пушкин)': ['Капитанская дочка (Пушкин)', 'Списки редакций'],
    'Капитанская дочка (Пушкин)/1960 (СО)': ['Тексты редакций', 'Повести', 'Литература 1836 года'],
    '«Капитанская дочка» Пушкина (Черняев)': ['Критика', 'Статьи', 'Литература 1897 года'],
    'Сегодня в театрах Москвы (02.01.1954)': ['Газетные публикации 1954 года'],
  };
  const titles = (q.get('titles') || '').split('|');
  return { query: { pages: titles.map(t => (cats[t] ? { title: t, categories: cats[t].map(c => ({ title: 'Категория:' + c })) } : { title: t, missing: true })) } };
};

vi.mock('../utils/opds', () => ({ httpGet: async (url: string) => ({ status: 200, text: JSON.stringify(api(url)), contentType: 'application/json' }) }));
vi.mock('../utils/webBook', () => ({ fetchHtml: async () => '' }));
vi.mock('../utils/coverArt', () => ({ generatedCoverUrl: async () => undefined }));

describe('Wikisource catalog', () => {
  it('lists editions instead of the editions page, drops chapters, dictionaries and non-literature', async () => {
    const { fetchWebCatalogFeed } = await import('../utils/webCatalog');
    const feed = await fetchWebCatalogFeed('coolread-web:wikisource/search?q=' + encodeURIComponent('капитанская дочка'));
    const rows = feed.entries.map(e => [e.title, e.authors[0], e.summary]);
    expect(rows).toEqual([
      ['Капитанская дочка', 'Пушкин', 'редакция 1960 (СО)'],
      ['Капитанская дочка', 'Пушкин', 'редакция 1978 (СО)'],
      ['«Капитанская дочка» Пушкина', 'Черняев', 'Критика, Статьи'],
    ]);
    expect(feed.entries[0].acquisitions[0].href).toBe('https://ru.wikisource.org/wiki/' + encodeURIComponent('Капитанская_дочка_(Пушкин)') + '/' + encodeURIComponent('1960_(СО)'));
    expect(feed.nextUrl).toContain('offset=40');
    expect(feed.searchTemplate).toBe('coolread-web:wikisource/search?q={searchTerms}');
  });
});
