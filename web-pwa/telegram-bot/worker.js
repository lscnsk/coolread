// Cloudflare Worker: the CoolRead Telegram bot.
// Sends book cards (cover, title, author, description, "Читать в CoolRead" button) as
// Telegram rich messages, and lets readers read short books right in the chat, part by part.
//
// Books, covers and the parts come from the lscnsk_library repository:
//   catalog.json, covers/<id>.jpg, telegram/<id>/index.json and telegram/<id>/<n>.html
// (telegram/ is made by scripts/build-telegram.mjs there after every push).
//
// Setup: see web-pwa/README.md, "Бот с карточками книг".
//   BOT_TOKEN  (secret)    the key from @BotFather
//   APP_NAME   (optional)  the Mini App short name from /newapp, "read" by default
// After deploying, open https://<worker address>/setup once: it connects the bot to this worker.

const LIBRARY = 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main';
const LITE_URL = 'https://lscnsk.github.io/coolread/tg/';
const PER_PAGE = 8; // contents entries per message

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const validId = id => /^[A-Za-z0-9_-]{1,40}$/.test(id || '');
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);
const pages = n => {
  const k = n % 10, kk = n % 100;
  return k === 1 && kk !== 11 ? 'страница' : k >= 2 && k <= 4 && (kk < 12 || kk > 14) ? 'страницы' : 'страниц';
};
const partsWord = n => {
  const k = n % 10, kk = n % 100;
  return k === 1 && kk !== 11 ? 'часть' : k >= 2 && k <= 4 && (kk < 12 || kk > 14) ? 'части' : 'частей';
};

async function secretOf(token) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('coolread:' + token));
  return [...new Uint8Array(hash)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.BOT_TOKEN) return new Response('Добавьте секрет BOT_TOKEN в настройках воркера.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    const bot = new Bot(env);

    if (request.method === 'GET' && url.pathname === '/setup') return bot.setup(url.origin);
    if (request.method === 'GET') return new Response('CoolRead bot is running', { headers: { 'Content-Type': 'text/plain' } });
    if (request.method !== 'POST') return new Response('Only POST', { status: 405 });

    // Only Telegram knows this header value (it is given to Telegram in /setup)
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await secretOf(env.BOT_TOKEN)) {
      return new Response('Forbidden', { status: 403 });
    }
    try {
      await bot.handle(await request.json());
    } catch (e) {
      console.error('update failed', e && e.stack || e);
    }
    // Always 200: otherwise Telegram repeats the same update again and again
    return new Response('ok');
  },
};

let me = null; // the bot's own username, asked once per worker start

class Bot {
  constructor(env) {
    this.token = env.BOT_TOKEN;
    this.app = env.APP_NAME || 'read';
  }

