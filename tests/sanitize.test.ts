// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../utils/sanitize';

describe('sanitizeHtml', () => {
  it('removes scripts and inline handlers', () => {
    const out = sanitizeHtml('<p onclick="x()">Hi<script>alert(1)</script><img src="a.png" onerror="alert(1)"></p>');
    expect(out).not.toMatch(/script|onclick|onerror/i);
    expect(out).toContain('<img src="a.png">');
    expect(out).toContain('Hi');
  });

  it('removes javascript: links, even when obfuscated', () => {
    const out = sanitizeHtml('<a href="java\tscript:alert(1)">a</a><a href=" JAVASCRIPT:x">b</a><a href="#n1">c</a>');
    expect(out).not.toMatch(/javascript/i);
    expect(out).toContain('href="#n1"');
  });

  it('removes frames, objects and html data URLs but keeps image data URLs', () => {
    const out = sanitizeHtml('<iframe src="x"></iframe><object data="x"></object><a href="data:text/html,<b>">x</a><img src="data:image/png;base64,AAAA">');
    expect(out).not.toMatch(/iframe|object|text\/html/i);
    expect(out).toContain('data:image/png;base64,AAAA');
  });

  it('removes SVG animations that rewrite links', () => {
    const out = sanitizeHtml('<svg><a><animate attributeName="href" to="javascript:alert(1)"/><text>t</text></a></svg>');
    expect(out).not.toMatch(/animate|javascript/i);
  });

  it('keeps ordinary book markup', () => {
    const html = '<div class="title"><p>Глава 1</p></div><p>Текст <em>курсив</em> <a href="#note1" class="note-link">1</a></p>';
    expect(sanitizeHtml(html)).toBe(html);
  });
});
