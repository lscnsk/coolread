// Cloudflare Worker: fetches catalog pages and books for the CoolRead web version.
// A browser may not read other sites (OPDS catalogs, az.lib.ru, MangaDex) directly;
// this worker fetches them and adds the permission headers. Android does not need it.
//
// Setup: see web-pwa/README.md. Set the variable ALLOWED_ORIGIN to the site address,
// e.g. https://name.github.io, so other sites cannot use your worker.

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    const okOrigin = allowed.length === 0 || allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': okOrigin && origin ? origin : allowed[0] || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Type, Content-Disposition',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('Only GET', { status: 405, headers: cors });
    if (!okOrigin) return new Response('Forbidden', { status: 403, headers: cors });

    const target = new URL(request.url).searchParams.get('url');
    let url;
    try { url = new URL(target || ''); } catch { return new Response('Bad url', { status: 400, headers: cors }); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return new Response('Bad url', { status: 400, headers: cors });

    const headers = new Headers();
    for (const h of ['Authorization', 'Accept']) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }
    headers.set('User-Agent', 'CoolRead (web)');
    const res = await fetch(url.toString(), { headers, redirect: 'follow' });
    const out = new Headers(cors);
    for (const h of ['Content-Type', 'Content-Disposition', 'Content-Length', 'Last-Modified']) {
      const v = res.headers.get(h);
      if (v) out.set(h, v);
    }
    return new Response(res.body, { status: res.status, headers: out });
  },
};
