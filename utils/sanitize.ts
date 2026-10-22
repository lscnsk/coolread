// Book HTML comes from files and online catalogs, so it is untrusted. The reader puts it
// into the page with innerHTML, where an inline handler such as <img onerror> would run
// with full access to the app and its native plugins. Strip everything that can run code.

const DROP_TAGS = 'script,iframe,frame,frameset,object,embed,applet,base,link,meta,noscript,portal,template';
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'data', 'poster', 'background', 'srcset', 'lowsrc', 'dynsrc']);

function isUnsafeUrl(value: string): boolean {
  // Remove control characters and spaces that browsers ignore inside a scheme ("java\tscript:")
  const v = value.replace(/[\u0000-\x20\u007f-\u009f]+/g, '').toLowerCase();
  if (v.startsWith('javascript:') || v.startsWith('vbscript:')) return true;
  // Images stay allowed as data: URLs; data:text/html and the like are not
  if (v.startsWith('data:') && !v.startsWith('data:image/')) return true;
  return false;
}

/** Removes scripts, event handlers and script URLs from a parsed (inert) document or element. */
export function sanitizeNode(root: ParentNode): void {
  root.querySelectorAll(DROP_TAGS).forEach(el => el.remove());
  // SVG animation can rewrite href to a javascript: URL
  root.querySelectorAll('animate,set,animateTransform,animateMotion').forEach(el => {
    const target = (el.getAttribute('attributeName') || '').toLowerCase();
    if (target.includes('href') || target.startsWith('on')) el.remove();
  });
  root.querySelectorAll('*').forEach(el => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') {
        el.removeAttribute(attr.name);
      } else if (URL_ATTRS.has(name) || name.endsWith(':href')) {
        if (isUnsafeUrl(attr.value)) el.removeAttribute(attr.name);
      } else if (name === 'style' && /expression\s*\(|javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });
}

/** Returns a safe copy of an HTML string. */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeNode(doc.body);
  // Book stylesheets inside the body are kept: they style the chapter
  return doc.body.innerHTML;
}
