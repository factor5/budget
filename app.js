/* Разходи / Expenses: the app's screens and behaviour. */
(function () {
  'use strict';
  const { GoogleBackend, DemoBackend, store } = window.Backend;
  const I = window.I18N; const t = I.t; const Theme = window.Theme;

  /* ---------- helpers ---------- */
  const $ = (sel) => document.querySelector(sel);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    }
    return el;
  }
  function svg(paths, size) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
    s.innerHTML = paths; // static icon markup only, never data
    return s;
  }
  const ICON = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    spark: '<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4"/>',
    wifiOff: '<path d="M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 10.7 5M12 20h.01"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    left: '<path d="M15 18l-6-6 6-6"/>',
    right: '<path d="M9 18l6-6-6-6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
  };

  const MONTHS = new Proxy([], { get: (_, k) => I.months()[k] });
  const MONTHS_SHORT = new Proxy([], { get: (_, k) => I.monthsShort()[k] });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // Bulgarian: 5 834,20 € (like the sheets). English: 5,834.20 €.
  const dec = () => (I.lang === 'en' ? '.' : ',');
  const fmtNum = (n, d) => {
    const [i, f] = Math.abs(n).toFixed(d).split('.');
    const th = I.lang === 'en' ? ',' : ' ';
    return (n < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, th) + (f ? dec() + f : '');
  };
  const showAmt = (a) => a.replace(',', dec());
  const money = (n) => fmtNum(n, 2) + ' €';
  const money0 = (n) => fmtNum(Math.round(n), 0) + ' €';
  const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dayLabel = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const tIso = todayIso();
    const yd = new Date(); yd.setDate(yd.getDate() - 1);
    const yIso = yd.getFullYear() + '-' + String(yd.getMonth() + 1).padStart(2, '0') + '-' + String(yd.getDate()).padStart(2, '0');
    const base = I.lang === 'en' ? MONTHS[m - 1] + ' ' + d : d + ' ' + MONTHS[m - 1];
    if (iso === tIso) return t('today') + ', ' + base;
    if (iso === yIso) return t('yesterday') + ', ' + base;
    return base + (y !== new Date().getFullYear() ? ' ' + y : '');
  };
  const shortDay = (iso) => { const [, m, d] = iso.split('-').map(Number); return (iso === todayIso() ? t('today') + ', ' : '') + (I.lang === 'en' ? MONTHS_SHORT[m - 1] + ' ' + d : d + ' ' + MONTHS_SHORT[m - 1]); };
  const parseAmount = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.')) || 0;
  // Desktop browsers open the calendar only from the small icon; open it on any click.
  const openPicker = (el) => {
    try { if (el.showPicker) { el.showPicker(); return; } } catch (_) {}
    el.focus(); el.click();
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const TONE_KEY = { 'Храна': 'food', 'Дом': 'home', 'Коли': 'cars', 'Семейство': 'family', 'Здраве': 'health', 'Свободно време': 'leisure', 'Други': 'other' };
  const TONE = new Proxy({}, { get: (_, g) => { const k = TONE_KEY[g]; return k ? ['var(--t-' + k + '-bg)', 'var(--t-' + k + ')'] : undefined; } });

  /* ---------- state ---------- */
  const params = new URLSearchParams(location.search);
  const demo = params.has('demo');
  const backend = demo ? new DemoBackend() : new GoogleBackend(window.APP_CONFIG);
  const K = (k) => (demo ? 'demo.' : '') + k;

  const S = {
    view: 'add',
    mode: 'expense',
    amount: '0',
    cat: null,
    car: store.get(K('lastCar'), ''),
    oneOff: false,
    date: todayIso(),
    note: '',
    lists: store.get(K('cache.lists'), null),
    entries: store.get(K('cache.entries'), []),
    queue: store.get(K('queue'), []),
    settings: Object.assign({ quick: true, modes: true, haptics: true }, store.get(K('settings'), {})),
    month: new Date().getMonth() + 1,
    monthData: {},
    monthError: null,
    busy: false,
    editing: null,
    confirmDelete: false,
    installEvent: null,
  };
  const saveQueue = () => store.set(K('queue'), S.queue);

  function groupOf(cat) {
    const c = S.lists && S.lists.cats.find((x) => x.name === cat);
    return c ? c.group : 'Други';
  }
  const isCarCat = (cat) => groupOf(cat) === 'Коли';

  /* ---------- toast ---------- */
  // One message at a time. A message can carry an action button (Undo after saving).
  // opts.background: a message nobody tapped for (e.g. an automatic refresh failing);
  // it never replaces a message that still has its button.
  let toastTimer = null, toastMs = 0, toastAction = null;
  const toastEl = () => $('#toast');
  // On New the message sits above the pinned Save button, never over it.
  function placeToast() { toastEl().classList.toggle('above-save', !!$('#save')); }
  function hideToast() { clearTimeout(toastTimer); toastEl().hidden = true; toastAction = null; }
  function startToastTimer() { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, toastMs); }
  function toast(msg, ms, opts) {
    const el = toastEl();
    if (opts && opts.background && toastAction && !el.hidden) return;
    toastMs = ms || 2600; toastAction = (opts && opts.action) || null;
    const kids = [h('span', { class: 'toast-msg' }, msg)];
    if (toastAction) {
      kids.push(h('button', { type: 'button', class: 'toast-btn', onclick: () => {
        if (!toastAction || toastAction.busy) return;
        toastAction.busy = true; clearTimeout(toastTimer);
        const b = el.querySelector('.toast-btn'); if (b) { b.textContent = toastAction.busyLabel; b.disabled = true; }
        toastAction.run();
      } }, toastAction.label));
    }
    el.replaceChildren(...kids); el.hidden = false; placeToast();
    startToastTimer();
  }
  // Keep the message up while a finger or the keyboard is on it.
  (() => {
    const el = toastEl();
    const pause = () => { if (!el.hidden) clearTimeout(toastTimer); };
    const resume = () => { if (!el.hidden && !(toastAction && toastAction.busy) && !el.contains(document.activeElement)) startToastTimer(); };
    el.addEventListener('pointerdown', pause); el.addEventListener('focusin', pause);
    el.addEventListener('pointerup', resume); el.addEventListener('pointercancel', resume);
    el.addEventListener('focusout', () => setTimeout(resume, 0));
  })();

  /* ---------- sync with the sheet ---------- */
  async function ensureSignedIn() {
    // Call first thing inside a tap handler: the sign-in window needs the tap.
    if (backend.signedIn || !navigator.onLine) return true;
    try { await backend.signIn(); return true; } catch (e) { toast(e.message); return false; }
  }

  async function refresh(opts) {
    if (!backend.hasSheet) return;
    if (!navigator.onLine || !backend.signedIn) { renderSync(); return; }
    try {
      const [lists, entries] = await Promise.all([backend.loadLists(), backend.loadEntries()]);
      S.lists = lists; S.entries = entries; S.monthData = {};
      store.set(K('cache.lists'), lists); store.set(K('cache.entries'), entries);
      S.monthError = null;
      if (!(opts && opts.quiet)) render();
      else { renderSubtitle(); if (S.view === 'recent' && !S.editing) renderMain(); }
      await flush();
    } catch (e) { handleError(e); }
  }

  let flushing = false, flushRun = null;
  // Where each sent entry went, by queue id, so Undo can find the row (this session only).
  const sentRows = {};
  function flush() {
    if (flushRun) return flushRun; // already sending: it sends whatever is queued, including new entries
    if (!S.queue.length || !navigator.onLine || !backend.signedIn) { renderSync(); return Promise.resolve(); }
    flushRun = sendQueue().finally(() => { flushRun = null; });
    return flushRun;
  }
  async function sendQueue() {
    flushing = true; renderSync();
    let sent = 0;
    try {
      while (S.queue.length) {
        const op = S.queue[0];
        const row = await backend.append(op.kind, op.entry);
        sentRows[op.id] = row;
        if (op.kind === 'expense') S.entries.push(Object.assign({ row }, op.entry));
        S.queue.shift(); saveQueue(); sent++;
      }
    } catch (e) { handleError(e, true); }
    flushing = false;
    store.set(K('cache.entries'), S.entries);
    if (sent) reloadEntries();
    S.monthData = {};
    renderSync(); renderSubtitle();
    if (S.view === 'recent' || S.view === 'month') renderMain();
    return sent;
  }

  // Re-read the entries so row numbers match the sheet (others may have added or deleted rows).
  async function reloadEntries() {
    if (demo || !backend.signedIn || !navigator.onLine) return;
    try {
      S.entries = await backend.loadEntries(); store.set(K('cache.entries'), S.entries);
      renderSubtitle(); if (S.view === 'recent' && !S.editing) renderMain();
    } catch (_) { /* next refresh will catch up */ }
  }

  function handleError(e, quiet) {
    if (e && (e.code === 'offline' || e.code === 'needs-sign-in')) { renderSync(); return; }
    if (!quiet || !(e && e.code)) toast((e && e.message) || t('somethingWrong'), 4000, { background: true });
    renderSync();
  }

  /* ---------- header ---------- */
  function monthSpent(m) {
    const y = new Date().getFullYear();
    const pref = y + '-' + String(m).padStart(2, '0');
    const fromSheet = S.entries.filter((e) => e.date.startsWith(pref)).reduce((s, e) => s + e.amount, 0);
    const queued = S.queue.filter((q) => q.kind === 'expense' && q.entry.date.startsWith(pref)).reduce((s, q) => s + q.entry.amount, 0);
    return fromSheet + queued;
  }
  function renderSubtitle() {
    const m = new Date().getMonth() + 1;
    const titles = { add: t(S.mode === 'income' ? 'titleIncome' : S.mode === 'invest' ? 'titleInvest' : 'titleExpense'), recent: t((S.recentMonth || S.recentCat || searchWords().length) ? 'titleEntries' : 'titleRecent'), month: '', settings: t('titleSettings') };
    $('#title').textContent = S.view === 'month' ? cap(MONTHS[S.month - 1]) + ' ' + new Date().getFullYear() : titles[S.view];
    const sub = $('#subtitle');
    if ((S.view === 'add' || S.view === 'recent') && backend.hasSheet) sub.textContent = t('soFar', { month: cap(MONTHS[m - 1]), sum: money0(monthSpent(m)) });
    else if (S.view === 'settings' && backend.hasSheet) sub.textContent = backend.sheetName;
    else sub.textContent = '';
  }
  function renderSync() {
    const b = $('#sync');
    b.replaceChildren(); b.className = 'sync'; b.hidden = false; b.onclick = null;
    if (demo) { b.append(svg(ICON.spark), t('demo')); b.classList.add('off'); return; }
    if (!backend.configured || !backend.hasSheet) { b.hidden = true; return; }
    if (S.queue.length) {
      b.classList.add('warn');
      b.append(svg(ICON.clock), t(S.queue.length === 1 ? 'waiting1' : 'waitingN', { n: S.queue.length }));
      b.onclick = async () => { if (await ensureSignedIn()) { const n = await flush(); if (n) toast(t('sentN', { n })); } };
      return;
    }
    if (!navigator.onLine) { b.classList.add('off'); b.append(svg(ICON.wifiOff), t('offline')); return; }
    if (!backend.signedIn) {
      b.classList.add('off'); b.append(svg(ICON.user), t('signIn'));
      b.onclick = async () => { if (await ensureSignedIn()) refresh(); };
      return;
    }
    b.append(svg(flushing ? ICON.refresh : ICON.check), flushing ? t('sending') : t('synced'));
    b.onclick = () => refresh();
  }

  /* ---------- screens ---------- */
  function render() {
    document.querySelectorAll('.tab').forEach((tb) => {
      if (tb.dataset.view === S.view) tb.setAttribute('aria-current', 'page'); else tb.removeAttribute('aria-current');
      const lbl = tb.querySelector('.tab-label'); if (lbl) lbl.textContent = t({ add: 'tabAdd', recent: 'tabRecent', month: 'tabMonth', settings: 'tabSettings' }[tb.dataset.view]);
    });
    $('.tabs').setAttribute('aria-label', t('mainMenu')); document.title = t('appName');
    renderSubtitle(); renderSync(); renderMain();
  }
  function renderMain() {
    const main = $('#main');
    if (!demo && (!backend.configured || !backend.hasSheet) && S.view !== 'settings') { main.replaceChildren(onboarding()); return; }
    const v = { add: viewAdd, recent: viewRecent, month: viewMonth, settings: viewSettings }[S.view];
    const typing = document.activeElement && document.activeElement.id === 'recent-search' ? document.activeElement : null;
    const caret = typing ? [typing.selectionStart, typing.selectionEnd] : null;
    main.replaceChildren(v());
    if (typing) { const box = $('#recent-search'); if (box) { box.focus(); try { box.setSelectionRange(caret[0], caret[1]); } catch (_) {} } }
    placeToast();
  }

  function onboarding() {
    if (!backend.configured) {
      return h('div', { class: 'scroll' },
        h('section', { class: 'card' },
          h('h2', { text: t('almostReady') }),
          h('p', { class: 'small muted', style: 'margin:0' }, t('notConfigured')),
          h('a', { class: 'btn secondary', href: '?demo=1', style: 'display:flex;align-items:center;justify-content:center;text-decoration:none' }, t('tryDemo')),
        ));
    }
    return h('div', { class: 'scroll' },
      h('section', { class: 'card' },
        h('h2', { text: t('connectSheet') }),
        h('ol', { class: 'steps' },
          h('li', null, t('stepSignIn')),
          h('li', null, t('stepPick'))),
        h('p', { class: 'tiny muted', style: 'margin:0' }, t('onlyPicked')),
        h('button', { class: 'btn', type: 'button', onclick: chooseSheet }, t('signInPick')),
      ));
  }

  async function chooseSheet() {
    if (!navigator.onLine) { toast(t('noInternet')); return; }
    try {
      await backend.preload();
      const s = await backend.pickSheet();
      toast(t('connected', { name: s.name }));
      S.monthData = {};
      await refresh();
      render();
    } catch (e) { if (e.message !== 'cancel') toast(e.message, 4500); }
  }

  /* ----- Нов ----- */
  function currentChoices() {
    if (!S.lists) return [];
    if (S.mode === 'income') return S.lists.incomeSources;
    if (S.mode === 'invest') return S.lists.investTypes;
    return S.lists.cats.map((c) => c.name);
  }
  function quickChoices() {
    const all = currentChoices();
    let pick;
    if (S.mode !== 'expense' || !S.settings.quick) pick = all.slice(0, 7);
    else {
      const since = new Date(); since.setDate(since.getDate() - 90);
      const sinceIso = since.toISOString().slice(0, 10);
      const freq = {};
      S.entries.forEach((e) => { if (e.date >= sinceIso && all.includes(e.cat)) freq[e.cat] = (freq[e.cat] || 0) + 1; });
      pick = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 7);
      for (const c of all) { if (pick.length >= 7) break; if (!pick.includes(c)) pick.push(c); }
    }
    if (S.cat && !pick.includes(S.cat)) pick[pick.length - 1] = S.cat;
    return { pick, more: all.length > pick.length };
  }

  function setMode(m) { S.mode = m; S.cat = null; S.oneOff = false; renderSubtitle(); renderMain(); }

  function pressKey(k) {
    let a = S.amount === '0' ? '' : S.amount;
    if (k === 'del') a = a.slice(0, -1);
    else if (k === ',') { if (!a.includes(',')) a = (a || '0') + ','; }
    else if (!(a.includes(',') && a.split(',')[1].length >= 2) && a.replace(',', '').length < 8) a += k;
    S.amount = a || '0';
    const n = $('#amount-num'); if (n) n.textContent = showAmt(S.amount);
    updateSaveBtn();
  }
  function saveLabel() {
    if (!S.cat) return t('chooseCategory');
    return t('saveBtn', { amount: showAmt(S.amount), cat: S.cat });
  }
  function updateSaveBtn() {
    const b = $('#save'); if (!b) return;
    b.textContent = saveLabel();
    b.disabled = !S.cat || parseAmount(S.amount) <= 0 || S.busy;
  }

  async function save() {
    const amount = parseAmount(S.amount);
    if (!S.cat || amount <= 0) return;
    if (!demo) await ensureSignedIn();
    const entry = { date: S.date, amount, cat: S.cat, note: (S.note || '').trim() };
    if (S.mode === 'expense') {
      entry.car = isCarCat(S.cat) ? S.car : '';
      entry.oneOff = S.oneOff;
      if (entry.car) store.set(K('lastCar'), entry.car);
    }
    const label = money(amount) + ' · ' + S.cat;
    const op = { id: uid(), kind: S.mode, entry };
    S.queue.push(op); saveQueue();
    S.amount = '0'; S.note = ''; S.oneOff = false; S.date = todayIso(); S.cat = null;
    S.busy = true; renderMain(); renderSubtitle();
    await flush();
    S.busy = false; updateSaveBtn();
    const waiting = S.queue.some((q) => q.id === op.id);
    const action = { label: t('undo'), busyLabel: t('undoing'), run: () => undoSave(op, label) };
    toast(t(waiting ? 'savedLocal' : 'saved', { label }), UNDO_MS, { action });
  }

  /* ----- Undo after saving ----- */
  const UNDO_MS = 6000;
  const formEmpty = () => parseAmount(S.amount) <= 0 && !S.cat;
  // Runs straight from the Undo tap, so the Google sign-in window may open.
  async function undoSave(op, label) {
    const inQueue = () => S.queue.some((q) => q.id === op.id);
    try {
      if (!(inQueue() && !flushRun)) {
        // Written, or being written right now: sign in first (needs the tap), then let the send finish.
        if (!demo && !(await ensureSignedIn())) throw new Error('sign-in');
        if (flushRun) await flushRun;
      }
      if (inQueue()) {
        S.queue = S.queue.filter((q) => q.id !== op.id); saveQueue();
      } else {
        const row = sentRows[op.id];
        const r = await backend.remove(row, Object.assign({ row }, op.entry), op.kind);
        if (op.kind === 'expense') {
          const at = typeof r === 'number' && r > 0 ? r : row;
          S.entries = S.entries.filter((x) => x.row !== at).map((x) => (x.row > at ? Object.assign({}, x, { row: x.row - 1 }) : x));
          store.set(K('cache.entries'), S.entries);
          reloadEntries();
        }
      }
    } catch (e) {
      toast(t(op.kind === 'expense' ? 'undoFailedExpense' : op.kind === 'income' ? 'undoFailedIncome' : 'undoFailedInvest'), UNDO_MS);
      renderSync();
      return;
    }
    delete sentRows[op.id];
    S.monthData = {};
    if (formEmpty()) {
      const e = op.entry;
      S.mode = op.kind; S.amount = String(e.amount).replace('.', ','); S.cat = e.cat; S.date = e.date; S.note = e.note || '';
      S.oneOff = !!e.oneOff; if (e.car) S.car = e.car;
    }
    toast(t('undone', { label }));
    renderSync(); renderSubtitle();
    if (S.view !== 'settings' && !S.editing) renderMain();
  }

  function openCategorySheet() {
    const choose = (name) => { S.cat = name; closeSheet(); renderMain(); };
    const body = [h('div', { class: 'grab' }), h('h2', { text: t(S.mode === 'expense' ? 'allCategories' : S.mode === 'income' ? 'source' : 'investType') })];
    if (S.mode === 'expense') {
      const groups = {};
      S.lists.cats.forEach((c) => { (groups[c.group] = groups[c.group] || []).push(c.name); });
      for (const [g, names] of Object.entries(groups)) {
        body.push(h('div', { class: 'group-title', text: I.group(g) }));
        body.push(h('div', { class: 'grid2' }, names.map((n) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.cat === n), onclick: () => choose(n) }, n))));
      }
    } else {
      body.push(h('div', { class: 'grid2' }, currentChoices().map((n) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.cat === n), onclick: () => choose(n) }, n))));
    }
    openSheet(body);
  }

  function viewAdd() {
    if (!S.lists) {
      return h('div', { class: 'empty' }, navigator.onLine ? t('loadingCats') : t('catsNotLoaded'));
    }
    const { pick, more } = quickChoices();
    const kids = [];
    if (S.settings.modes) {
      const segBtn = (m, t) => h('button', { type: 'button', 'aria-pressed': String(S.mode === m), onclick: () => setMode(m) }, t);
      kids.push(h('div', { class: 'seg', role: 'group', 'aria-label': t('entryKind') }, segBtn('expense', t('expense')), segBtn('income', t('income')), segBtn('invest', t('invest'))));
    }
    kids.push(h('section', { class: 'amount', 'aria-label': t('amount') }, h('span', { id: 'amount-num', class: 'num' }, showAmt(S.amount)), h('span', { class: 'cur' }, '€')));
    kids.push(h('section', { class: 'block', 'aria-label': t('category') },
      h('span', { class: 'label', text: t(S.mode === 'expense' ? 'category' : S.mode === 'income' ? 'source' : 'type') }),
      h('div', { class: 'chips' },
        pick.map((c) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.cat === c), title: c, onclick: () => { S.cat = c; renderMain(); } }, c)),
        more ? h('button', { type: 'button', class: 'chip more', onclick: openCategorySheet }, t('more')) : null)));

    const details = h('section', { class: 'block', style: 'padding-top:12px', 'aria-label': t('details') });
    const dateInput = h('input', { type: 'date', value: S.date, max: todayIso(), tabindex: '-1', 'aria-hidden': 'true', onchange: (e) => { S.date = e.target.value || todayIso(); renderMain(); } });
    const datePill = h('div', { class: 'pill', role: 'button', tabindex: '0', 'aria-label': t('date') + ': ' + shortDay(S.date),
      onclick: () => openPicker(dateInput),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openPicker(dateInput); } } },
      svg(ICON.cal), shortDay(S.date), dateInput);
    const row = h('div', { class: 'row' }, datePill);
    if (S.mode === 'expense') {
      row.append(h('button', { type: 'button', class: 'pill oneoff', 'aria-pressed': String(S.oneOff), onclick: () => { S.oneOff = !S.oneOff; renderMain(); } }, svg(ICON.spark), t('oneOff')));
    }
    details.append(row);
    if (S.mode === 'expense' && S.cat && isCarCat(S.cat) && S.lists.cars.length) {
      details.append(h('div', { class: 'row' }, h('span', { class: 'small muted', style: 'width:44px' }, t('car')),
        S.lists.cars.map((c) => h('button', { type: 'button', class: 'carpill', 'aria-pressed': String(S.car === c), onclick: () => { S.car = S.car === c ? '' : c; renderMain(); } }, c))));
    }
    details.append(h('label', null, h('span', { class: 'sr' }, t('note')),
      h('input', { class: 'input', type: 'text', placeholder: t('notePh'), value: S.note, maxlength: '120', oninput: (e) => { S.note = e.target.value; } })));
    kids.push(details);

    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'];
    kids.push(h('section', { class: 'keys', 'aria-label': t('keypad') },
      keys.map((k) => h('button', { type: 'button', class: 'key', 'aria-label': k === 'del' ? t('delDigit') : k === ',' ? t('decimal') : k, onclick: () => pressKey(k) }, k === 'del' ? '⌫' : k === ',' ? dec() : k))));
    const btn = h('button', { id: 'save', type: 'button', class: 'btn', onclick: save }, saveLabel());
    kids.push(h('div', { class: 'save-wrap' }, btn));
    const wrap = h('div', { class: 'add' }, kids);
    setTimeout(updateSaveBtn, 0);
    return wrap;
  }

  /* ----- Последни ----- */
  // Search: words typed in the box, all of which must appear in the note or the car (any order, any case).
  function searchWords() { return (S.recentQuery || '').toLocaleLowerCase().split(/\s+/).filter(Boolean); }
  // Lower-cased note and car per entry, worked out once rather than on every key press.
  const hayOf = new WeakMap();
  function matchesSearch(e, words) {
    let hay = hayOf.get(e);
    if (hay == null) { hay = (e.note || '').toLocaleLowerCase() + '\n' + (e.car || '').toLocaleLowerCase(); hayOf.set(e, hay); }
    return words.every((w) => hay.includes(w));
  }
  // A long result list is drawn 200 at a time: drawing thousands of rows takes too long on a phone.
  const PAGE = 200;
  // Text with every match of the search words in bold.
  function marked(text, words) {
    const low = text.toLocaleLowerCase();
    if (!words.length || low.length !== text.length) return [text];
    const hit = new Array(text.length).fill(false);
    words.forEach((w) => { for (let i = low.indexOf(w); i >= 0; i = low.indexOf(w, i + 1)) hit.fill(true, i, i + w.length); });
    const out = []; let i = 0;
    while (i < text.length) { let j = i; while (j < text.length && hit[j] === hit[i]) j++; out.push(hit[i] ? h('mark', null, text.slice(i, j)) : text.slice(i, j)); i = j; }
    return out;
  }
  function viewRecent() {
    if (!S.recentShown) S.recentShown = PAGE;
    const wrap = h('div', { class: 'scroll' });
    if (S.queue.length) {
      wrap.append(h('div', { class: 'notice' }, svg(ICON.wifiOff, 20),
        h('div', null, h('div', { class: 't' }, t(S.queue.length === 1 ? 'pending1' : 'pendingN', { n: S.queue.length })),
          h('div', { class: 'd' }, t('pendingHint'))),
        navigator.onLine ? h('button', { type: 'button', class: 'btn secondary', style: 'width:auto;padding:0 12px', onclick: async () => { if (await ensureSignedIn()) flush(); } }, t('send')) : null));
    }
    const all = recentAll();
    const { year, lastMonth } = recentYear();
    const rm = S.recentMonth || 0, rc = S.recentCat || '';
    const setMonth = (m) => { S.recentMonth = m; S.recentShown = PAGE; render(); };
    const monthSel = h('select', { class: 'input', 'aria-label': t('month'), onchange: (ev) => setMonth(Number(ev.target.value)) },
      h('option', { value: '0', selected: rm === 0 ? 'selected' : null }, t(searchWords().length ? 'wholeYear' : 'latest')),
      Array.from({ length: lastMonth }, (_, i) => lastMonth - i).map((m) => h('option', { value: String(m), selected: rm === m ? 'selected' : null }, cap(MONTHS[m - 1]))));
    const usedCats = [...new Set(all.map((e) => e.cat).filter(Boolean))];
    const ordered = S.lists.cats.map((c) => c.name).filter((n) => usedCats.includes(n)).concat(usedCats.filter((n) => !S.lists.cats.some((c) => c.name === n)));
    const catSel = h('select', { class: 'input', 'aria-label': t('category'), onchange: (ev) => { S.recentCat = ev.target.value; S.recentShown = PAGE; render(); } },
      h('option', { value: '', selected: rc === '' ? 'selected' : null }, t('allShort')),
      ordered.map((n) => h('option', { value: n, selected: rc === n ? 'selected' : null }, n)));
    const results = h('div', { class: 'results' });
    const clearBtn = h('button', { type: 'button', class: 'search-clear', 'aria-label': t('clearSearch'), hidden: !S.recentQuery || null }, svg(ICON.x));
    const box = h('input', { id: 'recent-search', class: 'input', type: 'search', enterkeyhint: 'search', autocomplete: 'off', spellcheck: 'false',
      placeholder: t('searchPh'), 'aria-label': t('searchPh'), value: S.recentQuery || '' });
    const onQuery = () => {
      S.recentQuery = box.value; S.recentShown = PAGE;
      clearBtn.hidden = !box.value;
      monthSel.options[0].text = t(searchWords().length ? 'wholeYear' : 'latest');
      renderSubtitle();
      fillRecentList(results, all, year, lastMonth);
    };
    box.addEventListener('input', onQuery);
    box.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); box.blur(); } });
    clearBtn.addEventListener('click', () => { box.value = ''; onQuery(); box.focus(); });
    // A finger scrolling the list puts the keyboard away.
    results.addEventListener('touchmove', () => { if (document.activeElement === box) box.blur(); }, { passive: true });
    wrap.append(h('div', { class: 'filters' },
      h('div', { class: 'search' }, svg(ICON.search), box, clearBtn),
      h('div', { class: 'filter-row' },
        monthSel,
        catSel)));
    fillRecentList(results, all, year, lastMonth);
    wrap.append(results, h('p', { class: 'tiny muted', style: 'margin:2px 4px 0' }, t('recentHint')));
    return wrap;
  }
  // Waiting entries first, then the sheet's, newest first.
  function recentAll() {
    return S.queue.filter((q) => q.kind === 'expense').map((q) => Object.assign({ pending: true }, q.entry))
      .concat(S.entries.slice().sort((a, b) => (b.date === a.date ? b.row - a.row : b.date < a.date ? -1 : 1)));
  }
  function recentYear() {
    const year = (S.entries[0] && Number(S.entries[0].date.slice(0, 4))) || new Date().getFullYear();
    return { year, lastMonth: year < new Date().getFullYear() ? 12 : new Date().getMonth() + 1 };
  }
  // The list under the filters. Redrawn on its own while typing, so the search box keeps focus.
  function fillRecentList(box, all, year, lastMonth) {
    const rm = S.recentMonth || 0, rc = S.recentCat || '';
    const words = searchWords();
    const pref = rm ? year + '-' + String(rm).padStart(2, '0') : '';
    let items = all.filter((e) => (!pref || e.date.startsWith(pref)) && (!rc || e.cat === rc) && (!words.length || matchesSearch(e, words)));
    const limited = !rm && !rc && !words.length && items.length > 80;
    if (limited) items = items.slice(0, 80);
    if (!items.length) {
      if (!words.length) { box.replaceChildren(h('div', { class: 'empty' }, all.length ? t('noMatch') : t('noEntries'))); return; }
      box.replaceChildren(h('div', { class: 'empty' }, h('p', { style: 'margin:0' }, t('noSearchMatch', { q: S.recentQuery.trim() })),
        rm || rc ? h('button', { type: 'button', class: 'btn secondary', style: 'margin-top:12px', onclick: () => { S.recentMonth = 0; S.recentCat = ''; S.recentShown = PAGE; render(); } }, t('searchWholeYear')) : null));
      return;
    }
    const out = [];
    if (rm || rc || words.length) {
      const sum = items.reduce((s, e) => s + e.amount, 0);
      out.push(h('div', { class: 'summary' }, h('span', null, t(items.length === 1 ? 'count1' : 'countN', { n: items.length })), h('b', null, money(sum))));
    }
    // Cut after S.recentShown entries, but finish the day so its total is right.
    const count = items.length;
    let cut = Math.min(count, S.recentShown);
    while (cut < count && items[cut].date === items[cut - 1].date) cut++;
    items = items.slice(0, cut);
    const byDay = [];
    items.forEach((e) => { const last = byDay[byDay.length - 1]; if (last && last.date === e.date) last.items.push(e); else byDay.push({ date: e.date, items: [e] }); });
    const open = (e) => { if (document.activeElement && document.activeElement.id === 'recent-search') document.activeElement.blur(); openEdit(e); };
    byDay.forEach((d) => {
      const total = d.items.reduce((s, e) => s + e.amount, 0);
      out.push(h('section', { style: 'display:flex;flex-direction:column;gap:6px' },
        h('div', { class: 'day-head' }, h('span', null, dayLabel(d.date)), h('span', null, money(total))),
        h('ul', { class: 'list' }, d.items.map((e) => {
          const g = groupOf(e.cat); const tone = TONE[g] || TONE['Други'];
          const parts = [e.car ? marked(e.car, words) : null, e.oneOff ? t('oneOffLower') : '', e.note ? marked(e.note, words) : null, e.pending ? t('waitingConn') : ''].filter((p) => p && p.length);
          const sub = parts.length ? parts.flatMap((p, i) => (i ? [' · '].concat(p) : [].concat(p))) : [t('noNote')];
          return h('li', null, h('button', { type: 'button', class: 'item', disabled: e.pending || null, onclick: e.pending ? null : () => open(e) },
            h('span', { class: 'badge', 'aria-hidden': 'true', style: 'background:' + tone[0] + ';color:' + tone[1] }, (e.cat || '?').charAt(0).toUpperCase()),
            h('span', { class: 'mid' }, h('span', { class: 'cat' }, e.cat), h('span', { class: 'sub' }, sub)),
            h('span', { class: 'amt' }, money(e.amount))));
        }))));
    });
    if (count > cut) {
      out.push(h('button', { type: 'button', class: 'btn secondary', onclick: () => { S.recentShown = cut + PAGE; fillRecentList(box, all, year, lastMonth); } }, t('showMore', { n: Math.min(PAGE, count - cut), left: count - cut })));
    }
    if (limited) out.push(h('button', { type: 'button', class: 'btn secondary', onclick: () => { S.recentMonth = lastMonth; S.recentShown = PAGE; render(); } }, t('olderPick')));
    box.replaceChildren(...out);
  }

  function openEdit(e) {
    S.editing = Object.assign({}, e); S.editingOrig = Object.assign({}, e); S.confirmDelete = false;
    renderEdit();
  }
  function renderEdit() {
    const e = S.editing;
    const catSel = h('select', { class: 'input', 'aria-label': t('category'), onchange: (ev) => { e.cat = ev.target.value; if (!isCarCat(e.cat)) e.car = ''; renderEdit(); } },
      S.lists.cats.map((c) => h('option', { value: c.name, selected: c.name === e.cat ? 'selected' : null }, c.name)));
    const body = [
      h('div', { class: 'grab' }),
      h('h2', { text: t('editEntry') }),
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, t('amountEur'), h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: Number(e.amount).toFixed(2).replace('.', dec()), oninput: (ev) => { e.amount = parseAmount(ev.target.value); } })),
        h('label', { class: 'field' }, t('date'), h('input', { class: 'input', type: 'date', value: e.date, onchange: (ev) => { e.date = ev.target.value || e.date; }, onclick: (ev) => openPicker(ev.target) }))),
      h('label', { class: 'field' }, t('category'), catSel),
    ];
    if (isCarCat(e.cat)) {
      body.push(h('label', { class: 'field' }, t('car'), h('select', { class: 'input', onchange: (ev) => { e.car = ev.target.value; } },
        h('option', { value: '' }, '—'), S.lists.cars.map((c) => h('option', { value: c, selected: c === e.car ? 'selected' : null }, c)))));
    }
    body.push(
      h('label', { class: 'setting', style: 'padding:4px 0;border:0' }, h('span', { class: 'mid' }, h('span', { class: 't' }, t('oneOff'))),
        h('input', { type: 'checkbox', checked: e.oneOff, onchange: (ev) => { e.oneOff = ev.target.checked; } })),
      h('label', { class: 'field' }, t('note'), h('input', { class: 'input', type: 'text', value: e.note, maxlength: '120', oninput: (ev) => { e.note = ev.target.value; } })),
      h('button', { type: 'button', class: 'btn', onclick: saveEdit }, t('saveChanges')),
      h('div', { class: 'grid2' },
        h('button', { type: 'button', class: 'btn secondary', onclick: closeSheet }, t('cancel')),
        h('button', { type: 'button', class: 'btn danger', onclick: deleteEdit }, S.confirmDelete ? t('sure') : t('del'))));
    if (!navigator.onLine) body.push(h('p', { class: 'tiny muted', style: 'margin:0' }, t('needsInternet')));
    openSheet(body);
  }
  async function saveEdit() {
    const e = S.editing;
    if (!(e.amount > 0)) { toast(t('enterAmount')); return; }
    if (!demo && !(await ensureSignedIn())) return;
    try {
      await backend.update(e.row, { date: e.date, amount: e.amount, cat: e.cat, car: e.car, oneOff: e.oneOff, note: e.note }, S.editingOrig);
      const i = S.entries.findIndex((x) => x.row === e.row); if (i >= 0) S.entries[i] = Object.assign({}, e);
      store.set(K('cache.entries'), S.entries); S.monthData = {};
      closeSheet(); toast(t('changed')); render(); reloadEntries();
    } catch (err) { toast(err.code === 'offline' ? t('noInternet') : err.message, 4000); if (err.code === 'moved') { closeSheet(); reloadEntries(); } }
  }
  async function deleteEdit() {
    if (!S.confirmDelete) { S.confirmDelete = true; renderEdit(); return; }
    if (!demo && !(await ensureSignedIn())) return;
    const row = S.editing.row;
    try {
      await backend.remove(row, S.editingOrig);
      S.entries = S.entries.filter((x) => x.row !== row).map((x) => (x.row > row ? Object.assign({}, x, { row: x.row - 1 }) : x));
      store.set(K('cache.entries'), S.entries); S.monthData = {};
      closeSheet(); toast(t('deleted')); render(); reloadEntries();
    } catch (err) { toast(err.code === 'offline' ? t('noInternet') : err.message, 4000); if (err.code === 'moved') { closeSheet(); reloadEntries(); } }
  }

  /* ----- Месец ----- */
  function viewMonth() {
    const wrap = h('div', { class: 'scroll' });
    const nav = h('div', { class: 'month-nav', style: 'justify-content:space-between' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('prevMonth'), disabled: S.month <= 1 || null, onclick: () => { S.month--; S.monthError = null; render(); } }, svg(ICON.left)),
      h('span', { class: 'small muted' }, S.month === new Date().getMonth() + 1 ? t('toDate') : t('wholeMonth')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('nextMonth'), disabled: S.month >= 12 || null, onclick: () => { S.month++; S.monthError = null; render(); } }, svg(ICON.right)));
    wrap.append(nav);
    const d = S.monthData[S.month];
    if (!d) {
      wrap.append(h('div', { class: 'empty' }, S.monthError || (navigator.onLine ? t('loading') : t('monthNeedsNet'))));
      // After a failure, wait for the person (or reconnecting / signing in) instead of asking Google again at once.
      if (S.monthError) wrap.append(h('button', { type: 'button', class: 'btn secondary', onclick: () => { S.monthError = null; renderMain(); } }, t('tryAgain')));
      else loadMonth();
      return wrap;
    }
    // Month statement: income, minus spending (regular / one-off), what's left.
    const line = (label, v, cls, extra) => h('div', { class: 'st-row' + (extra ? ' ' + extra : '') }, h('span', null, label), h('span', { class: cls || '' }, v));
    const keptPct = d.income > 0 ? Math.round(d.left / d.income * 100) : null;
    const foot = [keptPct != null ? t('keptPct', { p: keptPct }) : '', d.invested ? t('investedN', { sum: money0(d.invested) }) : ''].filter(Boolean).join(' · ');
    wrap.append(h('section', { class: 'card statement', 'aria-label': t('statement') },
      line(t('incomeL'), '+' + money0(d.income), 'pos'),
      line(t('spendL'), '−' + money0(d.spend).replace('−', ''), 'neg'),
      line(t('regular'), money0(d.regular), '', 'sub'),
      line(t('oneOffs'), money0(d.oneOff), d.oneOff ? 'warn' : '', 'sub'),
      h('div', { class: 'st-rule' }),
      h('div', { class: 'st-row total' }, h('span', null, t('left')), h('span', { class: d.left < 0 ? 'neg' : 'pos' }, money0(d.left))),
      foot ? h('div', { class: 'small muted' }, foot) : null));
    const max = Math.max(1, ...d.groups.map((g) => Math.max(g.amount, g.avg)));
    const groups = d.groups.slice().sort((a, b) => b.amount - a.amount);
    wrap.append(h('section', { class: 'card' },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline' }, h('h2', { text: t('byGroup') }),
        h('span', { class: 'tiny muted', style: 'display:flex;align-items:center;gap:6px' }, h('span', { 'aria-hidden': 'true', style: 'width:2px;height:12px;background:var(--ink)' }), t('avgMonth'))),
      groups.map((g) => h('div', { class: 'bar-row' },
        h('div', { class: 'bar-top' }, h('span', { style: 'font-weight:500' }, I.group(g.name)),
          h('span', null, h('b', { style: 'font-weight:600' }, money0(g.amount)), h('span', { class: 'muted' }, ' / ' + money0(g.avg)))),
        h('div', { class: 'bar', role: 'img', 'aria-label': I.group(g.name) + ': ' + money0(g.amount) + ', ' + t('avg') + ' ' + money0(g.avg) },
          h('div', { class: 'fill' + (g.amount > g.avg ? ' over' : ''), style: 'width:' + Math.max(g.amount > 0 ? 1.5 : 0, g.amount / max * 100).toFixed(1) + '%' }),
          h('div', { class: 'mark', style: 'left:' + Math.min(99.5, g.avg / max * 100).toFixed(1) + '%' }))))));
    wrap.append(h('p', { class: 'tiny muted', style: 'margin:0 4px' }, t('fromBalance')));
    return wrap;
  }
  let monthLoading = null;
  async function loadMonth() {
    const m = S.month;
    if (monthLoading === m || !navigator.onLine || !backend.signedIn) return;
    monthLoading = m; S.monthError = null;
    try { S.monthData[m] = await backend.loadMonth(m); }
    catch (e) { S.monthError = e.code === 'needs-sign-in' ? t('tapSignIn') : e.code === 'offline' ? t('noInternet') : e.message; renderSync(); }
    monthLoading = null;
    if (S.view === 'month' && S.month === m) renderMain();
  }

  /* ----- Настройки ----- */
  function viewSettings() {
    const wrap = h('div', { class: 'scroll' });
    if (!demo && !backend.configured) { wrap.append(onboarding()); return wrap; }
    const year = new Date().getFullYear();

    const langBtn = (l, label) => h('button', { type: 'button', 'aria-pressed': String(I.lang === l), lang: l,
      onclick: () => { if (I.lang !== l) { I.setLang(l); render(); } } }, label);
    const themeBtn = (v, label) => h('button', { type: 'button', 'aria-pressed': String(Theme.get() === v), onclick: () => { Theme.set(v); renderMain(); } }, label);
    wrap.append(h('section', { class: 'card' }, h('span', { class: 'label', text: t('theme') }),
      h('div', { class: 'seg', role: 'group', 'aria-label': t('theme') }, themeBtn('auto', t('themeAuto')), themeBtn('light', t('themeLight')), themeBtn('dark', t('themeDark'))),
      h('p', { class: 'tiny muted', style: 'margin:0' }, t('themeHint'))));
    wrap.append(h('section', { class: 'card' }, h('span', { class: 'label', text: t('language') }),
      h('div', { class: 'seg', role: 'group', 'aria-label': t('language') }, langBtn('bg', 'Български'), langBtn('en', 'English')),
      h('p', { class: 'tiny muted', style: 'margin:0' }, t('dataNote'))));

    const sheetCard = h('section', { class: 'card' }, h('span', { class: 'label', text: t('sheet') }));
    if (backend.hasSheet) {
      sheetCard.append(h('div', null, h('div', { style: 'font-size:15px;font-weight:600' }, backend.sheetName),
        h('div', { class: 'tiny muted' }, t('writesTo'))));
    } else {
      sheetCard.append(h('p', { class: 'small muted', style: 'margin:0' }, t('noSheet')));
    }
    if (!demo) {
      sheetCard.append(h('button', { type: 'button', class: 'btn secondary', onclick: chooseSheet }, backend.hasSheet ? t('changeSheet') : t('signInPick')));
      sheetCard.append(h('button', { type: 'button', class: 'btn secondary', onclick: async () => {
        const y = backend.sheetName.includes(String(year)) ? year + 1 : year;
        try { await backend.preload(); const s = await backend.createYear(y); toast(t('created', { name: s.name }), 3500); await refresh(); render(); }
        catch (e) { if (e.message !== 'cancel') toast(e.message, 4500); }
      } }, t('newYear')));
      sheetCard.append(h('p', { class: 'tiny muted', style: 'margin:0' }, t('newYearHint', { year: backend.sheetName.includes(String(year)) ? year + 1 : year })));
    } else {
      sheetCard.append(h('a', { class: 'btn secondary', href: './', style: 'display:flex;align-items:center;justify-content:center;text-decoration:none' }, t('exitDemo')));
    }
    wrap.append(sheetCard);

    const toggle = (key, title, desc) => h('label', { class: 'setting' },
      h('span', { class: 'mid' }, h('span', { class: 't' }, title), h('span', { class: 'tiny muted' }, desc)),
      h('input', { type: 'checkbox', checked: S.settings[key], onchange: (e) => { S.settings[key] = e.target.checked; store.set(K('settings'), S.settings); if (key === 'modes' && !e.target.checked) S.mode = 'expense'; } }));
    wrap.append(h('section', { class: 'card', style: 'padding:4px 16px' },
      h('div', { class: 'setting' },
        h('span', { class: 'mid' }, h('span', { class: 't' }, t('categories')), h('span', { class: 'tiny muted' }, t('catsFrom', { n: S.lists ? S.lists.cats.length : 0 }))),
        h('button', { type: 'button', class: 'btn secondary', style: 'width:auto;height:36px;padding:0 12px', onclick: async () => { if (demo || (await ensureSignedIn())) { await refresh(); toast(t('refreshed')); } } }, t('refresh'))),
      toggle('quick', t('quickT'), t('quickD')),
      toggle('modes', t('modesT'), t('modesD')),
      haptics.supported ? toggle('haptics', t('hapticsT'), t('hapticsD')) : null));

    wrap.append(h('section', { class: 'card' }, h('span', { class: 'label', text: t('security') }),
      h('div', { class: 'row', style: 'flex-wrap:nowrap;align-items:flex-start' }, svg(ICON.lock, 18), h('span', { class: 'small', style: 'color:var(--ink-2)' }, t('secGoogle'))),
      h('div', { class: 'row', style: 'flex-wrap:nowrap;align-items:flex-start' }, svg(ICON.refresh, 18), h('span', { class: 'small', style: 'color:var(--ink-2)' }, t('secOffline'))),
      !demo && backend.hasSheet ? h('button', { type: 'button', class: 'btn danger', onclick: () => { backend.signOut(); S.entries = []; S.lists = null; store.del(K('cache.entries')); store.del(K('cache.lists')); render(); toast(t('signedOut')); } }, t('signOut')) : null));

    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    if (!standalone) {
      wrap.append(h('section', { class: 'card' }, h('span', { class: 'label', text: t('install') }),
        S.installEvent
          ? h('button', { type: 'button', class: 'btn', onclick: async () => { S.installEvent.prompt(); await S.installEvent.userChoice; S.installEvent = null; renderMain(); } }, t('installBtn'))
          : h('p', { class: 'small', style: 'margin:0;color:var(--ink-2)' }, t('installHint'))));
    }
    return wrap;
  }

  /* ---------- bottom sheet ---------- */
  function openSheet(children) {
    const sh = $('#sheet');
    sh.replaceChildren(...children); sh.hidden = false; $('#sheet-backdrop').hidden = false;
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true; S.editing = null; S.editingOrig = null; S.confirmDelete = false; }
  $('#sheet-backdrop').addEventListener('click', closeSheet);

  /* ---------- wiring ---------- */
  document.querySelectorAll('.tab').forEach((tb) => tb.addEventListener('click', () => {
    S.view = tb.dataset.view;
    if (S.view === 'month') S.monthError = null;
    closeSheet(); render(); window.scrollTo(0, 0);
  }));
  window.addEventListener('online', () => { renderSync(); flush(); S.monthError = null; if (S.view === 'month') renderMain(); });
  window.addEventListener('offline', renderSync);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvent = e; if (S.view === 'settings') renderMain(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderSync(); refresh({ quiet: true }); } });
  /* ---------- tap feedback (a short vibration on every button) ---------- */
  // Android: the Vibration API. iPhone (iOS 18+) has no Vibration API, but Safari gives a light
  // tick when a switch-style checkbox is toggled, so a hidden one is clicked instead.
  const haptics = (() => {
    const vibrate = typeof navigator.vibrate === 'function';
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    function iosTick() {
      const label = document.createElement('label'); label.setAttribute('aria-hidden', 'true'); label.style.display = 'none';
      const input = document.createElement('input'); input.type = 'checkbox'; input.setAttribute('switch', '');
      label.appendChild(input); document.head.appendChild(label);
      try { label.click(); } finally { label.remove(); }
    }
    return {
      supported: touch && (vibrate || ios),
      tap() {
        if (!S.settings.haptics) return;
        try { if (vibrate) navigator.vibrate(10); else if (ios) iosTick(); } catch (_) {}
      },
    };
  })();
  const TAPPABLE = 'button, [role="button"], a.btn, input[type="checkbox"], input[type="radio"]';
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element && e.target.closest(TAPPABLE);
    if (el && !el.disabled && !el.closest('head')) haptics.tap();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (S.view !== 'add' || !$('#sheet').hidden) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (/^[0-9]$/.test(e.key)) pressKey(e.key);
    else if (e.key === ',' || e.key === '.') pressKey(',');
    else if (e.key === 'Backspace') pressKey('del');
    else if (e.key === 'Enter') { const b = $('#save'); if (b && !b.disabled) save(); }
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  render();
  backend.preload().then(() => { renderSync(); }).catch(() => {});
  if (backend.hasSheet) refresh();
})();
