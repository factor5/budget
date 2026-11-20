/* Разходи: the app's screens and behaviour. */
(function () {
  'use strict';
  const { GoogleBackend, DemoBackend, store } = window.Backend;

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
  };

  const MONTHS = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
  const MONTHS_SHORT = ['яну', 'фев', 'мар', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // Same look as the sheets: 5 834,20 € (space between thousands, decimal comma).
  const fmtNum = (n, dec) => {
    const [i, f] = Math.abs(n).toFixed(dec).split('.');
    return (n < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f ? ',' + f : '');
  };
  const money = (n) => fmtNum(n, 2) + ' €';
  const money0 = (n) => fmtNum(Math.round(n), 0) + ' €';
  const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dayLabel = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const t = todayIso();
    const yd = new Date(); yd.setDate(yd.getDate() - 1);
    const yIso = yd.getFullYear() + '-' + String(yd.getMonth() + 1).padStart(2, '0') + '-' + String(yd.getDate()).padStart(2, '0');
    const base = d + ' ' + MONTHS[m - 1];
    if (iso === t) return 'Днес, ' + base;
    if (iso === yIso) return 'Вчера, ' + base;
    return base + (y !== new Date().getFullYear() ? ' ' + y : '');
  };
  const shortDay = (iso) => { const [, m, d] = iso.split('-').map(Number); return (iso === todayIso() ? 'Днес, ' : '') + d + ' ' + MONTHS_SHORT[m - 1]; };
  const parseAmount = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.')) || 0;
  // Desktop browsers open the calendar only from the small icon; open it on any click.
  const openPicker = (el) => {
    try { if (el.showPicker) { el.showPicker(); return; } } catch (_) {}
    el.focus(); el.click();
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const TONE = {
    'Храна': ['#FDECD8', '#7A3B05'], 'Дом': ['#E2ECFB', '#1D4E9E'], 'Коли': ['#E3F1EC', '#0B4D3E'], 'Семейство': ['#EFE7FB', '#5B2E9E'],
    'Здраве': ['#FBE3E8', '#8E1F3A'], 'Свободно време': ['#FFF4C7', '#6B5200'], 'Други': ['#ECEDF0', '#3D4552'],
  };

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
    settings: Object.assign({ quick: true, modes: true }, store.get(K('settings'), {})),
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
  let toastTimer = null;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }

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
      if (!(opts && opts.quiet)) render();
      else renderSubtitle();
      await flush();
    } catch (e) { handleError(e); }
  }

  let flushing = false;
  async function flush() {
    if (flushing || !S.queue.length) { renderSync(); return; }
    if (!navigator.onLine || !backend.signedIn) { renderSync(); return; }
    flushing = true; renderSync();
    let sent = 0;
    try {
      while (S.queue.length) {
        const op = S.queue[0];
        const row = await backend.append(op.kind, op.entry);
        if (op.kind === 'expense') S.entries.push(Object.assign({ row }, op.entry));
        S.queue.shift(); saveQueue(); sent++;
      }
    } catch (e) { handleError(e, true); }
    flushing = false;
    store.set(K('cache.entries'), S.entries);
    S.monthData = {};
    renderSync(); renderSubtitle();
    if (S.view === 'recent' || S.view === 'month') renderMain();
    return sent;
  }

  function handleError(e, quiet) {
    if (e && (e.code === 'offline' || e.code === 'needs-sign-in')) { renderSync(); return; }
    if (!quiet || !(e && e.code)) toast((e && e.message) || 'Нещо се обърка.', 4000);
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
    const titles = { add: S.mode === 'income' ? 'Нов приход' : S.mode === 'invest' ? 'Нова вноска' : 'Нов разход', recent: (S.recentMonth || S.recentCat) ? 'Записи' : 'Последни записи', month: '', settings: 'Настройки' };
    $('#title').textContent = S.view === 'month' ? cap(MONTHS[S.month - 1]) + ' ' + new Date().getFullYear() : titles[S.view];
    const sub = $('#subtitle');
    if ((S.view === 'add' || S.view === 'recent') && backend.hasSheet) sub.textContent = cap(MONTHS[m - 1]) + ' до момента: ' + money0(monthSpent(m));
    else if (S.view === 'settings' && backend.hasSheet) sub.textContent = backend.sheetName;
    else sub.textContent = '';
  }
  function renderSync() {
    const b = $('#sync');
    b.replaceChildren(); b.className = 'sync'; b.hidden = false; b.onclick = null;
    if (demo) { b.append(svg(ICON.spark), 'Демо'); b.classList.add('off'); return; }
    if (!backend.configured || !backend.hasSheet) { b.hidden = true; return; }
    if (S.queue.length) {
      b.classList.add('warn');
      b.append(svg(ICON.clock), S.queue.length + (S.queue.length === 1 ? ' чака' : ' чакат'));
      b.onclick = async () => { if (await ensureSignedIn()) { const n = await flush(); if (n) toast('Изпратени: ' + n); } };
      return;
    }
    if (!navigator.onLine) { b.classList.add('off'); b.append(svg(ICON.wifiOff), 'Офлайн'); return; }
    if (!backend.signedIn) {
      b.classList.add('off'); b.append(svg(ICON.user), 'Влез');
      b.onclick = async () => { if (await ensureSignedIn()) refresh(); };
      return;
    }
    b.append(svg(flushing ? ICON.refresh : ICON.check), flushing ? 'Изпращане…' : 'Синхронизирано');
    b.onclick = () => refresh();
  }

  /* ---------- screens ---------- */
  function render() {
    document.querySelectorAll('.tab').forEach((t) => {
      if (t.dataset.view === S.view) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    renderSubtitle(); renderSync(); renderMain();
  }
  function renderMain() {
    const main = $('#main');
    if (!demo && (!backend.configured || !backend.hasSheet) && S.view !== 'settings') { main.replaceChildren(onboarding()); return; }
    const v = { add: viewAdd, recent: viewRecent, month: viewMonth, settings: viewSettings }[S.view];
    main.replaceChildren(v());
  }

  function onboarding() {
    if (!backend.configured) {
      return h('div', { class: 'scroll' },
        h('section', { class: 'card' },
          h('h2', { text: 'Почти готово' }),
          h('p', { class: 'small muted', style: 'margin:0' }, 'Приложението още не е свързано с Google. Попълнете файла config.js, както е описано в README (стъпка 3).'),
          h('a', { class: 'btn secondary', href: '?demo=1', style: 'display:flex;align-items:center;justify-content:center;text-decoration:none' }, 'Пробвайте демото'),
        ));
    }
    return h('div', { class: 'scroll' },
      h('section', { class: 'card' },
        h('h2', { text: 'Свържете таблицата' }),
        h('ol', { class: 'steps' },
          h('li', null, 'Влезте с Google акаунта си.'),
          h('li', null, 'Изберете таблицата за годината, например „budget 2026 (new format)“.')),
        h('p', { class: 'tiny muted', style: 'margin:0' }, 'Приложението вижда само файловете, които изберете тук.'),
        h('button', { class: 'btn', type: 'button', onclick: chooseSheet }, 'Влез и избери таблица'),
      ));
  }

  async function chooseSheet() {
    if (!navigator.onLine) { toast('Няма интернет.'); return; }
    try {
      await backend.preload();
      const s = await backend.pickSheet();
      toast('Свързано: ' + s.name);
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
    const n = $('#amount-num'); if (n) n.textContent = S.amount;
    updateSaveBtn();
  }
  function saveLabel() {
    if (!S.cat) return 'Изберете категория';
    return 'Запиши ' + S.amount + ' € · ' + S.cat;
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
    S.queue.push({ id: uid(), kind: S.mode, entry }); saveQueue();
    S.amount = '0'; S.note = ''; S.oneOff = false; S.date = todayIso(); S.cat = null;
    S.busy = true; renderMain(); renderSubtitle();
    const before = S.queue.length;
    await flush();
    S.busy = false; updateSaveBtn();
    if (S.queue.length < before) toast('Записано: ' + label);
    else toast('Запазено на телефона: ' + label + '. Ще се изпрати при връзка.', 3500);
  }

  function openCategorySheet() {
    const choose = (name) => { S.cat = name; closeSheet(); renderMain(); };
    const body = [h('div', { class: 'grab' }), h('h2', { text: S.mode === 'expense' ? 'Всички категории' : S.mode === 'income' ? 'Източник' : 'Тип вноска' })];
    if (S.mode === 'expense') {
      const groups = {};
      S.lists.cats.forEach((c) => { (groups[c.group] = groups[c.group] || []).push(c.name); });
      for (const [g, names] of Object.entries(groups)) {
        body.push(h('div', { class: 'group-title', text: g }));
        body.push(h('div', { class: 'grid2' }, names.map((n) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.cat === n), onclick: () => choose(n) }, n))));
      }
    } else {
      body.push(h('div', { class: 'grid2' }, currentChoices().map((n) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.cat === n), onclick: () => choose(n) }, n))));
    }
    openSheet(body);
  }

  function viewAdd() {
    if (!S.lists) {
      return h('div', { class: 'empty' }, navigator.onLine ? 'Зареждане на категориите…' : 'Категориите още не са заредени. Свържете се с интернет веднъж.');
    }
    const { pick, more } = quickChoices();
    const kids = [];
    if (S.settings.modes) {
      const segBtn = (m, t) => h('button', { type: 'button', 'aria-pressed': String(S.mode === m), onclick: () => setMode(m) }, t);
      kids.push(h('div', { class: 'seg', role: 'group', 'aria-label': 'Вид запис' }, segBtn('expense', 'Разход'), segBtn('income', 'Приход'), segBtn('invest', 'Вноска')));
    }
    kids.push(h('section', { class: 'amount', 'aria-label': 'Сума' }, h('span', { id: 'amount-num', class: 'num' }, S.amount), h('span', { class: 'cur' }, '€')));
    kids.push(h('section', { class: 'block', 'aria-label': 'Категория' },
      h('span', { class: 'label', text: S.mode === 'expense' ? 'Категория' : S.mode === 'income' ? 'Източник' : 'Тип' }),
      h('div', { class: 'chips' },
        pick.map((c) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.cat === c), title: c, onclick: () => { S.cat = c; renderMain(); } }, c)),
        more ? h('button', { type: 'button', class: 'chip more', onclick: openCategorySheet }, 'Още…') : null)));

    const details = h('section', { class: 'block', style: 'padding-top:12px', 'aria-label': 'Подробности' });
    const dateInput = h('input', { type: 'date', value: S.date, max: todayIso(), tabindex: '-1', 'aria-hidden': 'true', onchange: (e) => { S.date = e.target.value || todayIso(); renderMain(); } });
    const datePill = h('div', { class: 'pill', role: 'button', tabindex: '0', 'aria-label': 'Дата: ' + shortDay(S.date),
      onclick: () => openPicker(dateInput),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openPicker(dateInput); } } },
      svg(ICON.cal), shortDay(S.date), dateInput);
    const row = h('div', { class: 'row' }, datePill);
    if (S.mode === 'expense') {
      row.append(h('button', { type: 'button', class: 'pill oneoff', 'aria-pressed': String(S.oneOff), onclick: () => { S.oneOff = !S.oneOff; renderMain(); } }, svg(ICON.spark), 'Еднократен'));
    }
    details.append(row);
    if (S.mode === 'expense' && S.cat && isCarCat(S.cat) && S.lists.cars.length) {
      details.append(h('div', { class: 'row' }, h('span', { class: 'small muted', style: 'width:44px' }, 'Кола'),
        S.lists.cars.map((c) => h('button', { type: 'button', class: 'carpill', 'aria-pressed': String(S.car === c), onclick: () => { S.car = S.car === c ? '' : c; renderMain(); } }, c))));
    }
    details.append(h('label', null, h('span', { class: 'sr' }, 'Бележка'),
      h('input', { class: 'input', type: 'text', placeholder: 'Бележка (по желание)', value: S.note, maxlength: '120', oninput: (e) => { S.note = e.target.value; } })));
    kids.push(details);

    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'];
    kids.push(h('section', { class: 'keys', 'aria-label': 'Клавиатура' },
      keys.map((k) => h('button', { type: 'button', class: 'key', 'aria-label': k === 'del' ? 'Изтрий цифра' : k === ',' ? 'Запетая' : k, onclick: () => pressKey(k) }, k === 'del' ? '⌫' : k))));
    const btn = h('button', { id: 'save', type: 'button', class: 'btn', onclick: save }, saveLabel());
    kids.push(h('div', { class: 'save-wrap' }, btn));
    const wrap = h('div', null, kids);
    setTimeout(updateSaveBtn, 0);
    return wrap;
  }

  /* ----- Последни ----- */
  function viewRecent() {
    const wrap = h('div', { class: 'scroll' });
    const pending = S.queue.filter((q) => q.kind === 'expense');
    if (S.queue.length) {
      wrap.append(h('div', { class: 'notice' }, svg(ICON.wifiOff, 20),
        h('div', null, h('div', { class: 't' }, S.queue.length + (S.queue.length === 1 ? ' запис чака изпращане' : ' записа чакат изпращане')),
          h('div', { class: 'd' }, 'Изпращат се сами, щом има връзка.')),
        navigator.onLine ? h('button', { type: 'button', class: 'btn secondary', style: 'width:auto;padding:0 12px', onclick: async () => { if (await ensureSignedIn()) flush(); } }, 'Изпрати') : null));
    }
    // Filters: month (0 = latest entries) and category ('' = all).
    const all = pending.map((q) => Object.assign({ pending: true }, q.entry))
      .concat(S.entries.slice().sort((a, b) => (b.date === a.date ? b.row - a.row : b.date < a.date ? -1 : 1)));
    const year = (S.entries[0] && Number(S.entries[0].date.slice(0, 4))) || new Date().getFullYear();
    const lastMonth = year < new Date().getFullYear() ? 12 : new Date().getMonth() + 1;
    const rm = S.recentMonth || 0, rc = S.recentCat || '';
    const setMonth = (m) => { S.recentMonth = m; render(); };
    const monthSel = h('select', { class: 'input', 'aria-label': 'Месец', onchange: (ev) => setMonth(Number(ev.target.value)) },
      h('option', { value: '0', selected: rm === 0 ? 'selected' : null }, 'Последни'),
      Array.from({ length: lastMonth }, (_, i) => lastMonth - i).map((m) => h('option', { value: String(m), selected: rm === m ? 'selected' : null }, cap(MONTHS[m - 1]) + ' ' + year)));
    const usedCats = [...new Set(all.map((e) => e.cat).filter(Boolean))];
    const ordered = S.lists.cats.map((c) => c.name).filter((n) => usedCats.includes(n)).concat(usedCats.filter((n) => !S.lists.cats.some((c) => c.name === n)));
    const catSel = h('select', { class: 'input', 'aria-label': 'Категория', onchange: (ev) => { S.recentCat = ev.target.value; render(); } },
      h('option', { value: '', selected: rc === '' ? 'selected' : null }, 'Всички категории'),
      ordered.map((n) => h('option', { value: n, selected: rc === n ? 'selected' : null }, n)));
    wrap.append(h('div', { class: 'filters' },
      h('div', { class: 'month-nav' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'По-стар месец', disabled: rm === 1 || null, onclick: () => setMonth(rm === 0 ? lastMonth : rm - 1) }, svg(ICON.left)),
        monthSel,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'По-нов месец', disabled: rm === 0 || null, onclick: () => setMonth(rm >= lastMonth ? 0 : rm + 1) }, svg(ICON.right))),
      catSel));
    const pref = rm ? year + '-' + String(rm).padStart(2, '0') : '';
    let items = all.filter((e) => (!pref || e.date.startsWith(pref)) && (!rc || e.cat === rc));
    const limited = !rm && !rc && items.length > 80;
    if (limited) items = items.slice(0, 80);
    if (!items.length) { wrap.append(h('div', { class: 'empty' }, all.length ? 'Няма записи за този избор.' : 'Още няма записи.')); return wrap; }
    if (rm || rc) {
      const sum = items.reduce((s, e) => s + e.amount, 0);
      wrap.append(h('div', { class: 'summary' }, h('span', null, items.length + (items.length === 1 ? ' запис' : ' записа')), h('b', null, money(sum))));
    }
    const byDay = [];
    items.forEach((e) => { const last = byDay[byDay.length - 1]; if (last && last.date === e.date) last.items.push(e); else byDay.push({ date: e.date, items: [e] }); });
    byDay.forEach((d) => {
      const total = d.items.reduce((s, e) => s + e.amount, 0);
      wrap.append(h('section', { style: 'display:flex;flex-direction:column;gap:6px' },
        h('div', { class: 'day-head' }, h('span', null, dayLabel(d.date)), h('span', null, money(total))),
        h('ul', { class: 'list' }, d.items.map((e) => {
          const g = groupOf(e.cat); const tone = TONE[g] || TONE['Други'];
          const sub = [e.car, e.oneOff ? 'еднократен' : '', e.note, e.pending ? 'чака връзка' : ''].filter(Boolean).join(' · ') || 'Без бележка';
          return h('li', null, h('button', { type: 'button', class: 'item', disabled: e.pending || null, onclick: e.pending ? null : () => openEdit(e) },
            h('span', { class: 'badge', 'aria-hidden': 'true', style: 'background:' + tone[0] + ';color:' + tone[1] }, (e.cat || '?').charAt(0).toUpperCase()),
            h('span', { class: 'mid' }, h('span', { class: 'cat' }, e.cat), h('span', { class: 'sub' }, sub)),
            h('span', { class: 'amt' }, money(e.amount))));
        }))));
    });
    if (limited) wrap.append(h('button', { type: 'button', class: 'btn secondary', onclick: () => setMonth(lastMonth) }, 'По-стари записи: изберете месец'));
    wrap.append(h('p', { class: 'tiny muted', style: 'margin:2px 4px 0' }, 'Докоснете запис, за да го промените или изтриете. Показват се разходите; приходите и вноските са в таблицата.'));
    return wrap;
  }

  function openEdit(e) {
    S.editing = Object.assign({}, e); S.confirmDelete = false;
    renderEdit();
  }
  function renderEdit() {
    const e = S.editing;
    const catSel = h('select', { class: 'input', 'aria-label': 'Категория', onchange: (ev) => { e.cat = ev.target.value; if (!isCarCat(e.cat)) e.car = ''; renderEdit(); } },
      S.lists.cats.map((c) => h('option', { value: c.name, selected: c.name === e.cat ? 'selected' : null }, c.name)));
    const body = [
      h('div', { class: 'grab' }),
      h('h2', { text: 'Промяна на запис' }),
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, 'Сума (€)', h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: Number(e.amount).toFixed(2).replace('.', ','), oninput: (ev) => { e.amount = parseAmount(ev.target.value); } })),
        h('label', { class: 'field' }, 'Дата', h('input', { class: 'input', type: 'date', value: e.date, onchange: (ev) => { e.date = ev.target.value || e.date; }, onclick: (ev) => openPicker(ev.target) }))),
      h('label', { class: 'field' }, 'Категория', catSel),
    ];
    if (isCarCat(e.cat)) {
      body.push(h('label', { class: 'field' }, 'Кола', h('select', { class: 'input', onchange: (ev) => { e.car = ev.target.value; } },
        h('option', { value: '' }, '—'), S.lists.cars.map((c) => h('option', { value: c, selected: c === e.car ? 'selected' : null }, c)))));
    }
    body.push(
      h('label', { class: 'setting', style: 'padding:4px 0;border:0' }, h('span', { class: 'mid' }, h('span', { class: 't' }, 'Еднократен')),
        h('input', { type: 'checkbox', checked: e.oneOff, onchange: (ev) => { e.oneOff = ev.target.checked; } })),
      h('label', { class: 'field' }, 'Бележка', h('input', { class: 'input', type: 'text', value: e.note, maxlength: '120', oninput: (ev) => { e.note = ev.target.value; } })),
      h('button', { type: 'button', class: 'btn', onclick: saveEdit }, 'Запази промените'),
      h('div', { class: 'grid2' },
        h('button', { type: 'button', class: 'btn secondary', onclick: closeSheet }, 'Отказ'),
        h('button', { type: 'button', class: 'btn danger', onclick: deleteEdit }, S.confirmDelete ? 'Сигурни ли сте?' : 'Изтрий')));
    if (!navigator.onLine) body.push(h('p', { class: 'tiny muted', style: 'margin:0' }, 'Промени и изтриване изискват интернет.'));
    openSheet(body);
  }
  async function saveEdit() {
    const e = S.editing;
    if (!(e.amount > 0)) { toast('Въведете сума.'); return; }
    if (!demo && !(await ensureSignedIn())) return;
    try {
      await backend.update(e.row, { date: e.date, amount: e.amount, cat: e.cat, car: e.car, oneOff: e.oneOff, note: e.note });
      const i = S.entries.findIndex((x) => x.row === e.row); if (i >= 0) S.entries[i] = Object.assign({}, e);
      store.set(K('cache.entries'), S.entries); S.monthData = {};
      closeSheet(); toast('Записът е променен.'); render();
    } catch (err) { toast(err.code === 'offline' ? 'Няма интернет.' : err.message, 4000); }
  }
  async function deleteEdit() {
    if (!S.confirmDelete) { S.confirmDelete = true; renderEdit(); return; }
    if (!demo && !(await ensureSignedIn())) return;
    const row = S.editing.row;
    try {
      await backend.remove(row);
      S.entries = S.entries.filter((x) => x.row !== row).map((x) => (x.row > row ? Object.assign({}, x, { row: x.row - 1 }) : x));
      store.set(K('cache.entries'), S.entries); S.monthData = {};
      closeSheet(); toast('Записът е изтрит.'); render();
    } catch (err) { toast(err.code === 'offline' ? 'Няма интернет.' : err.message, 4000); }
  }

  /* ----- Месец ----- */
  function viewMonth() {
    const wrap = h('div', { class: 'scroll' });
    const nav = h('div', { class: 'month-nav', style: 'justify-content:space-between' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Предишен месец', disabled: S.month <= 1 || null, onclick: () => { S.month--; render(); } }, svg(ICON.left)),
      h('span', { class: 'small muted' }, S.month === new Date().getMonth() + 1 ? 'до днес' : 'целия месец'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Следващ месец', disabled: S.month >= 12 || null, onclick: () => { S.month++; render(); } }, svg(ICON.right)));
    wrap.append(nav);
    const d = S.monthData[S.month];
    if (!d) {
      wrap.append(h('div', { class: 'empty' }, S.monthError || (navigator.onLine ? 'Зареждане…' : 'Нужен е интернет, за да се покаже месецът.')));
      loadMonth();
      return wrap;
    }
    // Month statement: income, minus spending (regular / one-off), what's left.
    const line = (label, v, cls, extra) => h('div', { class: 'st-row' + (extra ? ' ' + extra : '') }, h('span', null, label), h('span', { class: cls || '' }, v));
    const keptPct = d.income > 0 ? Math.round(d.left / d.income * 100) : null;
    const foot = [keptPct != null ? keptPct + '% от приходите' : '', d.invested ? 'вложени ' + money0(d.invested) : ''].filter(Boolean).join(' · ');
    wrap.append(h('section', { class: 'card statement', 'aria-label': 'Сметка на месеца' },
      line('Приходи', '+' + money0(d.income), 'pos'),
      line('Разходи', '−' + money0(d.spend).replace('−', ''), 'neg'),
      line('редовни', money0(d.regular), '', 'sub'),
      line('еднократни', money0(d.oneOff), d.oneOff ? 'warn' : '', 'sub'),
      h('div', { class: 'st-rule' }),
      h('div', { class: 'st-row total' }, h('span', null, 'Остават'), h('span', { class: d.left < 0 ? 'neg' : 'pos' }, money0(d.left))),
      foot ? h('div', { class: 'small muted' }, foot) : null));
    const max = Math.max(1, ...d.groups.map((g) => Math.max(g.amount, g.avg)));
    const groups = d.groups.slice().sort((a, b) => b.amount - a.amount);
    wrap.append(h('section', { class: 'card' },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline' }, h('h2', { text: 'Разходи по групи' }),
        h('span', { class: 'tiny muted', style: 'display:flex;align-items:center;gap:6px' }, h('span', { 'aria-hidden': 'true', style: 'width:2px;height:12px;background:#14181F' }), 'средно на месец')),
      groups.map((g) => h('div', { class: 'bar-row' },
        h('div', { class: 'bar-top' }, h('span', { style: 'font-weight:500' }, g.name),
          h('span', null, h('b', { style: 'font-weight:600' }, money0(g.amount)), h('span', { class: 'muted' }, ' / ' + money0(g.avg)))),
        h('div', { class: 'bar', role: 'img', 'aria-label': g.name + ': ' + money0(g.amount) + ', средно ' + money0(g.avg) },
          h('div', { class: 'fill' + (g.amount > g.avg ? ' over' : ''), style: 'width:' + Math.max(g.amount > 0 ? 1.5 : 0, g.amount / max * 100).toFixed(1) + '%' }),
          h('div', { class: 'mark', style: 'left:' + Math.min(99.5, g.avg / max * 100).toFixed(1) + '%' }))))));
    wrap.append(h('p', { class: 'tiny muted', style: 'margin:0 4px' }, 'Числата идват от раздел „Баланс“ на таблицата.'));
    return wrap;
  }
  let monthLoading = null;
  async function loadMonth() {
    const m = S.month;
    if (monthLoading === m || !navigator.onLine || !backend.signedIn) return;
    monthLoading = m; S.monthError = null;
    try { S.monthData[m] = await backend.loadMonth(m); }
    catch (e) { S.monthError = e.code === 'needs-sign-in' ? 'Докоснете „Влез“ горе вдясно.' : e.code === 'offline' ? 'Няма интернет.' : e.message; }
    monthLoading = null;
    if (S.view === 'month' && S.month === m) renderMain();
  }

  /* ----- Настройки ----- */
  function viewSettings() {
    const wrap = h('div', { class: 'scroll' });
    if (!demo && !backend.configured) { wrap.append(onboarding()); return wrap; }
    const year = new Date().getFullYear();

    const sheetCard = h('section', { class: 'card' }, h('span', { class: 'label', text: 'Таблица' }));
    if (backend.hasSheet) {
      sheetCard.append(h('div', null, h('div', { style: 'font-size:15px;font-weight:600' }, backend.sheetName),
        h('div', { class: 'tiny muted' }, 'Записва в „Записи“, „Приходи“ и „Инвестиции“.')));
    } else {
      sheetCard.append(h('p', { class: 'small muted', style: 'margin:0' }, 'Още няма избрана таблица.'));
    }
    if (!demo) {
      sheetCard.append(h('button', { type: 'button', class: 'btn secondary', onclick: chooseSheet }, backend.hasSheet ? 'Смени таблицата' : 'Влез и избери таблица'));
      sheetCard.append(h('button', { type: 'button', class: 'btn secondary', onclick: async () => {
        const y = backend.sheetName.includes(String(year)) ? year + 1 : year;
        try { await backend.preload(); const s = await backend.createYear(y); toast('Създадена и свързана: ' + s.name, 3500); await refresh(); render(); }
        catch (e) { if (e.message !== 'cancel') toast(e.message, 4500); }
      } }, 'Нова година от шаблона'));
      sheetCard.append(h('p', { class: 'tiny muted', style: 'margin:0' }, '„Нова година“ копира шаблона като „budget ' + (backend.sheetName.includes(String(year)) ? year + 1 : year) + '“ и превключва към копието. Не забравяйте да насочите и таблото към новия файл.'));
    } else {
      sheetCard.append(h('a', { class: 'btn secondary', href: './', style: 'display:flex;align-items:center;justify-content:center;text-decoration:none' }, 'Изход от демото'));
    }
    wrap.append(sheetCard);

    const toggle = (key, title, desc) => h('label', { class: 'setting' },
      h('span', { class: 'mid' }, h('span', { class: 't' }, title), h('span', { class: 'tiny muted' }, desc)),
      h('input', { type: 'checkbox', checked: S.settings[key], onchange: (e) => { S.settings[key] = e.target.checked; store.set(K('settings'), S.settings); if (key === 'modes' && !e.target.checked) S.mode = 'expense'; } }));
    wrap.append(h('section', { class: 'card', style: 'padding:4px 16px' },
      h('div', { class: 'setting' },
        h('span', { class: 'mid' }, h('span', { class: 't' }, 'Категории'), h('span', { class: 'tiny muted' }, (S.lists ? S.lists.cats.length : 0) + ' от раздел „Категории“')),
        h('button', { type: 'button', class: 'btn secondary', style: 'width:auto;height:36px;padding:0 12px', onclick: async () => { if (demo || (await ensureSignedIn())) { await refresh(); toast('Обновено.'); } } }, 'Обнови')),
      toggle('quick', 'Най-ползваните отгоре', '7-те най-чести категории като бутони'),
      toggle('modes', 'Приходи и вноски', 'Превключвател „Разход / Приход / Вноска“')));

    wrap.append(h('section', { class: 'card' }, h('span', { class: 'label', text: 'Сигурност и връзка' }),
      h('div', { class: 'row', style: 'flex-wrap:nowrap;align-items:flex-start' }, svg(ICON.lock, 18), h('span', { class: 'small', style: 'color:#3D4552' }, 'Влизате с Google акаунта си. Приложението вижда само файловете, които изберете, и няма собствен сървър.')),
      h('div', { class: 'row', style: 'flex-wrap:nowrap;align-items:flex-start' }, svg(ICON.refresh, 18), h('span', { class: 'small', style: 'color:#3D4552' }, 'Без интернет записите се пазят на телефона и се изпращат сами по-късно.')),
      !demo && backend.hasSheet ? h('button', { type: 'button', class: 'btn danger', onclick: () => { backend.signOut(); S.entries = []; S.lists = null; store.del(K('cache.entries')); store.del(K('cache.lists')); render(); toast('Излязохте.'); } }, 'Излез от Google') : null));

    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    if (!standalone) {
      wrap.append(h('section', { class: 'card' }, h('span', { class: 'label', text: 'Инсталиране' }),
        S.installEvent
          ? h('button', { type: 'button', class: 'btn', onclick: async () => { S.installEvent.prompt(); await S.installEvent.userChoice; S.installEvent = null; renderMain(); } }, 'Инсталирай на телефона')
          : h('p', { class: 'small', style: 'margin:0;color:#3D4552' }, 'В Chrome отворете менюто ⋮ и изберете „Инсталиране на приложението“ (или „Добавяне към началния екран“).')));
    }
    return wrap;
  }

  /* ---------- bottom sheet ---------- */
  function openSheet(children) {
    const sh = $('#sheet');
    sh.replaceChildren(...children); sh.hidden = false; $('#sheet-backdrop').hidden = false;
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true; S.editing = null; S.confirmDelete = false; }
  $('#sheet-backdrop').addEventListener('click', closeSheet);

  /* ---------- wiring ---------- */
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    S.view = t.dataset.view;
    if (S.view === 'month') S.monthError = null;
    closeSheet(); render(); window.scrollTo(0, 0);
  }));
  window.addEventListener('online', () => { renderSync(); flush(); if (S.view === 'month') renderMain(); });
  window.addEventListener('offline', renderSync);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvent = e; if (S.view === 'settings') renderMain(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderSync(); refresh({ quiet: true }); } });
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
