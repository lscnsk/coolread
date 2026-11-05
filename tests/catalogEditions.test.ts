// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { hasNewEdition, rememberEdition, findLibraryBook, setEditionRemap, takeEditionRemap } from '../utils/catalogEditions';

const cat = (o: any) => ({ id: 'fr', filename: 'fr.fb2', title: 'По эту сторону рая', author: '', downloadUrl: '', fileSize: '', ...o });
const lib = (o: any) => ({ id: 'external_1', title: 'По эту сторону рая', type: 'ebook', chapters: [], ...o });

describe('new editions of lscnsk books', () => {
  beforeEach(() => localStorage.clear());
  it('compares the edition remembered at download', () => {
    rememberEdition('fr', 'aaa', 100);
    expect(hasNewEdition(cat({ edition: 'aaa', sizeBytes: 100 }), lib({ size: 100 }))).toBe(false);
    expect(hasNewEdition(cat({ edition: 'bbb', sizeBytes: 100 }), lib({ size: 100 }))).toBe(true);
  });
  it('falls back to the file size for books downloaded earlier', () => {
    expect(hasNewEdition(cat({ edition: 'bbb', sizeBytes: 200 }), lib({ size: 100 }))).toBe(true);
    expect(hasNewEdition(cat({ edition: 'bbb', sizeBytes: 100 }), lib({ size: 100 }))).toBe(false);
    expect(hasNewEdition(cat({ edition: 'bbb', sizeBytes: 100 }), lib({}))).toBe(false);
  });
  it('finds the library copy and keeps the place once', () => {
    expect(findLibraryBook(cat({}), [lib({}) as any])?.id).toBe('external_1');
    setEditionRemap('external_1', { chapterName: 'Глава 2', time: 0.4 });
    expect(takeEditionRemap('external_1')).toEqual({ chapterName: 'Глава 2', time: 0.4 });
    expect(takeEditionRemap('external_1')).toBeNull();
  });
});