  async api(method, params) {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
    });
    const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
    if (!data.ok) console.warn(method, data.description);
    return data;
  }

  async username() {
    if (!me) me = (await this.api('getMe')).result?.username || null;
    return me;
  }

  // A link that opens the book in the CoolRead Mini App
  async appLink(id) {
    const name = await this.username();
    if (!name) return LITE_URL + (id ? `#book=${id}` : '');
    return `https://t.me/${name}/${this.app}` + (id ? `?startapp=book_${id}` : '');
  }

  async json(path) {
    const res = await fetch(`${LIBRARY}/${path}`, { cf: { cacheTtl: 300, cacheEverything: true } });
    return res.ok ? res.json() : null;
  }

  async text(path) {
    const res = await fetch(`${LIBRARY}/${path}`, { cf: { cacheTtl: 300, cacheEverything: true } });
    return res.ok ? res.text() : null;
  }

  async books() {
    const data = await this.json('catalog.json');
    return (data && data.books) || [];
  }

  // Sends a rich message; if Telegram does not accept it, tries again without pictures,
  // then as an ordinary message, so the reader always gets something
  async rich(chat, html, keyboard, plain) {
    const base = { chat_id: chat, ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) };
    let r = await this.api('sendRichMessage', { ...base, rich_message: { html } });
    if (r.ok) return r;
    const noMedia = html.replace(/<figure>[\s\S]*?<\/figure>|<tg-collage>[\s\S]*?<\/tg-collage>|<img [^>]*\/?>/g, '');
    if (noMedia !== html) {
      r = await this.api('sendRichMessage', { ...base, rich_message: { html: noMedia } });
      if (r.ok) return r;
    }
    return this.api('sendMessage', {
      ...base, text: plain || 'Не получилось показать это сообщение.', parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  }

  async handle(update) {
    if (update.callback_query) return this.onButton(update.callback_query);
    const msg = update.message;
    if (!msg || !msg.chat) return;
    const chat = msg.chat.id;
    const text = (msg.text || '').trim();
    const [cmd, ...rest] = text.split(/\s+/);
    const command = cmd.startsWith('/') ? cmd.slice(1).replace(/@.*$/, '').toLowerCase() : '';
    const arg = rest.join(' ');

    if (command === 'start') {
      const m = /^(?:book|read)_([A-Za-z0-9_-]+)$/.exec(arg);
      if (m) return this.card(chat, m[1]);
      return this.list(chat, true);
    }
    if (command === 'books' || command === 'list') return this.list(chat, false);
    if (command === 'help') return this.help(chat);
    if (command) return this.help(chat);
    if (text && msg.chat.type === 'private') return this.search(chat, text);
  }

  async onButton(q) {
    const chat = q.message?.chat?.id;
    const [kind, id, n] = String(q.data || '').split(':');
    await this.api('answerCallbackQuery', { callback_query_id: q.id });
    if (!chat) return;
    if (kind === 'l') return this.list(chat, false);
    if (!validId(id)) return;
    if (kind === 'c') return this.card(chat, id);
    if (kind === 'r') return this.part(chat, id, Math.max(1, parseInt(n, 10) || 1));
    if (kind === 't') return this.contents(chat, id, Math.max(0, parseInt(n, 10) || 0));
  }

  async help(chat) {
    const html = '<h3>Что умеет бот</h3>'
      + '<ul><li><b>/books</b> — все книги</li>'
      + '<li>Напишите название или автора — пришлю карточку книги</li>'
      + '<li>«Читать здесь» на карточке — книга прямо в чате, частями</li>'
      + '<li>«Читать в CoolRead» — книга в приложении: темы, закладки, чтение вслух</li></ul>';
    return this.rich(chat, html, [[{ text: '📚 Все книги', callback_data: 'l' }]], 'Что умеет бот: /books — все книги; напишите название или автора — пришлю карточку.');
  }

  async list(chat, welcome) {
    const books = await this.books();
    if (!books.length) return this.api('sendMessage', { chat_id: chat, text: 'Каталог сейчас недоступен, попробуйте чуть позже.' });
    const covers = books.filter(b => b.cover).slice(0, 6)
      .map(b => `<img src="${esc(`${LIBRARY}/${b.cover}`)}"/>`).join('');
    const intro = welcome
      ? '<h2>CoolRead</h2><p>Книги из библиотеки lscnsk. Нажмите на книгу, чтобы увидеть её карточку. Короткие книги можно читать прямо здесь, в чате, любые — в приложении CoolRead.</p>'
      : '<h2>Книги CoolRead</h2>';
    const items = books.map(b => `<li><b>${esc(b.title)}</b> — ${esc(b.author)}</li>`).join('');
    const html = (covers ? `<tg-collage>${covers}</tg-collage>` : '') + intro + `<ul>${items}</ul>`;
    const keyboard = books.map(b => [{ text: cut(`${b.title} — ${b.author}`, 60), callback_data: `c:${b.id}` }]);
    keyboard.push([{ text: '📖 Открыть CoolRead', url: await this.appLink() }]);
    const plain = '<b>Книги CoolRead</b>\n' + books.map(b => `• ${esc(b.title)} — ${esc(b.author)}`).join('\n');
    return this.rich(chat, html, keyboard, plain);
  }

  async search(chat, query) {
    const q = query.toLowerCase().replace(/ё/g, 'е');
    const books = await this.books();
    const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
    const found = books.filter(b => norm(b.title).includes(q) || norm(b.author).includes(q) || norm(b.series).includes(q));
    // A story inside a collection, e.g. "Прибрежный пират" in "Флэпперы и философы"
    if (!found.length && q.length >= 4) {
      for (const b of books) {
        const idx = await this.json(`telegram/${b.id}/index.json`);
        const hit = idx?.toc?.find(t => norm(t.title).includes(q));
        if (hit) {
          return this.rich(chat,
            `<p>«${esc(hit.title)}» — в книге <b>${esc(b.title)}</b> (${esc(b.author)}).</p>`,
            [[{ text: `💬 Читать «${cut(hit.title, 40)}»`, callback_data: `r:${b.id}:${hit.part}` }],
              [{ text: '📕 Карточка книги', callback_data: `c:${b.id}` }]]);
        }
      }
    }
    if (!found.length) {
      return this.api('sendMessage', {
        chat_id: chat, text: 'Такой книги не нашлось. Вот все книги:',
        reply_markup: { inline_keyboard: [[{ text: '📚 Все книги', callback_data: 'l' }]] },
      });
    }
    for (const b of found.slice(0, 3)) await this.card(chat, b.id, books);
  }

  async card(chat, id, books) {
    const b = (books || await this.books()).find(x => x.id === id);
    if (!b) return this.api('sendMessage', { chat_id: chat, text: 'Эта книга больше не в каталоге.' });
    const idx = await this.json(`telegram/${id}/index.json`);

    const meta = [esc(b.author), b.year ? esc(b.year) : ''].filter(Boolean).join(', ');
    const desc = String(b.description || b.annotation || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const descLen = desc.join(' ').length;
    let html = b.cover ? `<figure><img src="${esc(`${LIBRARY}/${b.cover}`)}"/></figure>` : '';
    html += `<h2>${esc(b.title)}</h2><p><b>${meta}</b></p>`;
    if (b.series) html += `<p><i>${esc(b.series)}</i></p>`;
    if (desc.length && descLen <= 600) html += desc.map(p => `<p>${esc(p)}</p>`).join('');
    else if (desc.length) html += `<blockquote expandable>${desc.map(esc).join('<br><br>')}</blockquote>`;
    const facts = [];
    if (b.pageCount) facts.push(`≈ ${b.pageCount} ${pages(b.pageCount)}`);
    if (idx && !idx.excerpt) facts.push(`в чате — ${idx.parts} ${partsWord(idx.parts)}`);
    if (b.badge) facts.push(esc(b.badge));
    if (facts.length) html += `<footer>${facts.join(' · ')}</footer>`;

    const keyboard = [[{ text: '📖 Читать в CoolRead', url: await this.appLink(id) }]];
    if (idx) {
      const toc = (idx.toc || []).length > 1;
      keyboard.push([{
        text: idx.excerpt ? '💬 Начало книги здесь' : '💬 Читать здесь',
        callback_data: toc && !idx.excerpt ? `t:${id}:0` : `r:${id}:1`,
      }]);
    }
    if (b.sampler) {
      const s = (books || await this.books()).find(x => x.id === b.sampler);
      if (s) keyboard.push([{ text: cut(`✨ Сначала покороче: «${s.title}»`, 60), callback_data: `c:${s.id}` }]);
    }
    keyboard.push([{ text: '📚 Все книги', callback_data: 'l' }]);

    const plain = `<b>${esc(b.title)}</b>\n${meta}` + (desc.length ? `\n\n${esc(cut(desc.join(' '), 700))}` : '');
    if (b.cover) {
      // Fallback for old Telegram versions: a photo with a caption
      const r = await this.api('sendRichMessage', { chat_id: chat, rich_message: { html }, reply_markup: { inline_keyboard: keyboard } });
      if (r.ok) return r;
      const p = await this.api('sendPhoto', {
        chat_id: chat, photo: `${LIBRARY}/${b.cover}`, caption: cut(plain, 1000), parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
      if (p.ok) return p;
    }
    return this.rich(chat, html, keyboard, plain);
  }

  async contents(chat, id, page) {
    const idx = await this.json(`telegram/${id}/index.json`);
    if (!idx) return this.part(chat, id, 1);
    const toc = idx.toc || [];
    const from = page * PER_PAGE;
    const shown = toc.slice(from, from + PER_PAGE);
    const keyboard = shown.map(t => [{ text: cut(t.title, 60), callback_data: `r:${id}:${t.part}` }]);
    const nav = [];
    if (page > 0) nav.push({ text: '◀', callback_data: `t:${id}:${page - 1}` });
    if (from + PER_PAGE < toc.length) nav.push({ text: '▶', callback_data: `t:${id}:${page + 1}` });
    if (nav.length) keyboard.push(nav);
    keyboard.push([{ text: '▶ С начала книги', callback_data: `r:${id}:1` }]);
    const html = `<h3>${esc(idx.title)}</h3><p>Содержание${toc.length > PER_PAGE ? ` (${from + 1}–${from + shown.length} из ${toc.length})` : ''}. Нажмите, с чего начать.</p>`;
    return this.rich(chat, html, keyboard, `<b>${esc(idx.title)}</b>\nСодержание:`);
  }

  async part(chat, id, n) {
    const idx = await this.json(`telegram/${id}/index.json`);
    const appLink = await this.appLink(id);
    if (!idx || n > idx.parts) {
      return this.api('sendMessage', {
        chat_id: chat, text: 'Эту книгу удобнее читать в приложении.',
        reply_markup: { inline_keyboard: [[{ text: '📖 Читать в CoolRead', url: appLink }]] },
      });
    }
    const body = await this.text(`telegram/${id}/${n}.html`);
    if (!body) return this.api('sendMessage', { chat_id: chat, text: 'Не получилось загрузить эту часть, попробуйте ещё раз.' });

    let html = body;
    if (idx.excerpt) html += '<p><i>Это начало книги. Дальше — в приложении CoolRead.</i></p>';
    html += `<footer>${esc(idx.title)} · ${idx.excerpt ? 'начало книги' : `часть ${n} из ${idx.parts}`}</footer>`;

    const keyboard = [];
    if (n < idx.parts) keyboard.push([{ text: `Дальше ▶  ${n + 1} из ${idx.parts}`, callback_data: `r:${id}:${n + 1}` }]);
    keyboard.push([{ text: idx.excerpt ? '📖 Читать дальше в CoolRead' : '📖 Открыть в CoolRead', url: appLink }]);
    const row = [];
    if ((idx.toc || []).length > 1 && !idx.excerpt) row.push({ text: '☰ Содержание', callback_data: `t:${id}:0` });
    if (n >= idx.parts) row.push({ text: '📚 Другие книги', callback_data: 'l' });
    if (row.length) keyboard.push(row);

    return this.rich(chat, html, keyboard,
      `<b>${esc(idx.title)}</b>, часть ${n}: эту часть не получилось показать в чате, откройте её в CoolRead.`);
  }

  // Connects the bot to this worker: Telegram will send every message here
  async setup(origin) {
    const name = await this.username();
    const page = (title, text) => new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>`
      + `<body style="font:18px/1.5 system-ui;max-width:640px;margin:40px auto;padding:0 16px"><h2>${title}</h2>${text}</body>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    if (!name) return page('Ключ бота не подошёл', '<p>Проверьте секрет BOT_TOKEN: скопируйте ключ из @BotFather ещё раз целиком.</p>');
    const hook = await this.api('setWebhook', {
      url: origin + '/',
      secret_token: await secretOf(this.token),
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    });
    await this.api('setMyCommands', {
      commands: [
        { command: 'books', description: 'Все книги' },
        { command: 'help', description: 'Что умеет бот' },
      ],
    });
    if (!hook.ok) return page('Не получилось', `<p>Telegram ответил: ${esc(hook.description)}</p>`);
    return page('Готово', `<p>Бот <b>@${esc(name)}</b> подключён. Откройте <a href="https://t.me/${esc(name)}?start=">t.me/${esc(name)}</a> и нажмите «Запустить» (или напишите /books).</p>`
      + `<p>Ссылка на карточку книги: <code>https://t.me/${esc(name)}?start=book_ff</code></p>`);
  }
}
