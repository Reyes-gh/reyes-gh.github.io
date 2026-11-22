/* ---- js/core.js ---- */
/* Guide core: on-demand data loading, routing, language, rendering helpers and global search. */
(function () {
  'use strict';

  const MH2 = (window.MH2 = {
    data: {},
    views: {},
    waiting: {},
  });
  /**
   * Language mode: 'en' = English only (every Japanese text hidden), 'both' = English with the Japanese names as
   * subtitles, 'jp' = Japanese names first. MH2.lang is the language of the main names ('en' | 'jp').
   */
  const LANG_MODES = ['en', 'both', 'jp'];
  MH2.langMode = (() => {
    let m = null;
    try { m = localStorage.getItem('mh2.langMode') || (localStorage.getItem('mh2.lang') === 'jp' ? 'jp' : null); } catch (e) { /* storage off */ }
    return LANG_MODES.includes(m) ? m : 'both';
  })();
  MH2.lang = MH2.langMode === 'jp' ? 'jp' : 'en';
  MH2.noJp = MH2.langMode === 'en';
  /** Removes Japanese runs from mixed text ("Maka Recipes マカ漬けの壷リスト" -> "Maka Recipes") in English-only mode. */
  MH2.stripJp = (s) => (MH2.noJp ? String(s).replace(/[　-ヿ㐀-鿿豈-﫿！-～｡-ﾟ々〆〜]+/g, ' ').replace(/\s{2,}/g, ' ').trim() : s);
  /** Notes copied from the original wiki carry a little markup (button icons, ×, sup/sub, attribute images) and sometimes a
   *  stray closing tag. Parse it as HTML, keep only harmless inline tags, drop the rest, and point images at our copies. */
  const RICH_TAGS = /^(SPAN|SUP|SUB|B|I|EM|STRONG|SMALL|BR|IMG|DETAILS|SUMMARY|TABLE|THEAD|TBODY|TR|TH|TD)$/;
  const richCache = new Map();
  MH2.rich = (s) => {
    if (s == null || s === '') return '';
    s = String(s);
    if (!/[<&]/.test(s)) return MH2.esc(s);
    if (richCache.has(s)) return richCache.get(s);
    const t = document.createElement('template');
    t.innerHTML = s;
    [...t.content.querySelectorAll('*')].forEach((el) => {
      if (!RICH_TAGS.test(el.nodeName)) { el.replaceWith(...el.childNodes); return; }
      [...el.attributes].forEach((a) => { if (!/^(class|src|alt|title)$/.test(a.name) || /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name); });
      if (el.nodeName === 'TABLE') el.classList.add('tbl', 'note-tbl');
      if (el.nodeName === 'IMG') {
        const src = (el.getAttribute('src') || '').replace(/^(\.\.\/)+images\//, 'img/common/');
        if (/^img\//.test(src)) { el.setAttribute('src', src); el.setAttribute('alt', el.getAttribute('title') || ''); el.classList.add('va-m'); } else el.remove();
      }
    });
    const out = t.innerHTML;
    richCache.set(s, out);
    return out;
  };

  /* ---------- data: each data/x.js calls MH2.put('x', {...}) ---------- */
  // same version tools/build.py stamped into index.html, so stale cached packs are never used
  const VERSION = document.currentScript ? new URL(document.currentScript.src, location.href).searchParams.get('v') : '';
  MH2.put = function (name, value) {
    MH2.data[name] = value;
    (MH2.waiting[name] || []).forEach((f) => f(value));
    delete MH2.waiting[name];
  };
  MH2.need = function (...names) {
    return Promise.all(
      names.map(
        (n) =>
          MH2.data[n] ||
          new Promise((resolve, reject) => {
            if (!MH2.waiting[n]) {
              MH2.waiting[n] = [];
              const s = document.createElement('script');
              s.src = 'data/' + n + '.js' + (VERSION ? '?v=' + VERSION : '');
              s.onerror = () => reject(new Error('Could not load data/' + n + '.js'));
              document.head.appendChild(s);
            }
            MH2.waiting[n].push(resolve);
          })
      )
    );
  };

  /* ---------- helpers ---------- */
  const esc = (MH2.esc = (s) =>
    s == null ? '' : String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]));
  MH2.num = (n) => (n == null || n === '' ? '–' : typeof n === 'number' ? n.toLocaleString('en-US') : esc(n));
  /** Price in zenny; values that already carry a unit (e.g. '600P' = shooting gallery points) are left as they are. */
  MH2.z = (n) => (n == null || n === '' ? '–' : typeof n === 'string' && /\D$/.test(n) ? MH2.esc(n) : MH2.num(n) + 'z');
  /** Text in the chosen language: L(english, japanese). */
  MH2.L = (en, jp) => (MH2.lang === 'jp' && jp ? jp : en || jp || '');
  /** Name of a data object with name/japanese or n/j. */
  MH2.nm = (o) => (o ? MH2.L(o.name ?? o.n ?? o.title, o.japanese ?? o.j ?? o.titleJapanese) : '');
  MH2.icon = (cls, title) => (cls ? `<span class="${esc(cls)}"${title ? ` title="${esc(title)}"` : ''}></span>` : '<span class="noicon"></span>');
  MH2.slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  MH2.stars = (n) => (n ? '★'.repeat(n) : '');
  MH2.pct = (p) => (p == null ? '' : `<span class="pct">${p}%</span>`);
  MH2.attrIcon = (a, t) => (a ? `<img class="attr" src="img/common/attributes/${esc(a)}.png" alt="${esc(t || a)}" title="${esc(t || a)}">` : '');
  MH2.rarity = (r) => (r ? `<span class="rar r${r}">${r}</span>` : '');

  /** Link to an item by index, with icon and optional quantity. */
  MH2.item = function (id, qty, extra) {
    const it = MH2.data.core.items[id];
    if (!it) return '<span class="chip muted"><span class="noicon"></span>Nothing</span>';
    return `<a class="chip r${it.r || 0}" href="#/item/${id}">${MH2.icon(it.i)}<span>${esc(MH2.L(it.n, it.j))}</span>${
      qty != null && qty !== '' ? `<b class="qty">×${esc(qty)}</b>` : ''
    }${extra || ''}</a>`;
  };
  /** Crafting material: {id, q} (item) or {deco, q} (decoration). */
  MH2.mat = function (m) {
    if (m.id != null) return MH2.item(m.id, m.q ?? m.quantity);
    if (m.deco != null) return `<a class="chip deco" href="#/armor/Decorations">${MH2.decoIcon(m.deco)}<span>${esc(MH2.decoName(m.deco))}</span><b class="qty">×${esc(m.q)}</b></a>`;
    return `<span class="chip">${esc(MH2.L(m.n || m.name, m.j || m.japanese))}${m.q ? ` <b class="qty">×${esc(m.q)}</b>` : ''}</span>`;
  };
  const deco = (idx) => (MH2.data.armor?.decorations || []).find((x) => x.index == idx);
  MH2.decoName = (idx) => {
    const d = deco(idx);
    return d ? MH2.L(d.name, d.japanese) : 'Decoration #' + idx;
  };
  /** Decoration icon: gem in the decoration's color, as in the game. */
  MH2.decoIcon = (idx) => MH2.icon(`${deco(idx)?.color || 'gray'}-icon gem-icon`);
  /** Weapon-type icon for damage types (cut / impact / shot), as the old site used in hitzone headers. */
  const DMG = { Cut: 'white-icon great-sword-icon', Impact: 'white-icon hammer-icon', Shot: 'white-icon shot-icon' };
  MH2.dmgIcon = (t) => `<span class="dmg" title="${t}">${MH2.icon(DMG[t])}</span>`;
  MH2.mats = (list) => (list && list.length ? `<div class="chips">${list.map(MH2.mat).join('')}</div>` : '<span class="muted">–</span>');
  MH2.monster = function (k, extra) {
    const m = MH2.data.core.monsters[k];
    if (!m) return '';
    return `<a class="chip mon" href="#/monster/${esc(m.id)}">${MH2.icon(m.i)}<span>${esc(MH2.L(m.n, m.j))}</span>${extra || ''}</a>`;
  };
  MH2.monsterIndex = (slug) => MH2.data.core.monsters.findIndex((m) => m.id === slug);

  /** Section block with a plate-style title. */
  MH2.section = (title, body, opts = {}) =>
    body ? `<section class="panel${opts.cls ? ' ' + opts.cls : ''}"${opts.id ? ` id="${opts.id}"` : ''}><h2 class="plate">${title}</h2>${body}</section>` : '';
  /** Tabs as links (routes). */
  MH2.tabs = (list, active, cls = '') =>
    `<div class="tabs${cls ? ' ' + cls : ''}">${list.map(([href, label, ico]) => MH2.tab(href, label, ico, href === active)).join('')}</div>`;
  /** One tab: icon (sprite class or ready HTML) + label; the label is cut with … when longer than the tile, full text on hover. */
  MH2.tab = (href, label, ico, on) => {
    const text = String(label).replace(/<[^>]*>/g, '').trim();
    return `<a href="${href}" class="tab${on ? ' on' : ''}" title="${esc(text)}">${ico ? MH2.icon(ico) : ''}<span class="tab-label">${label}</span></a>`;
  };
  /** Generic table: columns [{h, f(row), cls}] */
  MH2.table = (cols, rows, opts = {}) =>
    `<div class="tbl-wrap"><table class="tbl${opts.cls ? ' ' + opts.cls : ''}"><thead><tr>${cols
      .map((c) => `<th class="${c.cls || ''}"${c.title ? ` title="${esc(c.title)}"` : ''}>${c.h}</th>`)
      .join('')}</tr></thead>${MH2.tbody(rows, (r, i) => `<tr${opts.rowAttr ? ' ' + opts.rowAttr(r, i) : ''}>${cols.map((c) => `<td class="${c.cls || ''}">${c.f(r, i)}</td>`).join('')}</tr>`, opts.full)}</table></div>`;

  /**
   * Progressive table body. Long tables only build and lay out the rows that fit the first screen; the rest are
   * added in one go right after that first frame has been painted, so opening a page never waits on hundreds of
   * off-screen rows. Everything is rendered at once when the reader is scrolled down (a filter/redraw mid-page),
   * or when `full` is set (e.g. a row is expanded and has to be scrolled to).
   */
  const FIRST_ROWS = 40;
  const pendingRows = new Map();
  let pendingSeq = 0;
  // after the first paint, in the browser's next idle moment (so a click or key right after opening a page is not kept
  // waiting), at the latest 300 ms later; as soon as the reader scrolls; the timer also covers background tabs
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 50));
  const scheduleFlush = () => {
    requestAnimationFrame(() => setTimeout(() => idle(MH2.flushRows, { timeout: 300 }), 0));
    setTimeout(MH2.flushRows, 400);
  };
  document.addEventListener('scroll', () => pendingRows.size && MH2.flushRows(), { passive: true, capture: true });
  MH2.tbody = (rows, rowFn, full) => {
    const html = (from, to) => { let s = ''; for (let i = from; i < to; i++) s += rowFn(rows[i], i); return s; };
    if (full || rows.length <= FIRST_ROWS * 1.5 || (!MH2.navigating && window.scrollY > 300)) return `<tbody>${html(0, rows.length)}</tbody>`;
    const id = ++pendingSeq;
    pendingRows.set(id, () => html(FIRST_ROWS, rows.length));
    if (pendingRows.size === 1) scheduleFlush();
    return `<tbody data-more="${id}">${html(0, FIRST_ROWS)}</tbody>`;
  };
  /**
   * Same idea for tables that arrive as ready-made HTML (the Miscellany pages): right after the HTML is inserted
   * and before anything is laid out, the rows past the first screen are lifted out and put back after the first paint.
   */
  MH2.deferRows = (root) => {
    if (window.scrollY > 300) return;
    let budget = FIRST_ROWS; // rows kept for the first screen, shared by all the tables on the page
    root.querySelectorAll('tbody:not([data-more])').forEach((tb) => {
      const keep = Math.max(0, budget);
      budget -= tb.rows.length;
      if (tb.rows.length - keep < 10) return;
      const range = document.createRange();
      range.setStartBefore(tb.rows[keep]);
      range.setEndAfter(tb.lastChild);
      const rest = range.extractContents();
      const id = ++pendingSeq;
      tb.dataset.more = id;
      pendingRows.set(id, () => rest);
      if (pendingRows.size === 1) scheduleFlush();
    });
  };
  /**
   * Table frames. A table that fits the page stays in the page flow and its header sticks under the top bar while
   * the page scrolls. A table wider than the page becomes its own scroll box (both ways, at most one screen tall,
   * header sticky inside it), so it is never cut off and its horizontal scrollbar is always within reach.
   * Re-checked whenever a table or its frame changes size (window resize, zoom, rows added later).
   */
  const fitObserver = new ResizeObserver((entries) => {
    const wraps = new Set(entries.map((e) => (e.target.classList.contains('tbl-wrap') ? e.target : e.target.closest('.tbl-wrap'))));
    wraps.forEach((w) => {
      const t = w && w.querySelector(':scope > table');
      if (t) w.classList.toggle('wide', t.offsetWidth > w.clientWidth + 1);
    });
  });
  const watchTables = (root) => root.querySelectorAll('.tbl-wrap:not(.tall):not([data-fit])').forEach((w) => {
    const t = w.querySelector(':scope > table');
    if (!t) return;
    w.dataset.fit = '';
    fitObserver.observe(w);
    fitObserver.observe(t);
  });
  // (rows being added to a table are skipped: only new content blocks can bring new tables)
  new MutationObserver((list) => list.forEach((m) => { if (m.addedNodes.length && !/^(TBODY|TR|TABLE|THEAD)$/.test(m.target.nodeName)) watchTables(m.target); }))
    .observe(document.getElementById('view'), { childList: true, subtree: true });
  // header height, so sticky table headers sit right under it
  const topBar = document.querySelector('.top');
  if (topBar) new ResizeObserver(() => document.documentElement.style.setProperty('--top-h', topBar.offsetHeight + 'px')).observe(topBar);

  /** Adds the deferred rows of every progressive table on the page (tables that were discarded are dropped). */
  MH2.flushRows = () => {
    for (const [id, rest] of pendingRows) {
      const tb = document.querySelector(`tbody[data-more="${id}"]`);
      if (!tb) continue;
      tb.removeAttribute('data-more');
      const more = rest();
      if (typeof more === 'string') tb.insertAdjacentHTML('beforeend', more); else tb.append(more);
    }
    pendingRows.clear();
  };
  MH2.empty = (msg) => `<p class="empty">${msg}</p>`;
  /**
   * Normalizes text for matching: lowercase, no accents, full-width -> normal width, hiragana -> katakana,
   * apostrophes removed ("killer's" -> "killers"), '&' -> 'and', any other punctuation -> a single space ("kut-ku" -> "kut ku").
   */
  MH2.norm = (s) =>
    String(s || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
      .replace(/&/g, ' and ')
      .replace(/['’`]/g, '')
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
      .trim();
  /**
   * Forgiving "does text match the query" used by the filter boxes: every query word must appear (any order),
   * and spaces are optional ("kutku" matches "Kut-Ku").
   */
  MH2.matches = (text, query) => {
    const nq = MH2.norm(query);
    if (!nq) return true;
    const t = MH2.norm(text);
    const tc = t.replace(/ /g, '');
    return nq.split(' ').every((tok) => t.includes(tok) || tc.includes(tok)) || tc.includes(nq.replace(/ /g, ''));
  };
  /** Edit distance with an early exit once it exceeds max. */
  const lev = (a, b, max) => {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        best = Math.min(best, cur[j]);
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  };

  /* ---------- navigation ---------- */
  const NAV = [
    ['#/', 'Home', 'white-icon house-icon'],
    ['#/items', 'Items', 'white-icon jar-icon'],
    ['#/weapons', 'Weapons', 'white-icon great-sword-icon'],
    ['#/armor', 'Armor', 'white-icon helm-icon'],
    ['#/skills', 'Skills', 'white-icon book-icon'],
    ['#/monsters', 'Bestiary', 'white-icon claw-icon'],
    ['#/quests', 'Quests', 'white-icon ticket-icon'],
    ['#/events', 'Events', 'yellow-icon ticket-icon'],
    ['#/maps', 'Maps', 'white-icon map-icon'],
    ['#/meals', 'Meals', 'white-icon meat-icon'],
    ['#/extras', 'Miscellany', 'white-icon mystery-icon'],
  ];
  function renderNav(route) {
    const root = '#/' + (route[0] || '');
    const alias = { item: '#/items', monster: '#/monsters', quest: '#/quests', map: '#/maps', skill: '#/skills', weapon: '#/weapons' };
    const active = alias[route[0]] || root;
    document.getElementById('nav').innerHTML = NAV.map(
      ([href, label, ico]) => `<a href="${href}" class="${href === active || (href === '#/' && !route[0]) ? 'on' : ''}">${MH2.icon(ico)}<span>${label}</span></a>`
    ).join('');
  }

  /* ---------- router ----------
   * Pages live at real paths under the site folder (/mh2/item/190), so a shared link is a normal URL that link
   * previews (Discord…) can read; every route has a small static page with its own meta tags (tools/og.py).
   * The views still write links as "#/item/190": they are turned into "item/190" (resolved against <base>) as
   * they reach the page, and clicks on them navigate with history.pushState. Opened as a file, it stays on #/ routes.
   */
  MH2.hashMode = location.protocol === 'file:';
  MH2.base = document.baseURI.replace(/[?#].*$/, '').replace(/[^/]*$/, ''); // the site folder, set by <base> in each page
  const basePath = new URL(MH2.base).pathname;
  MH2.route = () =>
    decodeURIComponent(MH2.hashMode ? location.hash.replace(/^#\/?/, '') : location.pathname.slice(basePath.length).replace(/^\/+/, ''))
      .split('/')
      .filter((x, i) => x || i === 0);
  /** "#/item/190" → "item/190" (home "#/" → "./"); unchanged when opened as a file. */
  MH2.href = (h) => (MH2.hashMode ? h : h === '#/' ? './' : h.slice(2));
  const HASH_HREF = /href="#\/([^"]*)"/g;
  MH2.fixLinks = (html) => (MH2.hashMode ? html : html.replace(HASH_HREF, (m, r) => `href="${r || './'}"`));
  const fixLinksIn = (root) => {
    if (root.nodeType !== 1) return;
    if (root.matches('a[href^="#/"]')) root.setAttribute('href', MH2.href(root.getAttribute('href')));
    root.querySelectorAll('a[href^="#/"]').forEach((a) => a.setAttribute('href', MH2.href(a.getAttribute('href'))));
  };
  /** Opens a route ("item/190", "#/item/190" or a full URL inside the site) without reloading. */
  MH2.go = function (to, replace) {
    if (MH2.hashMode) { location.hash = to.startsWith('#') ? to : '#/' + to; return; }
    const url = new URL(to.startsWith('#/') ? MH2.href(to) : to, MH2.base).href;
    if (url !== location.href) history[replace ? 'replaceState' : 'pushState'](null, '', url);
    render();
  };
  function routerEvents() {
    if (MH2.hashMode) { window.addEventListener('hashchange', render); return; }
    // links shared in the old form (/mh2/#/item/190) still work and get the clean address
    if (/^#\//.test(location.hash)) history.replaceState(null, '', new URL(MH2.href(decodeURIComponent(location.hash)), MH2.base).href);
    window.addEventListener('popstate', render);
    fixLinksIn(document.body);
    // links added outside the main view (nav, search results, lists redrawn by a view, tooltips)
    new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(fixLinksIn))).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest('a[href]');
      if (!a || a.target || a.hasAttribute('download') || a.origin !== location.origin) return;
      if (!a.pathname.startsWith(basePath) || /\.[a-z0-9]+$/i.test(a.pathname)) return; // files (images, data) open normally
      e.preventDefault();
      MH2.go(a.href);
    });
  }
  let renderSeq = 0;
  async function render() {
    const route = MH2.route();
    renderNav(route);
    document.body.classList.remove('nav-open');
    const name = route[0] || 'home';
    const view = MH2.views[name] || MH2.views.notfound;
    const el = document.getElementById('view');
    window.dispatchEvent(new Event('mh2:navigate'));
    const seq = ++renderSeq;
    // the page dims only when it actually has to wait (a data pack still loading): an instant switch does not flash,
    // and the whole view is not turned into a fading GPU layer and re-rasterized twice on every click
    const dim = setTimeout(() => el.classList.add('loading'), 120);
    try {
      await MH2.need('core');
      MH2.navigating = !MH2.keepScroll; // a new page starts at the top, so its long tables can render progressively
      const html = await view(route.slice(1), el);
      MH2.navigating = false;
      if (seq !== renderSeq) return; // the user already navigated elsewhere
      if (typeof html === 'string') el.innerHTML = MH2.fixLinks(html);
      if (!MH2.keepScroll) window.scrollTo(0, 0);
      MH2.keepScroll = false;
      if (view.after) view.after(route.slice(1), el);
      // tab title from the page heading (the per-route pages start with it; keep it right while browsing)
      const h = name === 'home' ? null : el.querySelector('h1, h2');
      let t = '';
      if (h) { const c = h.cloneNode(true); c.querySelectorAll('small, .jp, .more, a').forEach((x) => x.remove()); t = c.textContent.replace(/\s+/g, ' ').trim(); }
      document.title = t ? `${t} · MH2 Hunter's Guide` : "MH2 Hunter's Guide · Monster Hunter 2 Dos";
      MH2.enhanceSelects(el);
    } catch (e) {
      console.error(e);
      el.innerHTML = `<section class="panel"><h2 class="plate">Error</h2><p>${esc(e.message)}</p></section>`;
    } finally {
      MH2.navigating = false;
      clearTimeout(dim);
      if (seq === renderSeq) el.classList.remove('loading');
    }
  }
  MH2.rerender = () => {
    MH2.keepScroll = true;
    render();
  };
  MH2.views.notfound = () => `<section class="panel"><h2 class="plate">Not found</h2><p>That page doesn't exist. <a href="#/">Back to home</a>.</p></section>`;

  /* ---------- global search ---------- */
  const TYPE = {
    i: ['Item', (r) => '#/item/' + r[1]],
    m: ['Monster', (r) => '#/monster/' + MH2.data.core.monsters[r[1]].id],
    w: ['Weapon', (r) => '#/weapons/' + MH2.slug(r[1]) + '/' + r[4]],
    a: ['Armor', (r) => '#/armor/' + r[1] + '/' + r[4]],
    d: ['Decoration', () => '#/armor/Decorations'],
    s: ['Skill', (r) => '#/skill/' + r[1]],
    q: ['Quest', (r) => '#/quest/' + r[1]],
    p: ['Map', (r) => '#/maps/' + r[1]],
  };
  const WEAPON_ICON = {
    'Great Sword': 'small-great-sword-icon', Longsword: 'small-longsword-icon', 'Sword and Shield': 'small-sword-icon', 'Dual Swords': 'small-dual-swords-icon',
    Hammer: 'small-hammer-icon', 'Hunting Horn': 'small-hunting-horn-icon', Lance: 'small-lance-icon', Gunlance: 'small-gunlance-icon',
    'Light Bowgun': 'small-light-bowgun-icon', 'Heavy Bowgun': 'small-heavy-bowgun-icon', Bow: 'small-bow-icon',
  };
  MH2.weaponIcon = (cls) => (WEAPON_ICON[cls] ? `<span class="small-icon ${WEAPON_ICON[cls]}"></span>` : '');
  const ARMOR_ICON = { Headgear: 'white-icon helm-icon', Torso: 'white-icon torso-icon', Arms: 'white-icon arms-icon', Waist: 'white-icon waist-icon', Legs: 'white-icon legs-icon' };
  MH2.armorIcon = (slot) => MH2.icon(ARMOR_ICON[slot] || 'gray-icon gem-icon');

  let searchIndex = null;
  const TYPE_ORDER = { m: 0, i: 1, p: 2, w: 3, a: 4, d: 5, s: 6, q: 7 };
  /**
   * Scores one entry (lower is better; null = no match):
   * 0 exact name · 1 the query starts the name or starts its words (any order, spaces optional) ·
   * 3 any-order / spaces-optional substring · 5+ typo-tolerant (1 typo for short words, 2 for long ones).
   * Ties are broken by type (monsters, items, maps, …) and then by shorter names.
   */
  function score(e, nq, toks, qc) {
    if (e.en === nq || e.jp === nq || e.enc === qc) return 0;
    if (e.en.startsWith(nq) || e.jp.startsWith(nq) || e.tails.some((x) => x.startsWith(qc)) || toks.every((t) => e.words.some((w) => w.startsWith(t)))) return 1;
    if (e.enc.includes(qc) || e.jpc.includes(qc) || toks.every((t) => e.all.includes(t))) return 3;
    let dist = 0;
    for (const t of toks) {
      if (t.length < 3) { if (!e.words.some((w) => w.startsWith(t))) return null; continue; }
      const max = t.length >= 6 ? 2 : 1;
      let best = max + 1;
      for (const w of e.words) {
        best = Math.min(best, lev(t, w.slice(0, t.length), max), lev(t, w, max));
        if (best === 0) break;
      }
      if (best > max) return null;
      dist += best;
    }
    return 5 + dist;
  }
  function search(q) {
    const nq = MH2.norm(q);
    if (!nq) return [];
    if (!searchIndex)
      searchIndex = MH2.data.core.search.map((r) => {
        const en = MH2.norm(r[2]), jp = MH2.norm(r[3]);
        const words = (en + ' ' + jp).split(' ').filter(Boolean);
        const enw = en.split(' ').filter(Boolean);
        // name from each word onwards without spaces: 'yian kut ku' -> yiankutku, kutku, ku (so 'kutku' starts a word)
        const tails = enw.map((_, k) => enw.slice(k).join(''));
        return { r, en, jp, enc: en.replace(/ /g, ''), jpc: jp.replace(/ /g, ''), all: en + ' ' + jp, words, tails };
      });
    const toks = nq.split(' ');
    const qc = nq.replace(/ /g, '');
    const out = [];
    for (const e of searchIndex) {
      const sc = score(e, nq, toks, qc);
      if (sc != null) out.push([sc, TYPE_ORDER[e.r[0]] ?? 9, e.en.length, e.r]);
    }
    out.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    return out.slice(0, 14).map((x) => x[3]);
  }
  function resultIcon(r) {
    if (r[0] === 'i' || r[0] === 'm') return MH2.icon(r[4]);
    if (r[0] === 'w') return `<span class="ri">${MH2.weaponIcon(r[1])}</span>`;
    if (r[0] === 'a') return MH2.armorIcon(r[1]);
    if (r[0] === 'd') return MH2.icon(r[5] || 'gray-icon gem-icon');
    if (r[0] === 's') return MH2.icon('white-icon book-icon');
    if (r[0] === 'p') return MH2.icon('white-icon map-icon');
    return MH2.icon('white-icon ticket-icon');
  }
  function setupSearch() {
    const input = document.getElementById('q');
    const box = document.getElementById('results');
    let sel = 0, list = [];
    const draw = () => {
      if (!list.length) {
        box.hidden = !input.value.trim();
        box.innerHTML = '<div class="sr-empty">No results</div>';
        return;
      }
      box.hidden = false;
      box.innerHTML = list
        .map((r, i) => `<a href="${TYPE[r[0]][1](r)}" class="${i === sel ? 'sel' : ''}">${resultIcon(r)}<span class="sr-name">${esc(MH2.L(r[2], r[3]))}<small>${esc(MH2.lang === 'jp' ? r[2] : r[3])}</small></span><em>${TYPE[r[0]][0]}</em></a>`)
        .join('');
    };
    input.addEventListener('input', async () => {
      await MH2.need('core');
      list = search(input.value);
      sel = 0;
      draw();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, list.length - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && list[sel]) { MH2.go(TYPE[list[sel][0]][1](list[sel])); close(); }
      else if (e.key === 'Escape') close();
    });
    const close = () => { box.hidden = true; input.blur(); };
    box.addEventListener('click', () => { box.hidden = true; input.value = ''; });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) box.hidden = true; });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { input.focus(); input.select(); e.preventDefault(); }
    });
  }

  /* ---------- custom selects ---------- */
  /** Option HTML for a custom select: <option data-icon="…html…">. The icon markup is generated by the views (trusted). */
  MH2.opt = (value, label, iconHtml, selected) =>
    `<option value="${esc(value)}"${selected ? ' selected' : ''}${iconHtml ? ` data-icon="${esc(iconHtml)}"` : ''}>${esc(label)}</option>`;
  /** Rarity 1–7 options, each with its colored rarity badge. */
  MH2.rarityOpts = (current) => [1, 2, 3, 4, 5, 6, 7].map((r) => MH2.opt(String(r), 'Rarity ' + r, MH2.rarity(r), String(current) === String(r))).join('');
  let openSel = null;
  const closeSel = () => {
    if (!openSel) return;
    openSel.classList.remove('open');
    openSel.querySelector('.csel-btn').setAttribute('aria-expanded', 'false');
    openSel = null;
  };
  /**
   * Replaces every native <select class="field"> inside root with a styled dropdown that can show icons.
   * The native select stays in the DOM (hidden) and keeps the value; choosing an option sets it and fires 'change',
   * so the views' existing listeners keep working.
   */
  MH2.enhanceSelects = function (root) {
    root.querySelectorAll('select.field:not([data-enhanced])').forEach((sel) => {
      sel.dataset.enhanced = '1';
      const wrap = document.createElement('div');
      wrap.className = 'csel';
      sel.parentNode.insertBefore(wrap, sel);
      wrap.appendChild(sel);
      const optHtml = (o) => `${o.dataset.icon ? `<span class="csel-ico">${o.dataset.icon}</span>` : ''}<span class="csel-txt">${esc(o.text)}</span>`;
      wrap.insertAdjacentHTML('beforeend', `<button type="button" class="csel-btn" aria-haspopup="listbox" aria-expanded="false"></button><div class="csel-list" role="listbox"></div>`);
      const btn = wrap.querySelector('.csel-btn');
      const list = wrap.querySelector('.csel-list');
      let active = 0;
      const paintBtn = () => {
        const cur = sel.options[sel.selectedIndex] || sel.options[0];
        btn.innerHTML = optHtml(cur) + '<span class="csel-caret">▾</span>';
      };
      const paintList = () => {
        list.innerHTML = [...sel.options].map((o, i) => `<div class="csel-opt${i === sel.selectedIndex ? ' sel' : ''}${i === active ? ' act' : ''}" role="option" data-i="${i}" aria-selected="${i === sel.selectedIndex}">${optHtml(o)}</div>`).join('');
      };
      const paint = () => { paintBtn(); paintList(); };
      const choose = (i) => {
        if (i !== sel.selectedIndex) {
          sel.selectedIndex = i;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        closeSel();
        paint();
        btn.focus();
      };
      const open = () => {
        closeSel();
        active = Math.max(0, sel.selectedIndex);
        paintList();
        wrap.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        openSel = wrap;
        list.querySelector('.act')?.scrollIntoView({ block: 'nearest' });
      };
      const move = (d) => {
        active = Math.min(sel.options.length - 1, Math.max(0, active + d));
        list.querySelectorAll('.csel-opt').forEach((el, i) => el.classList.toggle('act', i === active));
        list.querySelector('.act')?.scrollIntoView({ block: 'nearest' });
      };
      btn.addEventListener('click', () => (wrap.classList.contains('open') ? closeSel() : open()));
      btn.addEventListener('keydown', (e) => {
        const isOpen = wrap.classList.contains('open');
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!isOpen) open(); else move(e.key === 'ArrowDown' ? 1 : -1); }
        else if ((e.key === 'Enter' || e.key === ' ') && isOpen) { e.preventDefault(); choose(active); }
        else if (e.key === 'Escape' && isOpen) { e.preventDefault(); closeSel(); }
        else if (e.key === 'Home' && isOpen) { e.preventDefault(); move(-1e9); }
        else if (e.key === 'End' && isOpen) { e.preventDefault(); move(1e9); }
      });
      list.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus on the button
      list.addEventListener('click', (e) => { const o = e.target.closest('.csel-opt'); if (o) choose(Number(o.dataset.i)); });
      list.addEventListener('mousemove', (e) => { const o = e.target.closest('.csel-opt'); if (o && Number(o.dataset.i) !== active) { active = Number(o.dataset.i); list.querySelectorAll('.csel-opt').forEach((el, i) => el.classList.toggle('act', i === active)); } });
      sel.addEventListener('change', paint); // stay in sync if a view changes the value itself
      paint();
    });
  };
  document.addEventListener('click', (e) => { if (openSel && !e.composedPath().includes(openSel)) closeSel(); });

  /* ---------- startup ---------- */
  MH2.start = function () {
    const lang = document.getElementById('lang');
    const LABEL = { en: ['EN', 'English only (hide all Japanese text)'], both: ['EN · 日本語', 'English with Japanese names'], jp: ['日本語', 'Japanese names first'] };
    const applyLang = () => {
      MH2.lang = MH2.langMode === 'jp' ? 'jp' : 'en';
      MH2.noJp = MH2.langMode === 'en';
      const root = document.documentElement;
      root.classList.toggle('jp', MH2.lang === 'jp');
      root.classList.toggle('no-jp', MH2.noJp);
      lang.innerHTML = LANG_MODES.map((m) => `<button type="button" data-mode="${m}" class="${m === MH2.langMode ? 'on' : ''}" title="${LABEL[m][1]}" aria-pressed="${m === MH2.langMode}">${LABEL[m][0]}</button>`).join('');
    };
    applyLang();
    lang.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-mode]');
      if (!b || b.dataset.mode === MH2.langMode) return;
      MH2.langMode = b.dataset.mode;
      try { localStorage.setItem('mh2.langMode', MH2.langMode); } catch (err) { /* storage off */ }
      applyLang();
      MH2.rerender();
    });
    document.getElementById('menuBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    setupSearch();
    routerEvents();
    scrollShield();
    render().then(prefetch);
  };

  /**
   * While the page scrolls, rows, links and chips keep sliding under a still cursor, and every :hover change
   * makes the browser repaint (on big tables that alone ate most of a 179 Hz frame). A transparent layer covers
   * the page while it scrolls, so hover simply stays put; it goes away 120 ms after scrolling stops.
   * A click on it (scroll, then click right away) is handed to whatever is underneath.
   * Scroll boxes inside the page (tall tables, dropdowns) are left alone so the wheel keeps reaching them.
   */
  function scrollShield() {
    const shield = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'scroll-shield' }));
    let timer, pressed = false;
    const off = () => { if (!pressed) shield.classList.remove('on'); };
    document.addEventListener('scroll', (e) => {
      if (e.target !== document) return;
      if (!shield.classList.contains('on')) shield.classList.add('on');
      clearTimeout(timer);
      timer = setTimeout(off, 120);
    }, { passive: true, capture: true });
    shield.addEventListener('mousedown', () => (pressed = true));
    shield.addEventListener('click', (e) => {
      pressed = false;
      shield.classList.remove('on');
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      if (el.matches('input, select, textarea, button')) el.focus();
      el.click();
    });
    shield.addEventListener('mouseup', () => setTimeout(() => { pressed = false; off(); }, 0));
  }

  /**
   * Once the first page is up, the remaining data packs are loaded one by one while the browser is idle, so every
   * later page opens instantly instead of first waiting for its pack to download and parse.
   */
  function prefetch() {
    const queue = ['calendar', 'itemrel', 'monsters', 'weapons', 'armor', 'quests', 'meals', 'maps', 'extras'];
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
    const next = () => {
      const n = queue.shift();
      if (!n) return;
      if (MH2.data[n]) return next();
      idle(() => MH2.need(n).catch(() => {}).then(() => setTimeout(next, 50)), { timeout: 4000 });
    };
    setTimeout(next, 600);
  }
})();
;
/* ---- js/view-home.js ---- */
/* Home: intro, section shortcuts and database counts. */
(function () {
  const { esc } = MH2;
  const CARDS = [
    ['#/items', 'Items', 'Shops, combinations, gathering and rewards', 'white-icon jar-icon'],
    ['#/weapons', 'Weapons', '11 weapon types with sharpness, element and materials', 'white-icon great-sword-icon'],
    ['#/armor', 'Armor', 'Armor pieces, decorations and skill points', 'white-icon helm-icon'],
    ['#/skills', 'Skills', 'What each skill does and where to get it', 'white-icon book-icon'],
    ['#/monsters', 'Bestiary', 'Hitzones, status effects and rewards', 'white-icon claw-icon'],
    ['#/quests', 'Quests', 'Jumbo Village and Dundorma, with supplies and rewards', 'white-icon ticket-icon'],
    ['#/events', 'Events', 'Dundorma event quests and shop specials by day', 'yellow-icon ticket-icon'],
    ['#/maps', 'Maps', 'Gathering points by area and season', 'white-icon map-icon'],
    ['#/meals', 'Meals', 'Felyne Kitchen combinations', 'white-icon meat-icon'],
    ['#/extras', 'Miscellany', 'Trades, Maka pots, villagers, titles…', 'white-icon mystery-icon'],
  ];
  MH2.views.home = async function () {
    const c = MH2.data.core;
    const counts = { i: 0, m: 0, w: 0, a: 0, q: 0, s: 0 };
    c.search.forEach((r) => counts[r[0]] !== undefined && counts[r[0]]++);
    return `
      <section class="panel home-hero">
        <div>
          <h1 class="title">Hunter's Guide</h1>
          <div class="jp-sub">モンスターハンター２ ドス · 解析情報</div>
          <div class="hero-meta">
            <span class="stat"><small>Items</small><b>${counts.i}</b></span>
            <span class="stat"><small>Monsters</small><b>${counts.m}</b></span>
            <span class="stat"><small>Weapons</small><b>${counts.w}</b></span>
            <span class="stat"><small>Armor</small><b>${counts.a}</b></span>
            <span class="stat"><small>Quests</small><b>${counts.q}</b></span>
            <span class="stat"><small>Skills</small><b>${counts.s}</b></span>
          </div>
        </div>
        <img class="logo" src="img/mh2/logo.png" alt="Monster Hunter 2">
      </section>
      ${await MH2.eventsToday()}
      <section class="panel"><h2 class="plate">Sections</h2>
        <div class="cards">${CARDS.map(([h, t, d, i]) => `<a class="card" href="${h}">${MH2.icon(i)}<span><b>${t}</b><small>${esc(d)}</small></span></a>`).join('')}</div>
      </section>`;
  };
})();
;
/* ---- js/view-items.js ---- */
/* Items: filterable list and a full item page with every relation (how to get it and what it's for). */
(function () {
  const { esc, num, z, L, icon, item, table, section, pct } = MH2;

  /* ---------- reverse indexes (built once) ---------- */
  function rel() {
    if (MH2.rel) return MH2.rel;
    const R = MH2.data.itemrel;
    const S = R.strings;
    const by = (rows, key) => {
      const m = new Map();
      rows.forEach((r) => {
        const k = key(r);
        (Array.isArray(k) ? k : [k]).forEach((kk) => {
          if (kk == null) return;
          if (!m.has(kk)) m.set(kk, []);
          m.get(kk).push(r);
        });
      });
      return m;
    };
    const dec = (v) => (typeof v === 'number' ? S[v] : v);
    MH2.rel = {
      comboFor: by(R.combos, (c) => c[0]),
      comboUse: by(R.combos, (c) => [...new Set(c[1])]),
      tradeGet: by(R.trades, (t) => t[4]),
      tradeGive: by(R.trades, (t) => t[3]),
      drops: by(R.drops, (d) => d[7]),
      qItems: by(R.questItems, (q) => q[3]),
      used: by(R.used, (u) => u[6]),
      gather: (id) => (R.gather[id] || []).map((r) => r.map((v, i) => (i === 9 ? v : dec(v)))),
    };
    return MH2.rel;
  }

  /* ---------- list ---------- */
  const state = { q: '', rar: '', kind: '', hidden: false, sort: 'id' };

  const shapeOf = (cls) => ((cls || '').split(' ').find((c) => c.endsWith('-icon') && !/^(gray|white|green|orange|yellow|red|blue|cyan|pink|purple)-icon$/.test(c)) || 'other');
  const SHAPES = {
    'herb-icon': 'Herbs', 'mushroom-icon': 'Mushrooms', 'bug-icon': 'Bugs', 'stone-icon': 'Ores', 'gem-icon': 'Gems and jewels', 'bone-icon': 'Bones',
    'scale-icon': 'Scales', 'hide-icon': 'Hides', 'claw-icon': 'Claws and fangs', 'shell-icon': 'Shells', 'fish-icon': 'Fish', 'meat-icon': 'Meat',
    'jar-icon': 'Potions', 'powder-icon': 'Powders', 'shot-icon': 'Ammo', 'coating-icon': 'Coatings', 'bomb-icon': 'Bombs', 'barrel-bomb-icon': 'Barrel bombs',
    'trap-icon': 'Traps', 'egg-icon': 'Eggs', 'seed-icon': 'Seeds', 'honey-icon': 'Honey', 'book-icon': 'Books', 'ticket-icon': 'Tickets',
    'tuber-icon': 'Tubers', 'husk-icon': 'Husks', 'whetstone-icon': 'Whetstones', 'pick-icon': 'Pickaxes', 'bugnet-icon': 'Bugnets', 'web-icon': 'Webs',
    'dung-icon': 'Dung bombs', 'smoke-icon': 'Smoke', 'bait-icon': 'Bait', 'coin-icon': 'Coins', 'maka-pot-icon': 'Maka pots', 'binoculars-icon': 'Binoculars',
  };

  /** Readable name for icon types without a label: 'barrel-bomb-icon' -> 'Barrel bomb'. */
  const typeName = (k) => { const t = k.replace(/-icon$/, '').replace(/-/g, ' '); return t[0].toUpperCase() + t.slice(1); };

  function itemRows() {
    const items = MH2.data.core.items;
    const q = state.q;
    let rows = items.map((it, id) => [it, id]).filter(([it]) => {
      if (!state.hidden && it.f && it.f.includes('hide')) return false;
      if (state.rar && String(it.r) !== state.rar) return false;
      if (state.kind && shapeOf(it.i) !== state.kind) return false;
      if (q && !MH2.matches(it.n + ' ' + it.j + ' ' + (it.d || ''), q)) return false;
      return true;
    });
    const s = state.sort;
    if (s === 'name') rows.sort((a, b) => L(a[0].n, a[0].j).localeCompare(L(b[0].n, b[0].j)));
    if (s === 'rar') rows.sort((a, b) => (b[0].r || 0) - (a[0].r || 0));
    if (s === 'sell') rows.sort((a, b) => (b[0].v || 0) - (a[0].v || 0));
    return rows;
  }
  function listTable() {
    const rows = itemRows();
    return `<p class="muted">${rows.length} items</p>` +
      table(
        [
          { h: 'Item', f: ([it, id]) => `<a class="name-cell r${it.r || 0}" href="#/item/${id}">${icon(it.i)}<span class="names"><span class="rname">${esc(L(it.n, it.j))}</span><small>${esc(MH2.lang === 'jp' ? it.n : it.j)}</small></span></a>` },
          { h: 'Rarity', cls: 'c', f: ([it]) => `<span class="r${it.r}">${MH2.rarity(it.r)}</span>` },
          { h: 'Max', cls: 'n', f: ([it]) => num(it.s) },
          { h: 'Buy', cls: 'n', f: ([it]) => (it.b ? z(it.b) : '–') },
          { h: 'Sell', cls: 'n', f: ([it]) => z(it.v) },
          { h: 'Description', cls: 'hide-m', f: ([it]) => `<span class="muted">${esc(MH2.lang === 'jp' ? it.dj || it.d : MH2.noJp ? it.d : it.d || it.dj)}</span>` },
        ],
        rows
      );
  }

  MH2.views.items = async function () {
    const items = MH2.data.core.items;
    const kinds = {};
    items.forEach((it) => { const s = shapeOf(it.i); kinds[s] = (kinds[s] || 0) + 1; });
    // a sample item icon for each type, shown next to the type name in the dropdown
    const sample = {};
    items.forEach((it) => { const s = shapeOf(it.i); if (it.i && !sample[s] && !(it.f || []).includes('hide')) sample[s] = it.i; });
    const kindOpts = Object.keys(kinds).sort((a, b) => (SHAPES[a] || a).localeCompare(SHAPES[b] || b))
      .map((k) => MH2.opt(k, `${SHAPES[k] || typeName(k)} (${kinds[k]})`, sample[k] ? icon(sample[k]) : '', state.kind === k)).join('');
    return section('Items and Materials <small>アイテムと素材</small>', `
      <div class="toolbar">
        <input class="field" id="iq" type="search" placeholder="Filter by name or description…" value="${esc(state.q)}">
        <select class="field" id="ir">${MH2.opt('', 'All rarities', '', !state.rar)}${MH2.rarityOpts(state.rar)}</select>
        <select class="field" id="ik">${MH2.opt('', 'All types', '', !state.kind)}${kindOpts}</select>
        <select class="field" id="is">${[['id', 'Game order'], ['name', 'Name'], ['rar', 'Rarity'], ['sell', 'Sell price']].map(([v, t]) => `<option value="${v}"${state.sort === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <label><input type="checkbox" id="ih"${state.hidden ? ' checked' : ''}> Show hidden / dummy items</label>
      </div>
      <div id="ilist">${listTable()}</div>`);
  };
  MH2.views.items.after = function () {
    const redraw = () => (document.getElementById('ilist').innerHTML = listTable());
    let t;
    document.getElementById('iq').addEventListener('input', (e) => { state.q = e.target.value; clearTimeout(t); t = setTimeout(redraw, 120); });
    [['ir', 'rar'], ['ik', 'kind'], ['is', 'sort']].forEach(([id, k]) => document.getElementById(id).addEventListener('change', (e) => { state[k] = e.target.value; redraw(); }));
    document.getElementById('ih').addEventListener('change', (e) => { state.hidden = e.target.checked; redraw(); });
  };

  /* ---------- item page ---------- */
  /* zone / rank filter for the "how to get it" sections; kept while browsing from item to item */
  const pageFilter = { zone: '', rank: '' };
  const RANKS = [['', 'Any rank'], ['low', 'Low Rank'], ['high', 'High Rank'], ['dojo', 'Dojo']];
  const ZONE_COLOR = { 'Forest & Hills': 'green', Jungle: 'green', Desert: 'orange', Swamp: 'purple', 'Snowy Mountain': 'blue', Volcano: 'red', 'The Tower': 'cyan' };
  const rankKey = (s) => (/dojo/i.test(s) ? 'dojo' : /high/i.test(s) ? 'high' : 'low');
  const zoneOf = (map) => map.replace(/\s*\((Day|Night|Layout \d+|Foothills)\)$/, '');
  /** Quest rank from its category; special categories (siege, exams, events…) go by star level. */
  const questRank = (q) => (/dojo/i.test(q[5]) ? 'dojo' : /high/i.test(q[5]) ? 'high' : /^(Standard|Defense|Urgents|Hunter Basics|Low Rank)$/.test(q[5]) ? 'low' : (q[3] || 0) >= 6 ? 'high' : 'low');
  /* Maka pots: the Miscellany "Maka Recipes" table (ingredient → result after each burial time), indexed both ways */
  const MAKA_TIMES = [['< 5 min', 'white'], ['5 min', 'pink'], ['10 min', 'cyan'], ['15 min', 'green'], ['20 min', 'yellow'], ['30 min', 'red']];
  let maka;
  function makaIndex() {
    if (maka) return maka;
    maka = { from: new Map(), into: new Map(), href: '#/extras' };
    for (const [g, secs] of Object.entries(MH2.data.extras || {})) {
      const i = secs.findIndex((x) => /^Maka/.test(x.title));
      if (i < 0) continue;
      maka.href = `#/extras/${g}/${i}`;
      const h = secs[i].html, body = h.slice(h.indexOf('<tbody>'), h.indexOf('</table>'));
      body.split('<tr>').slice(1).forEach((row) => {
        const ids = [...row.matchAll(/#\/item\/(\d+)/g)].map((m) => +m[1]);
        if (ids.length !== 7) return;
        const [ing, ...res] = ids;
        maka.into.set(ing, res);
        res.forEach((id, t) => { if (id === ing) return; if (!maka.from.has(id)) maka.from.set(id, new Map()); const m = maka.from.get(id); m.set(ing, [...(m.get(ing) || []), t]); });
      });
      break;
    }
    return maka;
  }
  /* fishing bait: the special baits' notes name the fish they attract ("Attract Pin Tuna and Speartuna to your fishing lure") */
  let bait;
  function baitIndex() {
    if (bait) return bait;
    bait = { fish: new Map(), lure: new Map() };
    const items = MH2.data.core.items;
    const byName = new Map(items.map((x, i) => [x && x.n, i]));
    items.forEach((x, i) => {
      const m = x && /bait-icon/.test(x.i) && /Attr?act (.+?) to your fishing lure/i.exec(x.x || '');
      if (!m) return;
      const fish = m[1].split(/\s*(?:,|\band\b)\s*/).map((n) => byName.get(n.trim())).filter((f) => f != null);
      bait.lure.set(i, fish);
      fish.forEach((f) => bait.fish.set(f, [...(bait.fish.get(f) || []), i]));
    });
    return bait;
  }
  const smoke = (t) => `<span class="nw maka-t">${icon(`${MAKA_TIMES[t][1]}-icon smoke-icon`)} ${MAKA_TIMES[t][0]}</span>`;

  const RANK_ORDER = (r) => ['Village', 'Village/Low Rank', 'Low Rank', 'Dojo', 'High Rank'].indexOf(r);
  const KIND = { carve: 'Carve', capture: 'Capture', break: 'Break' };
  const STAGE = { forge: 'Forge', upgrade: 'Upgrade', forgePSP: 'Forge (PSP)', ticketForge: 'Ticket forge' };

  /** "Optimal bait" on a fish that a special bait attracts, "Attracts" on that bait. */
  function baitLine(id) {
    const B = baitIndex();
    const baits = B.fish.get(id), fish = B.lure.get(id);
    if (baits) return `<div class="bait-line">${icon('cyan-icon bait-icon')}<b>Optimal bait:</b><span class="chips">${baits.map((b) => item(b)).join('')}</span><span class="muted">only fish it attracts will bite · chance per fishing spot in Gathering below</span></div>`;
    if (fish && fish.length) return `<div class="bait-line">${icon('gray-icon fish-icon')}<b>Attracts:</b><span class="chips">${fish.map((f) => item(f)).join('')}</span></div>`;
    return '';
  }

  MH2.views.item = async function ([idStr]) {
    await MH2.need('itemrel', 'extras');
    const id = Number(idStr);
    const it = MH2.data.core.items[id];
    if (!it) return MH2.views.notfound();
    const R = rel();
    const D = MH2.data.itemrel;
    const out = [];

    /* header */
    out.push(`<section class="panel r${it.r || 0}">
      <div class="hero"><span class="big-icon">${icon(it.i)}</span>
        <div><h1 class="title"><span class="rname">${esc(L(it.n, it.j))}</span></h1><div class="jp-sub">${esc(MH2.lang === 'jp' ? it.n : it.j)}</div></div></div>
      <div class="hero-meta">
        <span class="stat"><small>Rarity</small><b>${MH2.rarity(it.r)}</b></span>
        <span class="stat"><small>Max carry</small><b>${num(it.s)}</b></span>
        <span class="stat"><small>Buy</small><b>${it.b ? z(it.b) : '–'}</b></span>
        <span class="stat"><small>Sell</small><b>${z(it.v)}</b></span>
      </div>
      ${it.d ? `<p class="desc">${MH2.rich(it.d)}</p>` : ''}${it.dj ? `<p class="desc jp">${esc(it.dj)}</p>` : ''}
      ${it.x ? `<div class="note">${MH2.rich(it.x)}</div>` : ''}${it.a ? `<p class="note"><b>How to get it:</b> ${MH2.rich(it.a)}</p>` : ''}
      ${it.f && it.f.includes('descriptionInaccurate') ? '<p class="note">The in-game description is inaccurate.</p>' : ''}
      ${baitLine(id)}
    </section>`);

    /* special bait: the fishing spots where the fish it attracts show up, with their chance per season */
    const lured = baitIndex().lure.get(id);
    if (lured && lured.length) {
      const rows = lured.flatMap((f) => R.gather(f).filter((r) => /fish-icon/.test(r[8])).map((r) => [f, r]))
        .sort((a, b) => a[1][0].localeCompare(b[1][0]) || RANK_ORDER(a[1][2]) - RANK_ORDER(b[1][2]) || a[0] - b[0]);
      out.push(section(`${icon('gray-icon fish-icon')} Where to fish with it <small>釣り場</small><span class="count">${rows.length} spots</span>`,
        `<p class="muted">Chance of each fish at the fishing spot (the spot's own table: the bait only decides which fish bite).</p><div class="tbl-wrap tall">${table(
        [{ h: 'Fish', f: ([f]) => item(f) }, { h: 'Map', f: ([, r]) => `<a href="#/maps/${MH2.slug(r[0])}">${esc(L(r[0], r[1]))}</a>` },
         { h: 'Rank', f: ([, r]) => esc(L(r[2], r[3])) }, { h: 'Area', f: ([, r]) => esc(L(r[4], r[5])) },
         { h: '<span class="season-summer">Warm</span>', cls: 'n', f: ([, r]) => esc(r[10]) }, { h: '<span class="season-winter">Cold</span>', cls: 'n', f: ([, r]) => esc(r[11]) },
         { h: '<span class="season-breeding">Breeding</span>', cls: 'n', f: ([, r]) => esc(r[12]) }], rows).replace('<div class="tbl-wrap">', '').replace(/<\/div>$/, '')}</div>`));
    }

    /* shops */
    const shops = D.shops[id];
    if (shops) out.push(section('Shops <small>店</small>', table(
      [{ h: 'Location', f: (s) => esc(L(s.t, s.tj)) }, { h: 'Shop', f: (s) => esc(L(s.n, s.nj)) }, { h: 'Price', cls: 'n', f: (s) => z(s.p) },
       { h: 'Requirement', f: (s) => esc(s.rq || '') + (s.sp ? ` <span class="pill on">${esc(s.sp)}</span>` : '') }], shops)));

    /* combinations */
    const comboRow = (c) => `<span class="chips">${c[1].map((i) => item(i)).join('<span class="muted">+</span>')}</span>`;
    const cf = R.comboFor.get(id) || [];
    const cu = R.comboUse.get(id) || [];
    if (cf.length || cu.length) {
      let body = '';
      if (cf.length) body += '<h3>Made from</h3>' + table([{ h: 'Ingredients', f: comboRow }, { h: 'Quantity', cls: 'n', f: (c) => esc(c[2]) },
        { h: 'Success', cls: 'n', f: (c) => pct(c[3]) }, { h: '', f: (c) => (c[4] ? '<span class="pill">Alchemy</span>' : '') }], cf);
      if (cu.length) body += '<h3>Used to make</h3>' + table([{ h: 'Result', f: (c) => item(c[0]) }, { h: 'Ingredients', f: comboRow },
        { h: 'Quantity', cls: 'n', f: (c) => esc(c[2]) }, { h: 'Success', cls: 'n', f: (c) => pct(c[3]) }, { h: '', f: (c) => (c[4] ? '<span class="pill">Alchemy</span>' : '') }], cu);
      out.push(section('Combinations <small>調合</small>', body));
    }

    /* maka pot */
    const M = makaIndex();
    const mFrom = M.from.get(id), mInto = M.into.get(id);
    if (mFrom || mInto) {
      let body = '';
      if (mFrom) body += '<h3>Obtained from a Maka Pot</h3>' + table([{ h: 'Put in the pot', f: ([ing]) => item(ing) },
        { h: 'Dig it up after (smoke color)', f: ([, ts]) => `<span class="maka-ts">${ts.map(smoke).join('')}</span>` }], [...mFrom.entries()]);
      if (mInto) body += '<h3>Fermenting it gives</h3>' + table(MAKA_TIMES.map(([t, c], i) => ({ h: `<span class="nw">${icon(`${c}-icon smoke-icon`)} ${t}</span>`, f: () => item(mInto[i]) })), [0]);
      out.push(section(`${icon('yellow-icon maka-pot-prepared-icon')} Maka Pot <small>マカ漬けの壷</small> <a class="more" href="${M.href}">All Maka recipes →</a>`, body));
    }

    /* zone / rank filter */
    const gAll = R.gather(id);
    const drAll = R.drops.get(id) || [];
    const qAll = (R.qItems.get(id) || []).filter((x) => x[1] === 'reward');
    const zones = [...new Set(gAll.map((r) => zoneOf(r[0])))];
    if (pageFilter.zone && !zones.includes(pageFilter.zone)) pageFilter.zone = '';
    const has = { low: 0, high: 0, dojo: 0 };
    gAll.forEach((r) => has[rankKey(r[2])]++); drAll.forEach((d) => has[rankKey(d[2])]++); qAll.forEach((q) => has[questRank(D.questNames[q[0]])]++);
    const zf = pageFilter.zone, rf = pageFilter.rank;
    if (gAll.length + drAll.length + qAll.length > 0) {
      out.push(`<section class="panel src-filter">
        <div class="src-row"><span class="src-lbl">Zone</span><div class="src-opts zones">${[['', 'All zones', 'white-icon map-icon', gAll.length], ...zones.map((z) => [z, z, `${ZONE_COLOR[z] || 'gray'}-icon map-icon`, gAll.filter((r) => zoneOf(r[0]) === z).length])]
          .map(([k, t, ic, n]) => `<button class="pill${zf === k ? ' on' : ''}" data-fzone="${esc(k)}">${icon(ic)}<span class="tab-label">${esc(t)}</span><small>${n}</small></button>`).join('') || ''}</div></div>
        <div class="src-row"><span class="src-lbl">Rank</span><div class="src-opts ranks">${RANKS.map(([k, t]) => `<button class="pill${rf === k ? ' on' : ''}" data-frank="${k}"${k && !has[k] ? ' disabled' : ''}>${t}${k ? `<small>${has[k]}</small>` : ''}</button>`).join('')}</div></div>
        ${zf ? '<p class="muted src-note">The zone applies to gathering spots; monster drops and quest rewards are filtered by rank only.</p>' : ''}
      </section>`);
    }

    /* gathering */
    const g = gAll.filter((r) => (!zf || zoneOf(r[0]) === zf) && (!rf || rankKey(r[2]) === rf));
    if (gAll.length && !g.length) out.push(section('Gathering <small>採取</small>', MH2.empty('Not gathered with this zone / rank.')));
    if (g.length) {
      g.sort((a, b) => a[0].localeCompare(b[0]) || RANK_ORDER(a[2]) - RANK_ORDER(b[2]));
      out.push(section(`Gathering <small>採取</small><span class="count">${g.length} spots</span>`, `<div class="tbl-wrap tall">${table(
        [{ h: 'Map', f: (r) => `<a href="#/maps/${MH2.slug(r[0])}">${esc(L(r[0], r[1]))}</a>` }, { h: 'Rank', f: (r) => esc(L(r[2], r[3])) },
         { h: 'Area', f: (r) => esc(L(r[4], r[5])) }, { h: 'Spot', f: (r) => `<span class="nw">${icon(r[8])} ${esc(L(r[6], r[7]))}</span>` },
         { h: '<span class="season-summer">Warm</span>', cls: 'n', f: (r) => esc(r[10]) }, { h: '<span class="season-winter">Cold</span>', cls: 'n', f: (r) => esc(r[11]) },
         { h: '<span class="season-breeding">Breeding</span>', cls: 'n', f: (r) => esc(r[12]) }], g).replace('<div class="tbl-wrap">', '').replace(/<\/div>$/, '')}</div>`));
    }

    /* monsters */
    const dr = drAll.filter((d) => !rf || rankKey(d[2]) === rf);
    if (drAll.length && !dr.length) out.push(section('Monsters <small>モンスター</small>', MH2.empty('No monster gives it at this rank.')));
    if (dr.length) {
      dr.sort((a, b) => b[9] - a[9]);
      out.push(section('Monsters <small>モンスター</small>', table(
        [{ h: 'Monster', f: (d) => MH2.monster(d[0]) }, { h: 'Type', f: (d) => KIND[d[1]] || d[1] }, { h: 'Rank', f: (d) => esc(L(d[2], d[3])) },
         { h: 'Source', f: (d) => esc(L(d[4], d[5])) + (d[6] ? ` <span class="muted">(${esc(d[6])})</span>` : '') },
         { h: 'Qty', cls: 'n', f: (d) => num(d[8]) }, { h: 'Chance', cls: 'n', f: (d) => pct(d[9]) }], dr)));
    }

    /* quests */
    const qi = R.qItems.get(id) || [];
    const qName = (k) => { const q = D.questNames[k]; return `<a class="nw" href="#/quest/${esc(q[0])}"><span class="pct">${'★'.repeat(q[3] || 0)}</span> ${esc(L(q[1], q[2]))}</a>`; };
    const rewards = qi.filter((x) => x[1] === 'reward' && (!rf || questRank(D.questNames[x[0]]) === rf)).sort((a, b) => (b[5] || 0) - (a[5] || 0));
    const supplies = qi.filter((x) => x[1] === 'supply');
    if (rewards.length) out.push(section(`Quest Rewards <small>報酬</small><span class="count">${rewards.length}</span>`, `<div class="tbl-wrap tall">${table(
      [{ h: 'Quest', f: (q) => qName(q[0]) }, { h: 'Location', f: (q) => esc(D.questNames[q[0]][4] === 'jumbo' ? 'Jumbo' : 'Dundorma') + ' · ' + esc(D.questNames[q[0]][5]) },
       { h: 'Group', f: (q) => esc(q[2]) }, { h: 'Qty', cls: 'n', f: (q) => num(q[4]) }, { h: 'Chance', cls: 'n', f: (q) => pct(q[5]) }], rewards).replace('<div class="tbl-wrap">', '').replace(/<\/div>$/, '')}</div>`));
    if (supplies.length) out.push(section('Quest Supplies <small>支給品</small>', `<div class="tbl-wrap tall">${table(
      [{ h: 'Quest', f: (q) => qName(q[0]) }, { h: 'Box', f: (q) => ({ supplies: 'Initial', suppliesA: 'Delivery A', suppliesB: 'Delivery B' })[q[2]] || q[2] }, { h: 'Qty', cls: 'n', f: (q) => num(q[4]) }],
      supplies).replace('<div class="tbl-wrap">', '').replace(/<\/div>$/, '')}</div>`));

    /* trades */
    const tg = R.tradeGet.get(id) || [], tv = R.tradeGive.get(id) || [];
    if (tg.length || tv.length) {
      let body = '';
      if (tg.length) body += '<h3>Obtained by trading</h3>' + table([{ h: 'Location', f: (t) => esc(L(t[0], t[1])) }, { h: 'You give', f: (t) => item(t[3]) }], tg);
      if (tv.length) body += '<h3>Can be traded for</h3>' + table([{ h: 'Location', f: (t) => esc(L(t[0], t[1])) }, { h: 'You get', f: (t) => item(t[4]) }], tv);
      out.push(section('Veggie Elder <small>山菜ジジイ</small>', body));
    }

    /* equipment */
    const us = R.used.get(id) || [];
    if (us.length) {
      const link = (u) => u[0] === 'weapon' ? `#/weapons/${MH2.slug(u[1])}/${u[2]}` : u[0] === 'armor' ? `#/armor/${u[1]}/${u[2]}` : '#/armor/Decorations';
      const kindName = (u) => (u[0] === 'weapon' ? MH2.weaponIcon(u[1]) + ' ' + esc(u[1]) : u[0] === 'armor' ? MH2.armorIcon(u[1]) + ' ' + esc(u[1]) : 'Decoration');
      us.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2] - b[2]);
      out.push(section(`Used in Equipment <small>素材として</small><span class="count">${us.length}</span>`, `<div class="tbl-wrap tall">${table(
        [{ h: 'Equipment', f: (u) => `<a href="${link(u)}">${esc(L(u[3], u[4]))}</a>` }, { h: 'Type', f: (u) => `<span class="nw">${kindName(u)}</span>` },
         { h: 'Step', f: (u) => STAGE[u[5]] || u[5] }, { h: 'Qty', cls: 'n', f: (u) => num(u[7]) }], us).replace('<div class="tbl-wrap">', '').replace(/<\/div>$/, '')}</div>`));
    }
    if (out.length === 1) out.push(section('Sources', MH2.empty('There is no data on how to get or use this item.')));
    return `<div class="toolbar"><a class="pill" href="#/items">◂ Items</a></div>` + out.join('');
  };
  MH2.views.item.after = function () {
    document.querySelectorAll('[data-fzone]').forEach((b) => b.addEventListener('click', () => { pageFilter.zone = b.dataset.fzone; MH2.rerender(); }));
    document.querySelectorAll('[data-frank]').forEach((b) => b.addEventListener('click', () => { pageFilter.rank = b.dataset.frank; MH2.rerender(); }));
  };
})();
;
/* ---- js/view-weapons.js ---- */
/* Weapons: tabs per weapon type, table with sharpness/element/slots and an expandable row with image and materials. */
(function () {
  const { esc, num, z, L, section, mats } = MH2;
  const SHARP = ['red', 'orange', 'yellow', 'green', 'blue', 'white', 'purple'];
  const AMMO = [
    ['normal', 'Normal', 3], ['pierce', 'Pierce', 3], ['pellet', 'Pellet', 3], ['crag', 'Crag', 3], ['clust', 'Clust', 3],
    ['recover', 'Recover', 2], ['poison', 'Poison', 2], ['para', 'Paralysis', 2], ['sleep', 'Sleep', 2],
    ['flame', 'Flaming', 1], ['water', 'Water', 1], ['thunder', 'Thunder', 1], ['freeze', 'Freeze', 1], ['dragon', 'Dragon', 1], ['demon', 'Demon', 1], ['armor', 'Armor', 1],
  ];
  const state = { q: '', elem: '', rar: '', rank: '', open: null };
  /** rankNum is the minimum Hunter Rank to forge the weapon: HR 31+ is High Rank (Dundorma's Hard Class), below that Low Rank. */
  const rankOf = (w) => (w.rankNum == null ? 'na' : w.rankNum >= 31 ? 'high' : 'low');
  const RANK = { low: ['Low Rank', 'ノーマル'], high: ['High Rank', 'ハード'], na: ['n/a', '—'] };
  const rankCell = (w) => {
    const r = rankOf(w);
    return `<span class="rank-badge rank-${r}" title="${r === 'na' ? 'No forge rank (event / special weapon)' : 'Forgeable from HR' + w.rankNum}">${esc(L(...RANK[r]))}</span>${r === 'na' ? '' : ` <small class="muted">HR${w.rankNum}+</small>`}`;
  };

  const sharpBar = (w, cls) => {
    if (!w || !w.length) return '';
    return `<div class="sharp-bar${cls ? ' ' + cls : ''}">${w.map((px, i) => `<i class="s-${SHARP[i]}" style="width:${px * 1.3}px" title="${SHARP[i]}: ${Math.round((px * 10) / 3)} hits"></i>`).join('')}</div>`;
  };
  const sharp = (w) => (w.sharpnessLevels ? `<div class="sharp">${sharpBar(w.sharpnessLevels.normal)}${sharpBar(w.sharpnessLevels.handicraft, 'hc')}</div>` : '');
  const slots = (n) => `<span class="slots">${'◯'.repeat(n || 0)}${'–'.repeat(3 - (n || 0))}</span>`;
  const elem = (w) => (w.attribute ? `<span class="nw">${MH2.attrIcon(w.attribute, w.attributeAlt)} ${num(w.attributeValue)}</span>` : '<span class="muted">–</span>');
  const aff = (a) => (a ? `<span class="${a > 0 ? 'pos' : 'neg'}">${a > 0 ? '+' : ''}${a}%</span>` : '<span class="muted">0%</span>');
  const notes = (w) => (w.noteIcons ? `<span class="nw notes">${w.noteIcons.map((c) => `<span class="note-icon ${c}-note" title="${c}"></span>`).join('')}</span>` : '');

  function columns(cls) {
    const c = [
      { h: 'Name', f: (w) => `<span class="name-cell r${w.rarity}">${MH2.weaponIcon(cls)}<span class="names"><span class="rname">${esc(L(w.name, w.japanese))}</span><small>${esc(MH2.lang === 'jp' ? w.name : w.japanese)}</small></span></span>` },
      { h: 'Rar.', cls: 'c', f: (w) => `<span class="r${w.rarity}">${MH2.rarity(w.rarity)}</span>` },
      { h: 'Rank', cls: 'nw', f: rankCell },
      { h: 'Attack', cls: 'n', f: (w) => num(w.attack) },
    ];
    const gun = /Bowgun/.test(cls), bow = cls === 'Bow';
    if (!gun) c.push({ h: 'Element', cls: 'nw', f: elem });
    c.push({ h: 'Affinity', cls: 'n', f: (w) => aff(w.affinity) }, { h: 'Slots', f: (w) => slots(w.slots) });
    if (!gun && !bow) c.push({ h: 'Sharpness', f: sharp });
    c.push({ h: 'Defense', cls: 'n', f: (w) => (w.defense ? '+' + w.defense : '<span class="muted">–</span>') });
    if (cls === 'Hunting Horn') c.push({ h: 'Notes', f: notes });
    if (cls === 'Gunlance') c.push({ h: 'Shell', f: (w) => (w.shellType ? `${esc(L(w.shellType, w.shellTypeJapanese))} ${w.shellLevel}` : '–') });
    if (gun) c.push({ h: 'Reload', f: (w) => esc(L(w.reload, w.reloadJapanese)) }, { h: 'Recoil', f: (w) => esc(L(w.recoil, w.recoilJapanese)) },
      { h: 'Rapid fire', f: (w) => esc(L(w.rapidfire, w.rapidfireJapanese) || '–') });
    if (bow) c.push({ h: 'Charges', f: (w) => (w.chargeLevels || []).map((l) => `${esc(L(l.type, l.typeJapanese))} ${l.level}`).join(' · ') },
      { h: 'Coatings', f: (w) => ['power', 'poison', 'para', 'sleep'].filter((k) => w[k + 'Coating']).map((k) => ({ power: 'Power', poison: 'Poison', para: 'Paralysis', sleep: 'Sleep' })[k]).join(', ') || '–' });
    c.push({ h: 'Price', cls: 'n', f: (w) => z(w.price) });
    return c;
  }

  function detail(w, cls) {
    const block = (title, list) => (list && list.length ? `<div><h3>${title}</h3>${mats(list)}</div>` : '');
    let ammo = '';
    if (/Bowgun/.test(cls)) {
      const cells = AMMO.filter(([k]) => w[k] != null).map(([k, name, lv]) => {
        const v = Array.isArray(w[k]) ? w[k] : [w[k]];
        const add = w[k + 'Add'];
        return `<tr><td>${name}</td>${[0, 1, 2].map((i) => `<td class="n">${i < lv ? esc(v[i] ?? '–') + (add && add[i] ? `<span class="muted">+${esc(add[i])}</span>` : '') : ''}</td>`).join('')}</tr>`;
      }).join('');
      ammo = `<div><h3>Ammo (capacity per level)</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Type</th><th class="n">Lv1</th><th class="n">Lv2</th><th class="n">Lv3</th></tr></thead><tbody>${cells}</tbody></table></div></div>`;
    }
    return `<div class="grid2" style="grid-template-columns:${w.image ? 'minmax(0,280px) 1fr' : '1fr'}">
      ${w.image ? `<div><img src="${esc(w.image)}" alt="" loading="lazy" style="width:100%;border-radius:6px;border:1px solid var(--edge);background:#000"></div>` : ''}
      <div>
        ${w.acquire ? `<p class="note">${esc(w.acquire)}</p>` : ''}
        ${block('Forge', w.forge)}${block('Upgrade from the previous weapon', w.upgrade)}${block('Forge (PSP version)', w.forgePSP)}${block('Ticket forge', w.ticketForge)}
        ${w.damage ? `<p class="muted">Internal damage value: ${num(w.damage)}${w.sharpnessLevels ? ' · Lower sharpness bar: with Handicraft +1' : ''}</p>` : ''}
        ${ammo}
      </div></div>`;
  }

  function filtered(list) {
    const q = state.q;
    return list.filter((w) =>
      (!q || MH2.matches(w.name + ' ' + w.japanese, q)) &&
      (!state.elem || (state.elem === 'none' ? !w.attribute : w.attribute === state.elem)) &&
      (!state.rar || String(w.rarity) === state.rar) &&
      (!state.rank || rankOf(w) === state.rank));
  }

  function draw(cls, list) {
    const cols = columns(cls);
    const rows = filtered(list);
    return `<p class="muted">${rows.length} weapons</p><div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th class="${c.cls || ''}">${c.h}</th>`).join('')}</tr></thead>${MH2.tbody(rows, (w) => {
        const open = state.open === w.index;
        return `<tr class="click${open ? ' open' : ''}" data-i="${w.index}" id="w-${w.index}">${cols.map((c) => `<td class="${c.cls || ''}">${c.f(w)}</td>`).join('')}</tr>${
          open ? `<tr class="detail-row"><td colspan="${cols.length}">${detail(w, cls)}</td></tr>` : ''}`;
      }, state.open != null)}</table></div>`;
  }

  MH2.views.weapons = async function ([clsSlug, idx]) {
    await MH2.need('weapons');
    const classes = MH2.data.weapons.classes;
    const wc = classes.find((c) => MH2.slug(c.class) === clsSlug) || classes[0];
    state.open = idx != null ? Number(idx) : state.cls === wc.class ? state.open : null;
    state.cls = wc.class;
    const elems = [...new Set(wc.weapons.map((w) => w.attribute).filter(Boolean))];
    return MH2.tabs(classes.map((c) => [`#/weapons/${MH2.slug(c.class)}`, `${MH2.weaponIcon(c.class)} ${c.class}`]), `#/weapons/${MH2.slug(wc.class)}`) +
      section(`${MH2.weaponIcon(wc.class)} ${esc(wc.class)}`, `
        <div class="toolbar">
          <input class="field" id="wq" type="search" placeholder="Filter weapons…" value="${esc(state.q)}">
          ${elems.length ? `<select class="field" id="we">${MH2.opt('', 'Any element', '', !state.elem)}${MH2.opt('none', 'No element', '<span class="muted">–</span>', state.elem === 'none')}${elems.map((e) => MH2.opt(e, e[0].toUpperCase() + e.slice(1), MH2.attrIcon(e), state.elem === e)).join('')}</select>` : ''}
          <select class="field" id="wk">${MH2.opt('', 'All ranks', '', !state.rank)}${[['low', 'Low Rank', 'LR'], ['high', 'High Rank', 'HR'], ['na', 'No rank (event / special)', '—']].map(([v, t, b]) => MH2.opt(v, t, `<span class="rank-badge rank-${v}">${b}</span>`, state.rank === v)).join('')}</select>
          <select class="field" id="wr">${MH2.opt('', 'All rarities', '', !state.rar)}${MH2.rarityOpts(state.rar)}</select>
        </div>
        <div id="wlist">${draw(wc.class, wc.weapons)}</div>`);
  };
  MH2.views.weapons.after = function ([clsSlug, idx]) {
    const wc = MH2.data.weapons.classes.find((c) => c.class === state.cls);
    const box = document.getElementById('wlist');
    const redraw = () => (box.innerHTML = draw(wc.class, wc.weapons));
    let t;
    document.getElementById('wq').addEventListener('input', (e) => { state.q = e.target.value; clearTimeout(t); t = setTimeout(redraw, 120); });
    document.getElementById('we')?.addEventListener('change', (e) => { state.elem = e.target.value; redraw(); });
    document.getElementById('wr').addEventListener('change', (e) => { state.rar = e.target.value; redraw(); });
    document.getElementById('wk').addEventListener('change', (e) => { state.rank = e.target.value; redraw(); });
    box.addEventListener('click', (e) => {
      const tr = e.target.closest('tr.click');
      if (!tr || e.target.closest('a')) return;
      const i = Number(tr.dataset.i);
      state.open = state.open === i ? null : i;
      redraw();
    });
    if (idx != null) document.getElementById('w-' + idx)?.scrollIntoView({ block: 'center' });
  };
})();
;
/* ---- js/view-armor.js ---- */
/* Armor, decorations and skills. */
(function () {
  const { esc, num, z, L, table, section, mats } = MH2;
  const RES = ['fire', 'water', 'thunder', 'ice', 'dragon'];
  const state = { q: '', cls: '', sex: '', rar: '', skill: '', open: null, slot: null };

  const skillChip = (s) => {
    const q = Number(String(s.q ?? '').replace('+', ''));
    const pts = s.q == null || s.q === '' || isNaN(q) ? '' : `<b class="qty ${q < 0 ? 'neg' : ''}">${q > 0 ? '+' : ''}${q}</b>`;
    return `<a class="chip" href="#/skill/${esc(s.id || '')}"><span>${esc(L(s.n, s.j))}</span>${pts}</a>`;
  };
  const skills = (list) => (list && list.length ? `<div class="chips">${list.map(skillChip).join('')}</div>` : '<span class="muted">–</span>');
  const res = (r) => (r || []).map((v, i) => `<span class="nw ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted'}">${MH2.attrIcon(RES[i])}${v > 0 ? '+' : ''}${v}</span>`).join(' ');
  const range = (a) => (!a || !a.length ? '–' : a[0] === a[a.length - 1] ? num(a[0]) : `${num(a[0])}<span class="muted">→</span>${num(a[a.length - 1])}`);
  const slotsRange = (a) => {
    const s = (n) => `<span class="slots">${'◯'.repeat(n || 0)}${'–'.repeat(3 - (n || 0))}</span>`;
    return !a || !a.length ? s(0) : a[0] === a[a.length - 1] ? s(a[0]) : `${s(a[0])}<span class="muted">→</span>${s(a[a.length - 1])}`;
  };
  const tabs = (A, active) =>
    MH2.tabs([...A.slots.map((s) => [`#/armor/${s.slot}`, `${MH2.armorIcon(s.slot)} ${s.slot}`]), ['#/armor/Decorations', `${MH2.icon('gray-icon gem-icon')} Decorations`], ['#/skills', `${MH2.icon('white-icon book-icon')} Skills`]], active);

  function armorDetail(a) {
    const lv = a.upgradeLevels || [];
    return `<div class="grid2">
      <div>${a.acquire ? `<p class="note">${esc(a.acquire)}</p>` : ''}
        <h3>Forge</h3>${mats(a.forge)}${a.forgePSP ? `<h3>Forge (PSP version)</h3>${mats(a.forgePSP)}` : ''}
        <h3>Defense per level</h3><p>${(a.defense || []).map((d, i) => `<span class="pill">Lv${i + 1}: ${d}</span>`).join(' ')}</p>
      </div>
      <div>${lv.length ? '<h3>Upgrades</h3>' + table([{ h: 'Level', cls: 'c', f: (l) => l.level }, { h: 'Price', cls: 'n', f: (l) => z(l.price) },
        { h: 'Materials', f: (l) => (l.noMats ? '<span class="muted">No materials</span>' : mats(l.materials)) }], lv) : ''}</div>
    </div>`;
  }

  function armorRows(slot) {
    const q = MH2.norm(state.q);
    return slot.armor.filter((a) => a.name !== 'None' &&
      (!q || MH2.matches(a.name + ' ' + a.japanese, q)) &&
      (!state.cls || !a.hunterClass || a.hunterClass === state.cls) &&
      (!state.sex || !a.sex || a.sex === state.sex) &&
      (!state.rar || String(a.rarity) === state.rar) &&
      (!state.skill || (a.skills || []).some((s) => s.id === state.skill && Number(s.q) > 0)));
  }
  function drawArmor(slot) {
    const cols = [
      { h: 'Name', f: (a) => `<span class="name-cell r${a.rarity}">${MH2.armorIcon(slot.slot)}<span class="names"><span class="rname">${esc(L(a.name, a.japanese))}</span><small>${esc(MH2.lang === 'jp' ? a.name : a.japanese)}</small></span></span>` },
      { h: 'Rar.', cls: 'c', f: (a) => `<span class="r${a.rarity}">${MH2.rarity(a.rarity)}</span>` },
      { h: 'Class', f: (a) => (a.hunterClass ? esc(a.hunterClass) : '<span class="muted">Both</span>') + (a.sex ? ` <span class="muted">· ${a.sex === 'Male' ? '♂' : '♀'}</span>` : '') },
      { h: 'Defense', cls: 'n', f: (a) => range(a.defense) },
      { h: 'Resistances', cls: 'nw spill', f: (a) => res(a.resistances) },
      { h: 'Slots', cls: 'nw', f: (a) => slotsRange(a.slots) },
      { h: 'Skills', f: (a) => skills(a.skills) },
      { h: 'Price', cls: 'n', f: (a) => z(a.cost) },
    ];
    const rows = armorRows(slot);
    return `<p class="muted">${rows.length} pieces</p><div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th class="${c.cls || ''}">${c.h}</th>`).join('')}</tr></thead>${MH2.tbody(rows, (a) => {
      const open = state.open === a.index;
      return `<tr class="click${open ? ' open' : ''}" data-i="${a.index}" id="a-${a.index}">${cols.map((c) => `<td class="${c.cls || ''}">${c.f(a)}</td>`).join('')}</tr>${open ? `<tr class="detail-row"><td colspan="${cols.length}">${armorDetail(a)}</td></tr>` : ''}`;
    }, state.open != null)}</table></div>`;
  }

  function drawDecos() {
    const q = MH2.norm(state.q);
    const rows = MH2.data.armor.decorations.filter((d) => (!q || MH2.matches(d.name + ' ' + d.japanese, q)) && (!state.skill || d.skills.some((s) => s.id === state.skill && Number(String(s.q).replace('+', '')) > 0)));
    return `<p class="muted">${rows.length} decorations</p>` + table([
      { h: 'Decoration', f: (d) => `<span class="name-cell r${d.rarity}">${MH2.icon(`${d.color}-icon gem-icon`)}<span class="names"><span class="rname">${esc(L(d.name, d.japanese))}</span><small>${esc(MH2.lang === 'jp' ? d.name : d.japanese)}</small></span></span>` },
      { h: 'Slots', cls: 'nw', f: (d) => `<span class="slots">${'◯'.repeat(d.slots)}</span>` },
      { h: 'Skills', f: (d) => skills(d.skills) },
      { h: 'Materials', f: (d) => mats(d.forge) },
      { h: 'Price', cls: 'n', f: (d) => z(d.price) },
      { h: '', f: (d) => (d.gunner ? '<span class="pill">Gunner</span>' : '') },
    ], rows);
  }

  MH2.views.armor = async function ([slotName, idx]) {
    await MH2.need('armor');
    const A = MH2.data.armor;
    const isDeco = slotName === 'Decorations';
    const slot = A.slots.find((s) => s.slot === slotName) || (isDeco ? null : A.slots[0]);
    const key = isDeco ? 'Decorations' : slot.slot;
    if (state.slot !== key) state.open = null;
    state.slot = key;
    if (idx != null) state.open = Number(idx);
    const skillOpts = A.skills.slice().sort((a, b) => L(a.name, a.japanese).localeCompare(L(b.name, b.japanese)))
      .map((s) => `<option value="${esc(s.id)}"${state.skill === s.id ? ' selected' : ''}>${esc(L(s.name, s.japanese))}</option>`).join('');
    return tabs(A, `#/armor/${key}`) +
      section(`${isDeco ? 'Decorations <small>装飾品</small>' : esc(slot.slot)}`, `
        <div class="toolbar">
          <input class="field" id="aq" type="search" placeholder="Filter by name…" value="${esc(state.q)}">
          <select class="field" id="ask"><option value="">Any skill</option>${skillOpts}</select>
          ${isDeco ? '' : `<select class="field" id="acl">${MH2.opt('', 'Blademaster and Gunner', '', !state.cls)}${MH2.opt('Blademaster', 'Blademaster', MH2.icon('white-icon great-sword-icon'), state.cls === 'Blademaster')}${MH2.opt('Gunner', 'Gunner', MH2.icon('white-icon shot-icon'), state.cls === 'Gunner')}</select>
          <select class="field" id="asx">${MH2.opt('', 'Both genders', '', !state.sex)}${MH2.opt('Male', 'Male', '<b class="sex-m">♂</b>', state.sex === 'Male')}${MH2.opt('Female', 'Female', '<b class="sex-f">♀</b>', state.sex === 'Female')}</select>
          <select class="field" id="ar">${MH2.opt('', 'All rarities', '', !state.rar)}${MH2.rarityOpts(state.rar)}</select>`}
        </div>
        <div id="alist">${isDeco ? drawDecos() : drawArmor(slot)}</div>`);
  };
  MH2.views.armor.after = function ([slotName, idx]) {
    const A = MH2.data.armor;
    const isDeco = state.slot === 'Decorations';
    const slot = A.slots.find((s) => s.slot === state.slot);
    const box = document.getElementById('alist');
    const redraw = () => (box.innerHTML = isDeco ? drawDecos() : drawArmor(slot));
    let t;
    document.getElementById('aq').addEventListener('input', (e) => { state.q = e.target.value; clearTimeout(t); t = setTimeout(redraw, 120); });
    [['ask', 'skill'], ['acl', 'cls'], ['asx', 'sex'], ['ar', 'rar']].forEach(([id, k]) => document.getElementById(id)?.addEventListener('change', (e) => { state[k] = e.target.value; redraw(); }));
    box.addEventListener('click', (e) => {
      const tr = e.target.closest('tr.click');
      if (!tr || e.target.closest('a')) return;
      const i = Number(tr.dataset.i);
      state.open = state.open === i ? null : i;
      redraw();
    });
    if (idx != null) document.getElementById('a-' + idx)?.scrollIntoView({ block: 'center' });
  };

  /* ---------- skills ---------- */
  MH2.views.skills = async function () {
    await MH2.need('armor');
    const list = MH2.data.armor.skills.slice().sort((a, b) => L(a.name, a.japanese).localeCompare(L(b.name, b.japanese)));
    return tabs(MH2.data.armor, '#/skills') +
      section('Skills <small>スキル</small>', table([
        { h: 'Skill', f: (s) => `<a href="#/skill/${esc(s.id)}"><b>${esc(L(s.name, s.japanese))}</b></a><br><small class="jp-sub">${esc(MH2.lang === 'jp' ? s.name : s.japanese)}</small>` },
        { h: 'Stages (points → effect)', f: (s) => (s.stages || []).map((st) => `<div class="nw"><b class="${String(st.points).startsWith('-') ? 'neg' : 'pos'}">${esc(st.points)}</b> ${esc(L(st.n, st.j))}${st.d ? ` <span class="muted">${MH2.rich(st.d)}</span>` : ''}</div>`).join('') },
        { h: 'Description', f: (s) => `<span class="muted">${esc(s.desc)}</span>` },
      ], list));
  };
  MH2.views.skill = async function ([id]) {
    await MH2.need('armor');
    const A = MH2.data.armor;
    const s = A.skills.find((x) => x.id === id);
    if (!s) return MH2.views.notfound();
    const pieces = A.skillPoints.filter((p) => p[3] === id && p[4] > 0).sort((a, b) => b[4] - a[4]);
    const find = (p) => (p[0] === 'decoration' ? A.decorations.find((d) => d.index == p[2]) : A.slots.find((x) => x.slot === p[1]).armor.find((a) => a.index === p[2]));
    const rows = pieces.map((p) => [p, find(p)]).filter((r) => r[1]);
    const tbl = s.table ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${s.table.head.map((h) => `<th ${(h.props || []).join(' ')}>${h.content}</th>`).join('')}</tr></thead><tbody>${s.table.body.map((r) => `<tr>${r.cells.map((c) => `<td ${Array.isArray(c.props) ? c.props.join(' ') : c.props || ''}>${c.content}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
    return `<div class="toolbar"><a class="pill" href="#/skills">◂ Skills</a></div>` +
      section(`${esc(L(s.name, s.japanese))} <small>${esc(MH2.lang === 'jp' ? s.name : s.japanese)}</small>`, `<p class="desc">${esc(s.desc)}</p>
        <h3>Stages</h3>${table([{ h: 'Points', cls: 'n', f: (st) => `<b class="${String(st.points).startsWith('-') ? 'neg' : 'pos'}">${esc(st.points)}</b>` }, { h: 'Effect', f: (st) => esc(L(st.n, st.j)) }, { h: '', f: (st) => (st.d ? `<span class="muted">${MH2.rich(st.d)}</span>` : '') }], s.stages || [])}${tbl}`) +
      section(`Equipment with points <span class="count">${rows.length}</span>`, `<div class="tbl-wrap tall">${table([
        { h: 'Piece', f: ([p, x]) => `<a class="name-cell r${x.rarity}" href="${p[0] === 'decoration' ? '#/armor/Decorations' : `#/armor/${p[1]}/${p[2]}`}">${p[0] === 'decoration' ? MH2.icon(`${x.color}-icon gem-icon`) : MH2.armorIcon(p[1])}<span class="rname">${esc(L(x.name, x.japanese))}</span></a>` },
        { h: 'Type', f: ([p]) => (p[0] === 'decoration' ? 'Decoration' : esc(p[1])) },
        { h: 'Points', cls: 'n', f: ([p]) => `<b class="pos">+${p[4]}</b>` },
        { h: 'Other skills', f: ([, x]) => skills((x.skills || []).filter((k) => k.id !== id)) },
      ], rows).replace('<div class="tbl-wrap">', '').replace(/<\/div>$/, '')}</div>`);
  };
})();
;
/* ---- js/view-monsters.js ---- */
/* Bestiary: monster grid and a monster page with hitzones, status effects, attacks and rewards. */
(function () {
  const { esc, num, L, table, section, item, pct } = MH2;
  const ZONES = ['Cut', 'Impact', 'Shot', 'fire', 'water', 'thunder', 'ice', 'dragon', 'stun', 'Stagger'];
  const STATUS = { poison: 'Poison', paralysis: 'Paralysis', sleep: 'Sleep', stun: 'Stun', exhaust: 'Exhaust', pitfall: 'Pitfall Trap', shock: 'Shock Trap', flash: 'Flash Bomb', sonic: 'Sonic Bomb' };
  const KIND = { carves: 'Carves', captureRewards: 'Capture', breakRewards: 'Breaks' };
  const rich = (s) => String(s || '').replace(/<(?!\/?(b|i|br|em|strong|sup|sub)\b)[^>]*>/gi, '');

  MH2.views.monsters = async function () {
    const mons = MH2.data.core.monsters.map((m, k) => [m, k]);
    const card = ([m]) => `<a class="mon-card" href="#/monster/${esc(m.id)}">${MH2.icon(m.i)}<span>${esc(L(m.n, m.j))}</span><small>${esc(MH2.lang === 'jp' ? m.n : m.j)}</small></a>`;
    const large = mons.filter(([m]) => m.large), small = mons.filter(([m]) => !m.large);
    return section('Large Monsters <small>大型モンスター</small>', `<div class="mon-grid">${large.map(card).join('')}</div>`) +
      section('Small Monsters <small>小型モンスター</small>', `<div class="mon-grid">${small.map(card).join('')}</div>`);
  };

  const heat = (v) => {
    const n = Number(v);
    if (!isFinite(n) || v === '' || v == null) return '';
    const a = Math.min(1, Math.max(0, n / 100));
    return `background:rgba(242,144,46,${(a * 0.55).toFixed(2)});${n >= 45 ? 'color:#fff3df' : n <= 10 ? 'color:var(--muted)' : ''}`;
  };
  function hitTable(hz) {
    const head = ZONES.map((z, i) => (i < 3 ? `<th class="c">${MH2.dmgIcon(z)}</th>` : i <= 8 ? `<th class="c">${MH2.attrIcon(z)}</th>` : `<th class="c">${z}</th>`)).join('');
    return `<div class="tbl-wrap"><table class="tbl hz"><thead><tr><th>Part</th>${head}<th>Break/Cut</th></tr></thead><tbody>${hz.map((h) => `<tr><td class="nw">${esc(L(h.part, h.partJapanese))}</td>${
      h.zones.map((v, i) => `<td class="z" style="${i < 9 ? heat(v) : ''}">${esc(v)}</td>`).join('')}<td class="muted">${MH2.rich(h.break)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function stars(m) {
    if (!m.stars) return '';
    const g = (labels, vals, icons) => vals.map((v, i) => `<span class="weak">${icons ? MH2.attrIcon(labels[i]) : MH2.dmgIcon(labels[i])}<span class="st">${'★'.repeat(v)}${'<span class="muted">☆</span>'.repeat(3 - v)}</span></span>`).join('');
    return `<div class="hero-meta"><div>${g(['Cut', 'Impact', 'Shot'], m.stars.weapons || [])}</div>
      <div>${g(['fire', 'water', 'thunder', 'ice', 'dragon'], m.stars.elements || [], true)}</div>
      <div>${g(['poison', 'paralysis', 'sleep', 'stun'], m.stars.statuses || [], true)}</div></div>`;
  }
  function rewards(m) {
    const groups = [];
    (m.carves || []).forEach((r) => groups.push([r.rank, r.rankJapanese, 'carves', r]));
    (m.captureRewards || []).forEach((r) => groups.push([r.rank, r.rankJapanese, 'captureRewards', r]));
    (m.breakRewards || []).forEach((r) => groups.push([r.rank, r.rankJapanese, 'breakRewards', r]));
    if (!groups.length) return '';
    const ranks = [...new Set(groups.map((g) => g[0]))];
    return ranks.map((rank) => {
      const gs = groups.filter((g) => g[0] === rank);
      const body = gs.map(([, , kind, r]) => {
        if (kind === 'captureRewards')
          return `<h3>${KIND[kind]}</h3>` + table([{ h: 'Item', f: (x) => item(x.id) }, { h: 'Qty', cls: 'n', f: (x) => num(x.quantity) }, { h: 'Chance', cls: 'n', f: (x) => pct(x.percent) }], r.materials);
        return `<h3>${KIND[kind]}</h3>` + r.sources.map((s) => `<div class="drop-src"><b>${esc(L(s.name, s.japanese))}</b>${s.carveCount ? ` <span class="muted">· ${s.carveCount} carve${s.carveCount > 1 ? 's' : ''}</span>` : ''}${s.require ? ` <span class="muted">· ${esc(s.require)}</span>` : ''}
          <div class="chips">${s.materials.map((x) => item(x.id, x.quantity > 1 ? x.quantity : '', ` <span class="pct">${x.percent}%</span>`)).join('')}</div></div>`).join('');
      }).join('');
      return `<div class="panel"><h2 class="plate">${esc(L(rank, gs[0][1]))}</h2>${body}</div>`;
    }).join('');
  }
  function breakImages(m) {
    if (!m.breakImages || !m.breakImages.length) return '';
    return `<div class="breaks">${m.breakImages.map((b) => {
      const n = b.stages || 2;
      const base = b.mh1 ? 'img/common/monsters/part_breaks/' : 'img/mh2/monsters/part_breaks/';
      return Array.from({ length: n }, (_, i) => `<figure><img loading="lazy" src="${base}${esc(b.image)}_${i}.jpg" alt=""><figcaption>${esc(b.name)} · ${i === 0 ? 'intact' : 'broken' + (n > 2 ? ' ' + i : '')}</figcaption></figure>`).join('');
    }).join('')}</div>`;
  }

  MH2.views.monster = async function ([slug]) {
    await MH2.need('monsters');
    const m = MH2.data.monsters.monsters.find((x) => x.id === slug);
    if (!m) return MH2.views.notfound();
    const st = m.statusTolerances || [];
    const atk = m.attacks || [];
    return `<div class="toolbar"><a class="pill" href="#/monsters">◂ Bestiary</a></div>
      <section class="panel"><div class="mon-hero">
        ${m.image ? `<img class="portrait" src="${esc(m.image)}" alt="${esc(m.name)}">` : '<div></div>'}
        <div>
          <div class="hero">${MH2.icon(m.icon)}<div><h1 class="title">${esc(L(m.name, m.japanese))}</h1><div class="jp-sub">${esc(MH2.lang === 'jp' ? m.name : m.japanese)}</div></div></div>
          <div class="hero-meta">
            <span class="stat"><small>Base HP</small><b>${num(m.baseHP)}</b></span>
            ${m.sizes ? `<span class="stat"><small>Gold crown</small><b>${num(m.sizes[0])}</b></span><span class="stat"><small>Silver crown</small><b>${num(m.sizes[1])}</b></span><span class="stat"><small>Mini crown</small><b>${num(m.sizes[m.sizes.length - 1])}</b></span>` : ''}
            ${m.rage ? `<span class="stat"><small>Rage: attack</small><b>×${m.rage.attack}</b></span><span class="stat"><small>Rage: defense</small><b>×${m.rage.defense}</b></span><span class="stat"><small>Rage: speed</small><b>×${m.rage.speed}</b></span>` : ''}
          </div>
          ${stars(m)}
          <p class="desc">${rich(MH2.lang === 'jp' ? m.descriptionJapanese : m.description)}</p>
          ${(m.notes || []).map((n) => `<p class="note">${rich(n)}</p>`).join('')}
        </div></div></section>
      ${m.hitzones && m.hitzones.length ? section('Hitzones <small>肉質</small>', hitTable(m.hitzones) +
        (m.hitzonesAlt || []).map((a) => `<h3>${esc(a.name)}</h3>${hitTable(a.hitzones)}`).join('') +
        (m.hitzoneNotes ? `<p class="note">${rich(m.hitzoneNotes)}</p>` : '') + (m.detailedNotes ? `<p class="note">${rich(m.detailedNotes)}</p>` : '')) : ''}
      <div class="grid2">
        ${st.length ? section('Status Effects <small>状態異常</small>', table([
          { h: 'Status', f: (s) => `<span class="nw">${MH2.attrIcon(s.name)} ${esc(STATUS[s.name] || s.title)}</span>` },
          { h: 'Tolerance', f: (s) => (s.immune ? '<b class="neg">Immune</b>' : esc(String(s.tolerances || '–').replace(/,/g, ', '))) },
          { h: 'Recovery', f: (s) => esc(s.recovery || '–') }, { h: 'Duration', f: (s) => esc(s.duration || '–') },
          { h: 'Damage', f: (s) => (s.damage ? `${esc(s.damage)} <span class="muted">(${num(s.totalDamage)})</span>` : '–') }], st)) : ''}
        ${atk.length ? section('Attacks <small>攻撃</small>', `<div class="tbl-wrap tall">${table([
          { h: 'Attack', f: (a) => esc(L(a.name, a.japanese)) + (a.note ? ` <span class="muted">(${esc(a.note)})</span>` : '') },
          { h: 'Damage', cls: 'n', f: (a) => esc(Array.isArray(a.attack) ? a.attack.join(' / ') : a.attack ?? '–') },
          { h: 'Impact', cls: 'n', f: (a) => esc(a.impact) }, { h: 'KO', cls: 'n', f: (a) => esc(a.knockout) },
          { h: 'Effect', f: (a) => `${MH2.attrIcon(a.attribute, a.attributeName)}${MH2.attrIcon(a.attribute2, a.attribute2Name)} ${esc(L(a.effect, a.effectJapanese) || '')}${a.guardUp ? ' <span class="pill">Needs Guard Up</span>' : ''}` }], atk).replace('<div class="tbl-wrap">', '').replace(/<\/div>$/, '')}</div>`) : ''}
      </div>
      ${rewards(m) ? `<h2 class="plate" style="margin-top:.5rem">Rewards <small>剥ぎ取り・報酬</small></h2><div class="grid2">${rewards(m)}</div>` : ''}
      ${m.breakImages ? section('Part Breaks <small>部位破壊</small>', breakImages(m)) : ''}`;
  };
})();
;
/* ---- js/view-quests.js ---- */
/* Quests: list per town/category and a quest-board parchment page. */
(function () {
  const { esc, num, z, L, table, section, item, pct } = MH2;
  const TOWN = { jumbo: ['Jumbo Village', 'ジャンボ村'], dundorma: ['Dundorma', 'ドンドルマの街'] };
  const SEASON = { Warm: ['Warm', 'season-summer'], Cold: ['Cold', 'season-winter'], Breeding: ['Breeding', 'season-breeding'] };
  const BOX = { supplies: 'Supply Box', suppliesA: 'Delivery A (subquest)', suppliesB: 'Delivery B' };
  const state = { q: '' };
  const TOWN_ICON = { jumbo: 'green-icon house-icon', dundorma: 'orange-icon house-icon' };
  const CAT_ICON = {
    Standard: 'white-icon ticket-icon', Defense: 'red-icon barrel-bomb-icon', Urgents: 'red-icon ticket-icon', 'Hunter Basics': 'green-icon book-icon',
    'Hunter Dojo': 'cyan-icon book-icon', 'Low Rank': 'yellow-icon ticket-icon', 'High Rank': 'orange-icon ticket-icon', Siege: 'red-icon barrel-bomb-icon',
    "Hunter's Exams": 'purple-icon book-icon', 'Guild Master Urgent Requests': 'pink-icon ticket-icon', Events: 'purple-icon ticket-icon', Dojo: 'cyan-icon book-icon',
    'Grand Tournament': 'green-icon ticket-icon',
  };

  const qs = () => MH2.data.quests.quests;
  /** Merges repeated supply box entries (one per hunter) by adding up quantities. */
  const merge = (list) => {
    const m = new Map();
    list.forEach((s) => m.set(s.id, { id: s.id, quantity: (m.get(s.id)?.quantity || 0) + (s.quantity || 0) }));
    return [...m.values()];
  };
  const season = (q) => (q.season ? `<span class="${SEASON[q.season]?.[1] || ''}">${esc(MH2.lang === 'jp' ? q.seasonJapanese : SEASON[q.season]?.[0] || q.season)}</span>` : '');

  MH2.views.quests = async function ([town, catSlug]) {
    await MH2.need('quests');
    const all = qs();
    town = TOWN[town] ? town : 'jumbo';
    const cats = [...new Map(all.filter((q) => q.town === town).map((q) => [q.category, q])).values()];
    const cat = cats.find((c) => MH2.slug(c.category) === catSlug) || cats[0];
    const list = all.filter((q) => q.town === town && q.category === cat.category);
    const groups = [...new Map(list.map((q) => [q.groupLocale, q])).values()];
    const nq = state.q;
    const row = (q) => (!nq || MH2.matches(q.name + ' ' + q.japanese + ' ' + q.title + ' ' + q.japaneseTitle, nq)) ? `<a class="qrow" href="#/quest/${esc(q.id)}"><span class="qs">${'★'.repeat(q.stars || 0)}</span><span class="qn">${esc(L(q.name, q.japanese))}<br><small class="muted">${esc(L(q.title, q.japaneseTitle))}</small></span>
        <span class="qx">${(q.largeMonsters || []).map((m) => (m.id != null ? MH2.icon(MH2.data.core.monsters[m.id].i) : '')).join('')}</span>
        <span class="qx">${season(q)}${q.timeOfDay ? ' · ' + esc(q.timeOfDay) : ''}</span><span class="qx">${q.require ? esc(q.require) : ''}</span></a>` : '';
    return MH2.tabs(Object.entries(TOWN).map(([k, [en, jp]]) => [`#/quests/${k}`, esc(L(en, jp)), TOWN_ICON[k]]), `#/quests/${town}`) +
      MH2.tabs(cats.map((c) => [`#/quests/${town}/${MH2.slug(c.category)}`, esc(L(c.category, c.categoryJapanese)), CAT_ICON[c.category] || 'white-icon ticket-icon']), `#/quests/${town}/${MH2.slug(cat.category)}`, 'sub') +
      `<div class="toolbar"><input class="field" id="qq" type="search" placeholder="Filter quests…" value="${esc(state.q)}"></div>` +
      groups.map((g) => {
        const rows = list.filter((q) => q.groupLocale === g.groupLocale).map(row).join('');
        if (!rows) return '';
        const exam = g.exam ? ` <span class="pill">HR ${esc(g.exam.rank)}${g.exam.require ? ' · requires HR' + esc(g.exam.require) : ''}</span>` : '';
        return section(`${esc(L(g.groupLocale, g.groupLocaleJapanese))}${exam}`, `<div class="q-list">${rows}</div>`);
      }).join('');
  };
  MH2.views.quests.after = function () {
    const input = document.getElementById('qq');
    let t;
    input?.addEventListener('input', (e) => {
      state.q = e.target.value;
      clearTimeout(t);
      t = setTimeout(() => { MH2.rerender(); setTimeout(() => { const i = document.getElementById('qq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 30); }, 200);
    });
  };

  MH2.views.quest = async function ([id]) {
    await MH2.need('quests');
    const q = qs().find((x) => x.id === id);
    if (!q) return MH2.views.notfound();
    const money = q.rewardMoney || [];
    const supplies = ['supplies', 'suppliesA', 'suppliesB'].filter((k) => q[k] && q[k].length);
    const rewards = q.rewards || [];
    return `<div class="toolbar"><a class="pill" href="#/quests/${q.town}/${MH2.slug(q.category)}">◂ ${esc(L(...TOWN[q.town]))} · ${esc(L(q.category, q.categoryJapanese))}</a></div>
      <article class="parch">
        <div class="seal">${'★'.repeat(Math.min(q.stars || 0, 5))}<br>${q.stars || ''}★</div>
        <div class="stars">${'★'.repeat(q.stars || 0)}</div>
        <div style="font-weight:700;color:#6a3d10">${esc(L(q.title, q.japaneseTitle))}</div>
        <h1>${esc(L(q.name, q.japanese))}</h1>
        <div class="jp-sub" style="font-family:var(--jp);color:#6d5434">${esc(MH2.lang === 'jp' ? q.name : q.japanese)}</div>
        ${(q.goals || []).map((g, i) => `<div class="goal">${i === 0 ? 'Main objective' : i === 1 ? 'Subquest A' : 'Subquest B'}: ${esc(L(g.n, g.j))}</div>`).join('')}
        <div class="qmeta">
          <span><b>Locale</b>${esc(L(q.locale || q.groupLocale, q.localeJapanese || q.groupLocaleJapanese))}</span>
          ${q.season ? `<span><b>Season</b>${season(q)}</span>` : ''}${q.timeOfDay ? `<span><b>Time of day</b>${esc(L(q.timeOfDay, q.timeOfDayJapanese))}</span>` : ''}
          <span><b>Time limit</b>${num(q.time)} min</span><span><b>Fee</b>${z(q.fee)}</span>
          <span><b>Reward</b>${z(money[0])}${money[1] ? ` <span style="opacity:.75">(A: ${z(money[1])}${money[2] ? ', B: ' + z(money[2]) : ''})</span>` : ''}</span>
          ${q.hrp ? `<span><b>HR points</b>${q.hrp.join(' / ')}</span>` : ''}${q.require ? `<span><b>Requirement</b>${esc(q.require)}</span>` : ''}
        </div>
        ${(q.largeMonsters || []).length ? `<div class="chips">${q.largeMonsters.map((m) => (m.id != null ? MH2.monster(m.id, m.quantity ? `<b class="qty">×${m.quantity}</b>` : '') : esc(m.japanese))).join('')}</div>` : ''}
        ${q.notes ? `<p>${esc(q.notes)}</p>` : ''}
      </article>
      <div class="grid2">
        ${supplies.length ? section('Supplies <small>支給品</small>', supplies.map((k) => `<h3>${BOX[k]}</h3><div class="chips">${merge(q[k]).map((s) => item(s.id, s.quantity)).join('')}</div>`).join('')) : q.noSupplies ? section('Supplies', MH2.empty('This quest has no supplies.')) : ''}
        ${rewards.length ? section('Rewards <small>報酬</small>', rewards.map((r) => `<h3>${esc(L(r.rewardName || 'Rewards', r.rewardNameJapanese))}</h3>${table([
          { h: 'Item', f: (x) => item(x.id) }, { h: 'Qty', cls: 'n', f: (x) => num(x.quantity) }, { h: 'Chance', cls: 'n', f: (x) => pct(x.percent) }], r.materials.slice().sort((a, b) => b.percent - a.percent))}`).join('')) : ''}
      </div>`;
  };
})();
;
/* ---- js/view-events.js ---- */
/* Events: Dundorma's event quests and shop specials by day, laid out like the original wiki's home page:
   the Dundorma clock, a weekly calendar by hour (or monthly), current events and the current shop special. */
(function () {
  const { esc, L } = MH2;
  const SERVER_TZ = 'Europe/Berlin'; // the day (events + shop special) changes at 00:00 server time
  const DAY = 864e5, HOUR = 36e5;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } return null; };
  const state = { monthly: store('mh2.calType') === 'm', monday: store('mh2.weekStart') === 'm', cursor: null, pick: null, slide: 0 };

  /* ---------- dates: a "day" is a calendar date, kept as a UTC-midnight timestamp ---------- */
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: SERVER_TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const serverParts = (ms) => Object.fromEntries(fmt.formatToParts(ms).filter((x) => x.type !== 'literal').map((x) => [x.type, +x.value]));
  const serverToday = () => { const p = serverParts(Date.now()); return Date.UTC(p.year, p.month - 1, p.day); };
  const localToday = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); };
  const ymd = (d) => { const x = new Date(d); return [x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()]; };
  const dow = (d) => new Date(d).getUTCDay(); // Sunday = 0
  const col = (d) => (state.monday ? (dow(d) + 6) % 7 : dow(d));
  /** Real instant of 00:00 server time on server date d. */
  const serverMidnight = (d) => { const p = serverParts(d); return d - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - d); };
  const msToNextDay = () => { const p = serverParts(Date.now()); return ((23 - p.hour) * 3600 + (59 - p.minute) * 60 + (60 - p.second)) * 1000; };
  /** Where the server day boundary falls in the viewer's day: local hour, and whether the viewer is ahead of the server. */
  const boundary = () => {
    const d = serverToday(), m = new Date(serverMidnight(d));
    const sameDate = Date.UTC(m.getFullYear(), m.getMonth(), m.getDate()) === d;
    return { hour: m.getHours(), ahead: sameDate };
  };

  /* ---------- the rotations (same as the original wiki) ---------- */
  const eventsOn = (d) => {
    const C = MH2.data.calendar, rot = C.eventsRotation;
    return (rot[(ymd(d)[2] - 1) % rot.length] || []).map((k) => C.events[k]).filter(Boolean);
  };
  const specialOn = (d) => {
    const C = MH2.data.calendar, [y] = ymd(d);
    return C.shopSpecials[C.shopSpecialRotation[Math.round((d - Date.UTC(y, 0, 1)) / DAY) % C.shopSpecialRotation.length]];
  };

  /* ---------- Dundorma clock (real time → in-game date; 100 real minutes per game day) ---------- */
  const GAME_DAY = 6000, DAYS_PER_SEASON = 15, SEASONS = ['Warm', 'Cold', 'Breeding'];
  const SEASON_CLS = { Warm: 'season-summer', Cold: 'season-winter', Breeding: 'season-breeding' };
  const dundorma = (ms) => {
    const s = ms / 1000;
    const dayOfSeason = (s / GAME_DAY) % DAYS_PER_SEASON;
    const seasonF = (s / (GAME_DAY * DAYS_PER_SEASON)) % 3;
    const f = dayOfSeason % 1;
    return { day: Math.floor(dayOfSeason) + 1, season: SEASONS[Math.floor(seasonF)], next: SEASONS[(Math.floor(seasonF) + 1) % 3], seasonF,
      year: Math.floor(s / (GAME_DAY * DAYS_PER_SEASON * 3)), isDay: f < 0.5, dayProgress: (2 * dayOfSeason) % 1,
      toSwitch: ((f < 0.5 ? 0.5 : 1) - f) * GAME_DAY * 1000, toSeason: (DAYS_PER_SEASON - dayOfSeason) * GAME_DAY * 1000 };
  };
  const RELEASE_YEAR = dundorma(Date.UTC(2006, 1, 16)).year;
  const ordinal = (n) => n + (Math.floor(n / 10) % 10 === 1 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const span = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; };
  const hhmm = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  const hourLabel = (h) => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;

  /** The original's clock, built from the same sprite layers: frame, sun chevrons, time-of-day disc, season marks and ring. */
  const clockHTML = () => {
    const g = dundorma(Date.now());
    const t = g.dayProgress, deg = 30 * Math.floor((360 * t) / 30);
    const left = t < 0.5 ? '' : `transform:rotate(${deg - 180}deg)`;
    const right = t < 0.5 ? `transform:rotate(${deg}deg)` : 'display:none';
    return `<div class="dclock ${SEASON_CLS[g.season]}${g.isDay ? '' : ' clock-night'}">
        <div class="dc-frame">${'<div class="dc-chev"><span class="ui-icon dc-chev-icon"></span></div>'.repeat(4)}<span class="ui-icon dc-frame-icon"></span></div>
        <div class="dc-disc"><div class="dc-disc-l-wrap"><div class="dc-disc-l" style="${left}"></div></div><div class="dc-disc-r" style="${right}"></div></div>
        <div class="dc-marks"></div>
        <div class="dc-ring-wrap"><div class="dc-ring" style="transform:rotate(${(180 * g.seasonF) / 3}deg)"></div></div>
        <span class="ui-icon clock-day-icon dc-sun"></span><span class="ui-icon clock-night-icon dc-moon"></span>
        <span class="dc-season"></span>
      </div>
      <div class="dd-text">
        <p>It's currently <b>${g.isDay ? 'daytime' : 'nighttime'}</b> in Dundorma</p>
        <p class="dd-date">${ordinal(g.day)} <span class="${SEASON_CLS[g.season]}">${g.season} Season</span> ${g.year}<br>The city has stood for ${g.year - RELEASE_YEAR} years.</p>
        <p class="muted dd-more">${g.isDay ? 'Night falls' : 'Day breaks'} in ${span(g.toSwitch)} · <span class="${SEASON_CLS[g.next]}">${g.next} Season</span> in ${span(g.toSeason)}</p>
      </div>`;
  };

  /* ---------- event pieces ---------- */
  const monsterOf = (lm) => {
    const ms = MH2.data.core.monsters;
    const k = ms.findIndex((m) => m.j === lm.japanese);
    return k >= 0 ? MH2.monster(k) : '';
  };
  const block = (e) => `<a class="wk-ev loc-${esc(e.localeColor || 'gray')}" href="#/quest/${esc(e.id)}" title="${esc(`${e.stars}★ ${L(e.name, e.japanese)} · ${L(e.locale, e.localeJapanese)}`)}"><span class="wk-st">${e.stars}★</span> ${esc(L(e.name, e.japanese))}<small>${esc(L(e.locale, e.localeJapanese))}</small></a>`;
  const specialTag = (sp) => (sp && sp.description ? `<span class="wk-sp" title="${esc(L(sp.description, sp.descriptionJapanese))}">${esc(L(sp.title, sp.japanese))}</span>` : '');
  const segment = (d, rows, start) => `<div class="wk-seg" style="grid-row:${start + 1} / span ${rows}" data-day="${d}">${eventsOn(d).map(block).join('')}${specialTag(specialOn(d))}</div>`;

  /* ---------- weekly calendar by hour ---------- */
  function weekly() {
    const lt = localToday();
    const start = state.cursor - col(state.cursor) * DAY;
    const days = Array.from({ length: 7 }, (_, i) => start + i * DAY);
    const a = ymd(days[0]), b = ymd(days[6]);
    const { hour: w, ahead } = boundary();
    const nowH = new Date().getHours();
    const head = days.map((d, i) => `<div class="wk-day${d === lt ? ' today' : ''}" style="grid-column:${i + 2}">${d === lt ? '+' : ''}${DAYS[dow(d)]}${d === lt ? '+' : ''}<b>${ymd(d)[2]}</b></div>`).join('');
    const hours = Array.from({ length: 24 }, (_, h) => `<div class="wk-hour${h === nowH ? ' now' : ''}" style="grid-row:${h + 2}">${h === nowH ? '⇒ ' : ''}${hourLabel(h)}</div>`).join('');
    // each local day column shows the server day(s) that overlap it: before the boundary hour one day, after it the next
    const cols = days.map((d, i) => {
      const segs = w === 0 ? segment(d, 24, 0)
        : ahead ? segment(d - DAY, w, 0) + segment(d, 24 - w, w)
          : segment(d, w, 0) + segment(d + DAY, 24 - w, w);
      return `<div class="wk-col${d === lt ? ' today' : ''}" style="grid-column:${i + 2}">${segs}</div>`;
    }).join('');
    const title = `${a[2]}${a[1] !== b[1] ? ' ' + MONTHS[a[1]] : ''} – ${b[2]} ${MONTHS[b[1]]} ${b[0]}`;
    const nowLine = days.includes(lt) ? `<div class="wk-now" style="grid-row:${nowH + 2}"></div>` : '';
    return { title, body: `<div class="wk-grid"><div class="wk-corner">Hours</div>${head}${hours}${cols}${nowLine}</div>` };
  }

  /* ---------- monthly calendar ---------- */
  function monthly() {
    const lt = localToday();
    const [y, m] = ymd(state.cursor);
    const first = Date.UTC(y, m, 1), last = Date.UTC(y, m + 1, 0);
    const lead = col(first);
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<div class="mo-cell blank"></div>');
    for (let d = first; d <= last; d += DAY) {
      const evs = eventsOn(d);
      cells.push(`<button class="mo-cell${d === lt ? ' today' : ''}${d === state.pick ? ' on' : ''}" data-day="${d}"><span class="mo-num">${ymd(d)[2]}</span>
        <span class="mo-ev loc-${esc(evs[0]?.localeColor || 'gray')}">${evs.length ? esc(L(evs[0].name, evs[0].japanese)) + (evs.length > 1 ? ` <span class="muted">+${evs.length - 1}</span>` : '') : 'no events'}</span>
        ${specialTag(specialOn(d))}</button>`);
    }
    const order = state.monday ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
    return { title: `${MONTHS[m]} ${y}`, body: `<div class="mo-grid">${order.map((i) => `<div class="mo-head">${DAYS[i].slice(0, 3)}</div>`).join('')}${cells.join('')}</div>` };
  }

  const calendarHTML = () => {
    const c = state.monthly ? monthly() : weekly();
    return `<div class="cal-top"><button class="cal-arrow" data-cal="-1" aria-label="Previous">←</button><b>${c.title}</b><button class="cal-arrow" data-cal="1" aria-label="Next">→</button></div>
      ${c.body}
      <div class="cal-toggles">
        <label class="sw">First day of the week: <span>Sunday</span><input type="checkbox" id="cal-monday"${state.monday ? ' checked' : ''}><i></i><span>Monday</span></label>
        <span class="muted">¦</span>
        <label class="sw"><span>Weekly</span><input type="checkbox" id="cal-monthly"${state.monthly ? ' checked' : ''}><i></i><span>Monthly</span></label>
      </div>`;
  };

  /* ---------- right column: countdown, current events slider, shop special ---------- */
  const eventCard = (e) => `<div class="cur-ev loc-${esc(e.localeColor || 'gray')}">
      <a class="cur-title" href="#/quest/${esc(e.id)}">${e.stars}★ ${esc(L(e.name, e.japanese))}</a>
      <p><b>Locale:</b> ${esc(L(e.locale, e.localeJapanese))}</p>
      ${(e.largeMonsters || []).length ? `<div class="chips">${e.largeMonsters.map(monsterOf).join('')}</div>` : ''}
      <p><b>Goal:</b></p><ul>${(e.goals || []).map((g) => `<li>${g && g.n && g.n !== 'none' ? esc(L(g.n, g.j)) : '<span class="muted">none</span>'}</li>`).join('')}</ul>
      <p class="cur-req">Requirement: ${esc(e.require || 'none')}</p>
    </div>`;
  const sideHTML = () => {
    const d = state.pick ?? serverToday();
    const isNow = d === serverToday();
    const evs = eventsOn(d), sp = specialOn(d);
    if (state.slide >= evs.length) state.slide = 0;
    const [, m, dd] = ymd(d);
    return `<p class="cur-countdown">Event and Shop Special will change in: <b id="cal-count">${hhmm(msToNextDay())}</b></p>
      <section class="cur-box"><h3>${isNow ? 'Current Events' : `Events on ${DAYS[dow(d)]} ${dd} ${MONTHS[m]}`}${isNow ? '' : ' <button class="cur-back" data-cal="0">Today</button>'}</h3>
        ${evs.length ? `<div class="cur-slider"><button class="cur-arrow" data-slide="-1" aria-label="Previous event"${state.slide ? '' : ' disabled'}>‹</button>
          <div class="cur-view"><div class="cur-track" style="transform:translateX(-${state.slide * 100}%)">${evs.map(eventCard).join('')}</div></div>
          <button class="cur-arrow" data-slide="1" aria-label="Next event"${state.slide < evs.length - 1 ? '' : ' disabled'}>›</button></div>
          <div class="cur-dots">${evs.map((_, i) => `<span class="${i === state.slide ? 'on' : ''}"></span>`).join('')}</div>` : MH2.empty('No events')}
      </section>
      <section class="cur-box"><h3>${isNow ? 'Current Shop Special' : 'Shop Special'}</h3>
        <div class="cur-sp">${sp && sp.description ? `<b>${esc(L(sp.title, sp.japanese))}</b><p>${esc(L(sp.description, sp.descriptionJapanese))}</p>` : '<b>No shop specials currently active</b>'}</div>
      </section>`;
  };

  MH2.views.events = async function () {
    await MH2.need('calendar');
    if (state.cursor == null) state.cursor = localToday();
    const next = Date.now() + msToNextDay();
    const local = new Date(next).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `<div id="events-page">
      <section class="panel ev-head"><h2 class="plate">${MH2.icon('orange-icon house-icon')} Dundorma Event Calendar</h2>
        <p class="muted">The current event(s) and shop special change each day at <b>${local}</b> your time (00:00 Berlin).</p>
        <div class="dd-time" id="dd-clock">${clockHTML()}</div>
      </section>
      <div class="ev-layout">
        <section class="panel ev-cal" id="cal">${calendarHTML()}</section>
        <aside class="panel ev-side" id="ev-side">${sideHTML()}</aside>
      </div>
      <p class="muted ev-foot">Dundorma was closed to the public on 15th Cold Season 4849 (30th June 2011). It re-opened on 4th Cold Season 6263 (4th August 2023).</p>
    </div>`;
  };

  let tick;
  MH2.views.events.after = () => {
    const el = document.getElementById('events-page');
    clearInterval(tick);
    let shownDay = serverToday(), shownHour = new Date().getHours();
    tick = setInterval(() => {
      if (!document.getElementById('dd-clock')) return clearInterval(tick);
      document.getElementById('dd-clock').innerHTML = clockHTML();
      const c = document.getElementById('cal-count');
      if (c) c.textContent = hhmm(msToNextDay());
      if (serverToday() !== shownDay || new Date().getHours() !== shownHour) { shownDay = serverToday(); shownHour = new Date().getHours(); state.pick = null; MH2.rerender(); }
    }, 10000);
    const redrawCal = () => (document.getElementById('cal').innerHTML = calendarHTML());
    const redrawSide = () => (document.getElementById('ev-side').innerHTML = sideHTML());
    el.addEventListener('change', (e) => {
      if (e.target.id === 'cal-monday') { state.monday = e.target.checked; store('mh2.weekStart', state.monday ? 'm' : 's'); redrawCal(); }
      if (e.target.id === 'cal-monthly') { state.monthly = e.target.checked; store('mh2.calType', state.monthly ? 'm' : 'w'); redrawCal(); }
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cal],[data-slide],[data-day]');
      if (!b || e.target.closest('a[href]')) return;
      if (b.dataset.slide) { state.slide += +b.dataset.slide; redrawSide(); return; }
      if (b.dataset.cal) {
        const dir = +b.dataset.cal;
        if (!dir) { state.cursor = localToday(); state.pick = null; state.slide = 0; redrawSide(); }
        else if (state.monthly) { const [y, m] = ymd(state.cursor); state.cursor = Date.UTC(y, m + dir, 1); }
        else state.cursor += dir * 7 * DAY;
        redrawCal();
        return;
      }
      state.pick = +b.dataset.day === serverToday() ? null : +b.dataset.day;
      state.slide = 0;
      redrawSide();
      el.querySelectorAll('.mo-cell.on, .wk-seg.on').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    });
  };

  /** Home page strip: today's events and shop special. */
  MH2.eventsToday = async () => {
    await MH2.need('calendar');
    const d = serverToday(), sp = specialOn(d);
    return `<section class="panel"><h2 class="plate">${MH2.icon('yellow-icon ticket-icon')} Today in Dundorma <a class="more" href="#/events">Calendar →</a></h2>
      <div class="ev-strip">${eventsOn(d).map((e) => `<a class="ev-mini loc-${esc(e.localeColor || 'gray')}" href="#/quest/${esc(e.id)}"><span class="ev-stars">${e.stars}★</span><span><b>${esc(L(e.name, e.japanese))}</b><small>${esc(L(e.locale, e.localeJapanese))}${e.require ? ' · ' + esc(e.require) : ''}</small></span></a>`).join('')}
      <a class="ev-mini sp" href="#/events">${MH2.icon(sp && sp.description ? 'orange-icon coin-icon' : 'gray-icon coin-icon')}<span><b>${sp && sp.description ? esc(L(sp.title, sp.japanese)) : 'No shop special'}</b><small>Changes in ${span(msToNextDay())}</small></span></a></div></section>`;
  };
})();
;
/* ---- js/view-maps.js ---- */
/* Maps: map image with gathering points and tables per area, rank and season. */
(function () {
  const { esc, L, section, item, icon } = MH2;
  const IMG = {
    'Jungle (Day)': 'jungle_day', 'Jungle (Night)': 'jungle_night', 'Desert (Day)': 'desert_day', 'Desert (Night)': 'desert_night',
    'Swamp (Day)': 'swamp', 'Swamp (Night)': 'swamp', 'Snowy Mountain (Day)': 'snowy_mountain', 'Snowy Mountain (Night)': 'snowy_mountain',
    'Volcano (Day)': 'volcano_day', 'Volcano (Night)': 'volcano_night', 'Forest & Hills (Day)': 'forest', 'Forest & Hills (Night)': 'forest',
    'The Tower (Foothills)': 'tower_camp', 'The Tower (Layout 1)': 'tower_1', 'The Tower (Layout 2)': 'tower_2', 'The Tower (Layout 3)': 'tower_3',
    Fort: 'fort', 'Battle Quarters': 'battle_quarters', 'Castle Schrade': 'schrade', 'The Battleground': 'battlegrounds', 'The Arena': 'arena', 'The Grand Arena': 'great_arena',
  };
  const SEASONS = [['summer', 'Warm', 'season-summer'], ['winter', 'Cold', 'season-winter'], ['breeding', 'Breeding', 'season-breeding']];
  const state = { rank: 0, season: 'summer' };

  /** Short label: the part in parentheses (Day, Night, Layout 1...) or the full name. */
  const short = (t) => (t.match(/[(（]([^)）]+)[)）]/) || [, t])[1];
  /* map picker: hunting grounds with variants as cards, single-layout stages as one row of equal links */
  const ZONE_COLOR = { Jungle: 'green', Desert: 'orange', Swamp: 'purple', Snowy: 'blue', Volcano: 'red', Forest: 'green', Tower: 'cyan', Arena: 'yellow' };
  const zoneColor = (t) => ZONE_COLOR[Object.keys(ZONE_COLOR).find((k) => t.includes(k))] || 'gray';
  const variantIcon = (v) => (/^Day$/.test(v) ? '<span class="mv-ico day">☀</span>' : /^Night$/.test(v) ? '<span class="mv-ico night">☾</span>'
    : /Foothills/.test(v) ? icon('green-icon house-icon') : icon('white-icon map-icon'));
  function mapNav(cur) {
    const multi = [], single = [];
    MH2.data.maps.regions.forEach((r) => {
      const hasVar = r.maps.length > 1 && r.maps.every((m) => /[(（]/.test(m.title));
      if (hasVar) multi.push(r); else single.push(...r.maps);
    });
    const link = (m, label, ic) => `<a class="mv-btn${m.title === cur ? ' on' : ''}" href="#/maps/${MH2.slug(m.title)}">${ic}<span>${esc(label)}</span></a>`;
    const cards = multi.map((r) => {
      const on = r.maps.some((m) => m.title === cur);
      const n = r.maps.length;
      return `<div class="mv-card${on ? ' on' : ''}${n > 2 ? ' wide' : ''}"><div class="mv-head">${icon(`${zoneColor(r.maps[0].title)}-icon map-icon`)}<b>${esc(r.name)}</b></div>
        <div class="mv-opts" style="--n:${n}">${r.maps.map((m) => { const v = short(L(m.title, m.titleJapanese)); return link(m, v, variantIcon(short(m.title))); }).join('')}</div></div>`;
    }).join('');
    const stages = single.map((m) => link(m, L(m.title, m.titleJapanese), icon(`${zoneColor(m.title)}-icon map-icon`))).join('');
    return `<h3 class="mv-sub">Hunting grounds</h3><div class="mv-cards">${cards}</div>
      <h3 class="mv-sub">Stages &amp; arenas</h3><div class="mv-stages">${stages}</div>`;
  }
  const allMaps = () => MH2.data.maps.regions.flatMap((r) => r.maps.map((m) => ({ ...m, region: r.name })));

  MH2.views.maps = async function ([slug]) {
    await MH2.need('maps');
    const maps = allMaps();
    const mp = maps.find((m) => MH2.slug(m.title) === slug) || maps[0];
    const ranks = mp.yieldRanks || [];
    if (state.rank >= ranks.length) state.rank = 0;
    const yr = ranks[state.rank];
    // pins come in the same order as the zones' gathering points: number them per zone like the original wiki
    const order = (yr || ranks[0] || { zones: [] }).zones.flatMap((zn) => zn.spots.map((sp, j) => ({ zone: L(zn.zone, zn.zoneJapanese), n: j + 1 })));
    const pins = (mp.icons || []).map((p, i) => {
      const o = order[i];
      const tip = (o ? `${o.zone} · ${o.n} · ` : '') + L(p.name, p.japanese);
      return `<span class="map-pin" data-i="${i}" style="left:${p.x}%;top:${p.y}%" aria-label="${esc(tip)}">${icon(p.icon)}${o ? `<b>${o.n}</b>` : ''}</span>`;
    }).join('');
    state.tips = [];
    const zones = yr ? yr.zones.map((zn) => {
      const spots = zn.spots.map((sp, j) => {
        const list = (sp[state.season] || []).slice().sort((a, b) => b.percent - a.percent);
        return (state.tips[state.tips.length] = `<div class="spot"><div class="spot-h"><span class="spot-n">${j + 1}</span>${icon(sp.icon)} <b>${esc(L(sp.name, sp.japanese) || 'Spot')}</b> ${sp.count ? `<span class="muted">· ${sp.count} attempt${sp.count > 1 ? 's' : ''}</span>` : ''}</div>
          <div class="chips">${list.map((x) => item(x.id, '', ` <span class="pct">${x.percent}%</span>`)).join('') || '<span class="muted">Nothing this season</span>'}</div></div>`);
      }).join('');
      return `<div class="panel zone-card"><h2 class="plate">${esc(L(zn.zone, zn.zoneJapanese))}</h2>${spots || MH2.empty('No gathering points')}</div>`;
    }).join('') : '';
    return section('Maps <small>マップ</small>', `<div class="map-nav">${mapNav(mp.title)}</div>`) +
      `<div class="grid2" style="grid-template-columns:minmax(0,560px) 1fr">
        <section class="panel"><h2 class="plate">${esc(L(mp.title, mp.titleJapanese))}</h2>
          <div class="map-wrap"><div class="map-box"><img src="img/mh2/maps/${IMG[mp.title] || 'fort'}.png" width="512" height="512" alt="" decoding="sync">${pins}</div></div>
          <p class="muted">Hover over the icons to see what each point is.</p></section>
        <section class="panel"><h2 class="plate">Gathering</h2>
          ${ranks.length ? `<div class="toolbar pills">${ranks.map((r, i) => `<button class="pill${i === state.rank ? ' on' : ''}" data-rank="${i}">${esc(L(r.rank, r.rankJapanese))}</button>`).join('')}</div>
          <div class="toolbar pills">${SEASONS.map(([k, t, c]) => `<button class="pill${k === state.season ? ' on' : ''}" data-season="${k}"><span class="${c}">●</span> ${t}</button>`).join('')}</div>` : MH2.empty('This map has no gathering data.')}
        </section>
      </div>
      <div class="cols">${zones}</div>`;
  };
  // map pins are drawn at the original's size (32 px on a 512 px map) and shrink with the map on narrow screens
  const pinScale = new ResizeObserver((entries) => entries.forEach((e) => e.target.style.setProperty('--k', Math.min(1, e.contentRect.width / 512))));
  // hovering (or tapping) a pin shows that gathering point's card: name, attempts and item chances for the chosen rank/season
  let tip;
  const showTip = (pin) => {
    const html = state.tips && state.tips[pin.dataset.i];
    if (!html) return hideTip();
    if (!tip) { tip = document.createElement('div'); tip.className = 'pin-tip'; document.body.appendChild(tip); }
    const zone = (pin.getAttribute('aria-label') || '').split(' · ')[0];
    tip.innerHTML = `<div class="pin-tip-zone">${esc(zone)}</div>${html}`;
    tip.style.display = 'block';
    const r = pin.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, gap = 8;
    let x = r.right + gap; if (x + w > innerWidth - 8) x = r.left - w - gap; if (x < 8) x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    let y = r.top + r.height / 2 - h / 2; y = Math.max(8, Math.min(innerHeight - h - 8, y));
    tip.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
    document.querySelectorAll('.map-pin.on').forEach((p) => p !== pin && p.classList.remove('on'));
    pin.classList.add('on');
  };
  function hideTip() { if (tip) tip.style.display = 'none'; document.querySelectorAll('.map-pin.on').forEach((p) => p.classList.remove('on')); }
  window.addEventListener('mh2:navigate', hideTip);
  document.addEventListener('scroll', hideTip, { passive: true, capture: true });
  MH2.views.maps.after = function () {
    hideTip();
    document.querySelectorAll('.map-box').forEach((b) => {
      pinScale.observe(b);
      b.addEventListener('mouseover', (e) => { const p = e.target.closest('.map-pin'); if (p) showTip(p); });
      b.addEventListener('mouseleave', hideTip);
      b.addEventListener('mouseout', (e) => { if (e.target.closest('.map-pin') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.map-pin'))) hideTip(); });
      b.addEventListener('click', (e) => { const p = e.target.closest('.map-pin'); if (p) showTip(p); else hideTip(); });
    });
    document.querySelectorAll('[data-rank]').forEach((b) => b.addEventListener('click', () => { state.rank = Number(b.dataset.rank); MH2.rerender(); }));
    document.querySelectorAll('[data-season]').forEach((b) => b.addEventListener('click', () => { state.season = b.dataset.season; MH2.rerender(); }));
  };
})();
;
/* ---- js/view-meals.js ---- */
/* Felyne Kitchen meals: tick the ingredients you have and see which dishes you can cook, plus effect filters. */
(function () {
  const { esc, L, table, section, item, icon } = MH2;
  const SEASON = [['Warm Season', 'Warm', 'season-summer'], ['Cold Season', 'Cold', 'season-winter'], ['Breeding Season', 'Breeding', 'season-breeding']];
  const GROUPS = [
    ['Meat', /meat-icon/], ['Fish', /fish-icon/], ['Vegetables', /tuber-icon|herb-icon|mushroom-icon/], ['Grains and beans', /seed-icon/],
    ['Drinks and oils', /jar-icon/], ['Eggs and dairy', /egg-icon/], ['Bugs', /bug-icon/],
  ];
  const STORE = 'mh2.mealIngredients';
  const load = () => { try { return new Set(JSON.parse(localStorage.getItem(STORE) || '[]')); } catch (e) { return new Set(); } };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify([...state.have])); } catch (e) { /* storage unavailable: ticks just won't persist */ } };
  const state = { season: 0, q: '', stat: '', sign: 'plus', mode: 'only', have: load() };

  const seasonMeals = () => MH2.data.meals.seasons[state.season].meals;
  const ingredientIds = () => [...new Set(seasonMeals().flatMap((m) => m.ingredients.map((i) => i.id)))];
  const itemName = (id) => { const it = MH2.data.core.items[id]; return it ? L(it.n, it.j) : ''; };

  function rows() {
    const q = state.q;
    const have = state.have;
    return seasonMeals().filter((m) => {
      const ids = m.ingredients.map((i) => i.id);
      if (have.size && (state.mode === 'only' ? !ids.every((id) => have.has(id)) : !ids.some((id) => have.has(id)))) return false;
      if (q && !MH2.matches(m.dish + ' ' + m.dishJapanese + ' ' + ids.map((id) => { const it = MH2.data.core.items[id]; return it ? it.n + ' ' + it.j : ''; }).join(' '), q)) return false;
      if (state.stat && !(m.keyedEffects?.[state.stat] || {})[state.sign]) return false;
      return true;
    });
  }
  function drawTable() {
    const list = rows();
    const hint = state.have.size ? '' : ' · tick the ingredients you have to see only what you can cook';
    return `<p class="muted">${list.length} dish${list.length === 1 ? '' : 'es'}${hint}</p>` + table([
      { h: 'Dish', f: (m) => `<b>${esc(L(m.dish, m.dishJapanese))}</b><br><small class="jp-sub">${esc(MH2.lang === 'jp' ? m.dish : m.dishJapanese)}</small>` },
      { h: 'Ingredients', f: (m) => `<span class="chips">${m.ingredients.map((i) => item(i.id)).join('<span class="muted">+</span>')}</span>` },
      { h: 'Effects', f: (m) => (m.effects || []).map((e) => `<span class="nw eff ${String(e.amount).startsWith('-') ? 'neg' : 'pos'}">${esc(L(e.stat, e.statJapanese))} <b>${esc(e.amount)}</b></span>`).join(' · ') || '<span class="muted">No effect</span>' },
    ], list);
  }
  function drawPicker() {
    const ids = ingredientIds();
    const items = MH2.data.core.items;
    const used = new Set();
    const groups = GROUPS.map(([name, re]) => {
      const list = ids.filter((id) => !used.has(id) && re.test(items[id]?.i || ''));
      list.forEach((id) => used.add(id));
      return [name, list];
    });
    groups.push(['Other', ids.filter((id) => !used.has(id))]);
    // one compact flowing list, still ordered by type so similar ingredients sit together
    const ordered = groups.flatMap(([, list]) => list.sort((a, b) => itemName(a).localeCompare(itemName(b))));
    // vertical order in equal-width columns: rows are set so the grid fills top to bottom (4 columns, 3 on narrow screens)
    return `<div class="ing-list" style="--rows4:${Math.ceil(ordered.length / 4)};--rows3:${Math.ceil(ordered.length / 3)}">${ordered.map((id) => `<label class="ing r${items[id].r || 0}${state.have.has(id) ? ' on' : ''}" title="${esc(itemName(id))}">
        <input type="checkbox" data-ing="${id}"${state.have.has(id) ? ' checked' : ''}>${icon(items[id].i)}<span>${esc(itemName(id))}</span></label>`).join('')}</div>`;
  }

  MH2.views.meals = async function () {
    await MH2.need('meals');
    const stats = [...new Set(MH2.data.meals.seasons.flatMap((s) => s.meals.flatMap((m) => Object.keys(m.keyedEffects || {}))))];
    return section('Felyne Kitchen <small>ネコ飯</small>', `
      <div class="toolbar pills">${SEASON.map(([, t, c], i) => `<button class="pill${i === state.season ? ' on' : ''}" data-s="${i}"><span class="${c}">●</span> ${t}</button>`).join('')}</div>
      <h3>Your ingredients <span class="muted" id="ingCount">(${state.have.size} ticked)</span></h3>
      <div class="toolbar">
        <label><input type="radio" name="mmode" value="only"${state.mode === 'only' ? ' checked' : ''}> Dishes using only ticked ingredients</label>
        <label><input type="radio" name="mmode" value="any"${state.mode === 'any' ? ' checked' : ''}> Dishes using any ticked ingredient</label>
        <button class="pill" id="ingAll">Tick all</button><button class="pill" id="ingNone">Clear</button>
      </div>
      <div id="ingPicker">${drawPicker()}</div>`) +
      section('Dishes', `
      <div class="toolbar">
        <input class="field" id="mi" type="search" placeholder="Search dish or ingredient…" value="${esc(state.q)}">
        <select class="field" id="ms"><option value="">Any effect</option>${stats.map((s) => `<option value="${esc(s)}"${state.stat === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <select class="field" id="mg">${MH2.opt('plus', 'goes up', '<b class="pos">▲</b>', state.sign === 'plus')}${MH2.opt('minus', 'goes down', '<b class="neg">▼</b>', state.sign === 'minus')}</select>
      </div><div id="mlist">${drawTable()}</div>`);
  };
  MH2.views.meals.after = function () {
    const box = document.getElementById('mlist');
    const picker = document.getElementById('ingPicker');
    const redraw = () => {
      box.innerHTML = drawTable();
      document.getElementById('ingCount').textContent = `(${state.have.size} ticked)`;
    };
    let t;
    document.getElementById('mi').addEventListener('input', (e) => { state.q = e.target.value; clearTimeout(t); t = setTimeout(redraw, 150); });
    document.getElementById('ms').addEventListener('change', (e) => { state.stat = e.target.value; redraw(); });
    document.getElementById('mg').addEventListener('change', (e) => { state.sign = e.target.value; redraw(); });
    document.querySelectorAll('input[name=mmode]').forEach((r) => r.addEventListener('change', (e) => { state.mode = e.target.value; redraw(); }));
    picker.addEventListener('change', (e) => {
      const id = Number(e.target.dataset.ing);
      if (Number.isNaN(id)) return;
      if (e.target.checked) state.have.add(id); else state.have.delete(id);
      e.target.closest('label').classList.toggle('on', e.target.checked);
      save();
      redraw();
    });
    const setAll = (on) => {
      ingredientIds().forEach((id) => (on ? state.have.add(id) : state.have.delete(id)));
      save();
      picker.innerHTML = drawPicker();
      redraw();
    };
    document.getElementById('ingAll').addEventListener('click', () => setAll(true));
    document.getElementById('ingNone').addEventListener('click', () => setAll(false));
    document.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { state.season = Number(b.dataset.s); MH2.rerender(); }));
  };
})();
;
/* ---- js/view-extras.js ---- */
/* Miscellany: text/table sections from the original wiki (trades, Maka pots, villagers, titles, seasons…). */
(function () {
  const { esc, section } = MH2;
  const GROUPS = [['items', 'Town and Items', 'orange-icon house-icon'], ['home', 'Seasons and Shop Specials', 'yellow-icon coin-icon'], ['misc', 'Hunter Titles', 'yellow-icon ticket-icon']];
  // icons as on the original wiki where it has one (combinations, veggie elder, maka, healing, titles), MH-themed picks elsewhere
  const ICONS = [
    [/^Item Combinations/, 'white-icon book-icon'], [/^Veggie Elder/, 'green-icon mystery-icon'], [/^Maka/, 'yellow-icon maka-pot-prepared-icon'],
    [/^Healing/, 'red-icon powder-icon'], [/^Jumbo Villager/, 'orange-icon talking-head-icon'], [/^Villagers by/, 'cyan-icon talking-head-icon'],
    [/^Item Delivery/, 'yellow-icon egg-icon'], [/^Quest Levels/, 'red-icon ticket-icon'], [/^Villager Events/, 'pink-icon sheet-music-icon'],
    [/^Dundorma Vendors/, 'orange-icon coin-icon'], [/^Seasons and Time/, 'green-icon herb-icon'], [/^Seasons/, 'green-icon seed-icon'],
    [/^Time of Day/, 'yellow-icon compass-icon'], [/^Jumbo vs/, 'blue-icon house-icon'], [/^Shop Special/, 'orange-icon coin-icon'],
    [/^Hunter Titles/, 'yellow-icon ticket-icon'],
  ];
  const iconOf = (title) => (ICONS.find(([re]) => re.test(title)) || [null, 'white-icon book-icon'])[1];

  MH2.views.extras = async function ([gKey, n]) {
    await MH2.need('extras');
    const E = MH2.data.extras;
    const g = GROUPS.find(([k]) => k === gKey) || GROUPS[0];
    const secs = E[g[0]];
    const idx = Math.min(Number(n) || 0, secs.length - 1);
    const s = secs[idx];
    const clean = (t) => MH2.stripJp(t.replace(/\s*[MDG]\*$/, ''));
    return MH2.tabs(GROUPS.map(([k, t, ico]) => [`#/extras/${k}`, t, ico]), `#/extras/${g[0]}`) +
      (secs.length > 1 ? `<div class="tabs sub">${secs.map((x, i) => MH2.tab(`#/extras/${g[0]}/${i}`, esc(clean(x.title)), iconOf(x.title), i === idx)).join('')}</div>` : '') +
      section(`${MH2.icon(iconOf(s.title))} ${esc(clean(s.title))}`, `<div class="prose">${s.html}</div>`);
  };
  const JP_ONLY = /^[\s　-ヿ㐀-鿿豈-﫿！-ﾟ々〆〜（）()・、。]+$/;
  /** English-only mode: table columns written only in Japanese (e.g. hunter titles) are dropped, header spans adjusted. */
  function dropJapaneseColumns(table) {
    const body = [...table.tBodies].flatMap((b) => [...b.rows]);
    if (!body.length || body.some((r) => [...r.cells].some((c) => c.colSpan > 1 || c.rowSpan > 1))) return;
    const width = body[0].cells.length;
    for (let c = width - 1; c >= 0; c--) {
      const cells = body.map((r) => r.cells[c]).filter(Boolean);
      if (!cells.some((x) => x.textContent.trim()) || !cells.every((x) => !x.textContent.trim() || JP_ONLY.test(x.textContent))) continue;
      cells.forEach((x) => x.remove());
      for (const hr of table.tHead ? table.tHead.rows : []) {
        let col = 0;
        for (const h of [...hr.cells]) {
          if (c < col + h.colSpan) { if (h.colSpan > 1) h.colSpan -= 1; else h.remove(); break; }
          col += h.colSpan;
        }
      }
    }
  }
  MH2.views.extras.after = (_, el) => {
    if (MH2.noJp) el.querySelectorAll('.prose table').forEach(dropJapaneseColumns);
    // the original's tables come bare (or in their own scroll containers): give each the standard table frame
    el.querySelectorAll('.prose table').forEach((t) => {
      const box = t.parentElement;
      if (box.classList.contains('tbl-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'tbl-wrap';
      box.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
    MH2.deferRows(el);
  };
})();
;