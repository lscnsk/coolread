import { describe, it, expect } from 'vitest';
import { themedCss, themedIcon } from '../utils/themeVariants';

describe('theme variants', () => {
  it('recolors base colors and leaves others and selectors alone', () => {
    const css = '.a { color: #fcd34d; background: rgba(39, 28, 25, 0.5); } .bg-\\[\\#fcd34d\\] { color: #123456; }';
    const out = themedCss('Spooky', css);
    expect(out).toContain('color: #FDBA74');
    expect(out).toContain('rgba(23, 18, 31, 0.5)');
    expect(out).toContain('.bg-\\[\\#fcd34d\\]');
    expect(out).toContain('#123456');
    expect(themedCss('Dragon', css)).toBe(css);
  });
  it('swaps icons only for the variant styles', () => {
    expect(themedIcon('Spooky', '🐉')).toBe('🎃');
    expect(themedIcon('Dragon', '🐉')).toBe('🐉');
    expect(themedIcon('Cozy', '📚')).toBe('📚');
  });
});
