/* Data layer: Google Sheets (real) and Demo (in memory, for trying the app). */
(function () {
  'use strict';
  const T = (k, v) => (window.I18N ? window.I18N.t(k, v) : k);

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  };

  // Google Sheets stores dates as days since 30 Dec 1899.
  const EPOCH = Date.UTC(1899, 11, 30);
  const isoToSerial = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 864e5); };
  const serialToIso = (n) => new Date(EPOCH + Math.round(n) * 864e5).toISOString().slice(0, 10);

  // Layout of the new-format budget file.
  const L = {
    entries: 'Записи',
    income: 'Приходи',
    invest: 'Инвестиции',
    balance: 'Баланс',
    lists: 'Категории',
  };

  class NeedsSignIn extends Error { constructor() { super('needs-sign-in'); this.code = 'needs-sign-in'; } }
  class Offline extends Error { constructor() { super('offline'); this.code = 'offline'; } }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error(T('loadFailed', { src })));
      document.head.appendChild(s);
    });
  }

  /* ---------------- Google ---------------- */
  class GoogleBackend {
    constructor(cfg) {
      this.cfg = cfg || {};
      this.token = store.get('g.token', null);
      this.sheet = store.get('g.sheet', null);
      this.consented = store.get('g.consented', false);
      this.tokenClient = null;
      this.scriptsReady = null;
      this.demo = false;
    }

    get configured() {
      const c = this.cfg;
      return !!(c.CLIENT_ID && c.API_KEY && c.APP_ID) && !/PASTE_/.test(c.CLIENT_ID + c.API_KEY + c.APP_ID);
    }
    get hasSheet() { return !!(this.sheet && this.sheet.id); }
    get sheetName() { return this.sheet ? this.sheet.name : ''; }
    get signedIn() { return !!(this.token && this.token.exp > Date.now() + 60000); }

    preload() {
      if (!this.configured) return Promise.resolve();
      if (!this.scriptsReady) {
        this.scriptsReady = Promise.all([
          loadScript('https://accounts.google.com/gsi/client'),
          loadScript('https://apis.google.com/js/api.js'),
        ]).then(() => {
          this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.cfg.CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/drive.file',
            callback: () => {},
          });
          return new Promise((res) => gapi.load('picker', res));
        });
      }
      return this.scriptsReady;
    }

    // Must be called straight from a tap: Google opens a short sign-in window.
    signIn() {
      if (this.signedIn) return Promise.resolve();
      if (!this.tokenClient) return Promise.reject(new Error(T('googleLoading')));
      return new Promise((resolve, reject) => {
        this.tokenClient.callback = (r) => {
          if (r.error) { reject(new Error(r.error_description || r.error)); return; }
          this.token = { value: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
          this.consented = true;
          store.set('g.token', this.token); store.set('g.consented', true);
          resolve();
        };
        this.tokenClient.error_callback = (e) => reject(new Error(e && e.type === 'popup_closed' ? T('signInCancelled') : T('signInFailed')));
        this.tokenClient.requestAccessToken({ prompt: this.consented ? '' : 'consent' });
      });
    }

    signOut() {
      if (this.token && window.google && google.accounts && google.accounts.oauth2) {
        try { google.accounts.oauth2.revoke(this.token.value, () => {}); } catch (e) { /* ignore */ }
      }
      this.token = null; this.sheet = null; this.consented = false;
      store.del('g.token'); store.del('g.sheet'); store.del('g.consented');
    }

    async api(method, url, body) {
      if (!navigator.onLine) throw new Offline();
      if (!this.signedIn) throw new NeedsSignIn();
      let res;
      try {
        res = await fetch(url, {
          method,
          headers: Object.assign({ Authorization: 'Bearer ' + this.token.value }, body ? { 'Content-Type': 'application/json' } : {}),
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) { throw new Offline(); }
      if (res.status === 401) { this.token = null; store.del('g.token'); throw new NeedsSignIn(); }
      if (!res.ok) {
        let msg = T('errorN', { n: res.status });
        try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e) { /* no body */ }
        throw new Error(msg);
      }
      return res.status === 204 ? null : res.json();
    }

    sheetsUrl(path) { return 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(this.sheet.id) + path; }

    async getRanges(ranges) {
      const q = ranges.map((r) => 'ranges=' + encodeURIComponent(r)).join('&');
      const j = await this.api('GET', this.sheetsUrl('/values:batchGet?' + q + '&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER'));
      return j.valueRanges.map((v) => v.values || []);
    }

    pickFile(title) {
      return new Promise((resolve, reject) => {
        const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS).setMode(google.picker.DocsViewMode.LIST);
        const picker = new google.picker.PickerBuilder()
          .setTitle(title)
          .addView(view)
          .setOAuthToken(this.token.value)
          .setDeveloperKey(this.cfg.API_KEY)
          .setAppId(this.cfg.APP_ID)
          .setLocale('bg')
          .setCallback((data) => {
            if (data.action === google.picker.Action.PICKED) resolve({ id: data.docs[0].id, name: data.docs[0].name });
            else if (data.action === google.picker.Action.CANCEL) reject(new Error('cancel'));
          })
          .build();
        picker.setVisible(true);
      });
    }

    async useFile(file) {
      const meta = await this.api('GET', 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(file.id) + '?fields=properties.title,sheets.properties.sheetId,sheets.properties.title');
      const ids = {};
      meta.sheets.forEach((s) => { ids[s.properties.title] = s.properties.sheetId; });
      const missing = [L.entries, L.income, L.invest, L.balance, L.lists].filter((t) => !(t in ids));
      if (missing.length) throw new Error(T('wrongFormat', { missing: missing.join(', ') }));
      this.sheet = { id: file.id, name: meta.properties.title, sheetIds: ids };
      store.set('g.sheet', this.sheet);
      return this.sheet;
    }

    async pickSheet() {
      await this.signIn();
      const file = await this.pickFile(T('pickYear'));
      return this.useFile(file);
    }

    async createYear(year) {
      await this.signIn();
      const tpl = await this.pickFile(T('pickTemplate'));
      const copy = await this.api('POST', 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(tpl.id) + '/copy', { name: 'budget ' + year });
      return this.useFile({ id: copy.id, name: copy.name });
    }

    async loadLists() {
      const [cats, cars, inc, inv] = await this.getRanges([L.lists + '!A2:B41', L.lists + '!D2:D15', L.lists + '!F2:F20', L.lists + '!H2:H15']);
      return {
        cats: cats.filter((r) => r[0]).map((r) => ({ name: String(r[0]), group: String(r[1] || 'Други') })),
        cars: cars.map((r) => r[0]).filter(Boolean).map(String),
        incomeSources: inc.map((r) => r[0]).filter(Boolean).map(String),
        investTypes: inv.map((r) => r[0]).filter(Boolean).map(String),
      };
    }

    async loadEntries() {
      const [rows] = await this.getRanges([L.entries + '!A2:F']);
      const out = [];
      rows.forEach((r, i) => {
        if (r[0] === '' || r[0] == null || r[1] === '' || r[1] == null) return;
        out.push({
          row: i + 2,
          date: typeof r[0] === 'number' ? serialToIso(r[0]) : String(r[0]),
          amount: Number(r[1]) || 0,
          cat: String(r[2] || ''),
          car: String(r[3] || ''),
          oneOff: r[4] === true || r[4] === 'TRUE',
          note: String(r[5] || ''),
        });
      });
      return out;
    }

    async loadMonth(month) {
      const [rows] = await this.getRanges([L.balance + '!A4:O21']);
      const num = (r, c) => { const v = rows[r] && rows[r][c]; return typeof v === 'number' ? v : 0; };
      const c = month; // column B is January (index 1)
      const groups = [];
      for (let r = 10; r <= 16; r++) {
        if (rows[r] && rows[r][0]) groups.push({ name: String(rows[r][0]), amount: num(r, c), avg: num(r, 14) });
      }
      return {
        income: num(1, c), spend: num(2, c), oneOff: num(3, c), regular: num(4, c), left: num(5, c), invested: num(7, c),
        groups,
      };
    }

    async nextRow(tab) {
      const [col] = await this.getRanges([tab + '!A:A']);
      return col.length + 1;
    }

    async write(range, values) {
      return this.api('PUT', this.sheetsUrl('/values/' + encodeURIComponent(range) + '?valueInputOption=RAW'), { range, values: [values] });
    }

    async append(kind, e) {
      if (kind === 'expense') {
        const r = await this.nextRow(L.entries);
        await this.write(L.entries + '!A' + r + ':F' + r, [isoToSerial(e.date), e.amount, e.cat, e.car || '', !!e.oneOff, e.note || '']);
        return r;
      }
      const tab = kind === 'income' ? L.income : L.invest;
      const r = await this.nextRow(tab);
      await this.write(tab + '!A' + r + ':D' + r, [isoToSerial(e.date), e.amount, e.cat, e.note || '']);
      return r;
    }

    async update(row, e) {
      await this.write(L.entries + '!A' + row + ':F' + row, [isoToSerial(e.date), e.amount, e.cat, e.car || '', !!e.oneOff, e.note || '']);
    }

    async remove(row) {
      await this.api('POST', this.sheetsUrl(':batchUpdate'), {
        requests: [{ deleteDimension: { range: { sheetId: this.sheet.sheetIds[L.entries], dimension: 'ROWS', startIndex: row - 1, endIndex: row } } }],
      });
    }
  }

  /* ---------------- Demo ---------------- */
  const DEMO_CATS = [
    ['храна', 'Храна'], ['битови', 'Дом'], ['ток', 'Дом'], ['вода', 'Дом'], ['отопление', 'Дом'], ['интернет', 'Дом'], ['телефон', 'Дом'], ['абонаменти', 'Дом'],
    ['гориво', 'Коли'], ['кола – ремонт', 'Коли'], ['кола – застраховка, преглед, данък', 'Коли'], ['кола – части и консумативи', 'Коли'],
    ['дрехи, обувки', 'Семейство'], ['училище', 'Семейство'], ['Алекс джобни', 'Семейство'], ['обучение', 'Семейство'],
    ['лекарства', 'Здраве'], ['доктор, зъболекар', 'Здраве'],
    ['спорт', 'Свободно време'], ['култура, книги, кино', 'Свободно време'], ['почивки', 'Свободно време'], ['подаръци, празници, рожд. дни', 'Свободно време'],
    ['животни', 'Други'], ['техника, ремонти', 'Други'], ['услуги', 'Други'], ['данъци и такси', 'Други'], ['банкови такси', 'Други'], ['други', 'Други'],
  ];
  const GROUPS = ['Храна', 'Дом', 'Коли', 'Семейство', 'Здраве', 'Свободно време', 'Други'];

  class DemoBackend {
    constructor() {
      this.demo = true; this.configured = true; this.hasSheet = true; this.signedIn = true; Object.defineProperty(this, 'sheetName', { get: () => T('demoSheet'), configurable: true });
      const y = new Date().getFullYear(), m = new Date().getMonth() + 1;
      const d = (mm, dd) => y + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
      const prev = m > 1 ? m - 1 : 1;
      const today = new Date().getDate();
      const seed = [
        [d(prev, 3), 125, 'храна'], [d(prev, 5), 95, 'гориво', 'Тойота'], [d(prev, 8), 20, 'вода'], [d(prev, 11), 115, 'храна'], [d(prev, 14), 35, 'телефон'],
        [d(prev, 17), 114, 'храна'], [d(prev, 20), 58, 'гориво', 'ML'], [d(prev, 24), 131, 'ток'], [d(prev, 26), 86, 'дрехи, обувки'], [d(prev, 28), 44, 'Алекс джобни', '', false, 'бал'],
        [d(m, Math.max(1, today - 7)), 156, 'храна'], [d(m, Math.max(1, today - 7)), 82, 'битови', '', false, 'улук'], [d(m, Math.max(1, today - 6)), 37, 'вода'],
        [d(m, Math.max(1, today - 5)), 1420, 'услуги', '', true, 'врати, капаро'], [d(m, Math.max(1, today - 4)), 89, 'кола – застраховка, преглед, данък', 'ML', false, 'гуми смяна'],
        [d(m, Math.max(1, today - 3)), 184, 'гориво', 'Тойота'], [d(m, Math.max(1, today - 2)), 93, 'храна'], [d(m, Math.max(1, today - 2)), 12, 'битови'],
        [d(m, Math.max(1, today - 1)), 23, 'телефон'], [d(m, Math.max(1, today - 1)), 9, 'храна'], [d(m, today), 15, 'битови', '', false, 'брава'],
      ];
      this.entries = seed.map((s, i) => ({ row: i + 2, date: s[0], amount: s[1], cat: s[2], car: s[3] || '', oneOff: !!s[4], note: s[5] || '' }));
      this.income = [{ date: d(prev, 1), amount: 5407, cat: 'Свилен заплата' }, { date: d(m, 1), amount: 5407, cat: 'Свилен заплата' }];
      this.invest = [];
    }
    preload() { return Promise.resolve(); }
    signIn() { return Promise.resolve(); }
    signOut() {}
    pickSheet() { return Promise.resolve({ name: this.sheetName }); }
    createYear() { return Promise.reject(new Error(T('demoNoGoogle'))); }
    wait() { return new Promise((r) => setTimeout(r, 250)); }
    async loadLists() {
      await this.wait();
      return {
        cats: DEMO_CATS.map(([name, group]) => ({ name, group })),
        cars: ['ML', 'Тойота'],
        incomeSources: ['Свилен заплата', 'Деси заплата', 'бонуси', 'болнични', 'подаръци', 'други'],
        investTypes: ['Акции/Фондове', 'Земя', 'Злато', 'Кеш'],
      };
    }
    async loadEntries() { await this.wait(); return this.entries.map((e) => Object.assign({}, e)); }
    async loadMonth(month) {
      await this.wait();
      const grp = Object.fromEntries(DEMO_CATS);
      const inMonth = (e) => Number(e.date.slice(5, 7)) === month;
      const months = new Set(this.entries.map((e) => Number(e.date.slice(5, 7))));
      const sum = (xs) => xs.reduce((s, e) => s + e.amount, 0);
      const es = this.entries.filter(inMonth);
      const spend = sum(es), oneOff = sum(es.filter((e) => e.oneOff)), income = sum(this.income.filter(inMonth));
      const groups = GROUPS.map((g) => ({
        name: g,
        amount: sum(es.filter((e) => grp[e.cat] === g)),
        avg: sum(this.entries.filter((e) => grp[e.cat] === g)) / Math.max(1, months.size),
      }));
      return { income, spend, oneOff, regular: spend - oneOff, left: income - spend, invested: sum(this.invest.filter(inMonth)), groups };
    }
    async append(kind, e) {
      await this.wait();
      if (!navigator.onLine) throw new Offline();
      if (kind === 'expense') { const row = Math.max(1, ...this.entries.map((x) => x.row)) + 1; this.entries.push(Object.assign({ row }, e)); return row; }
      (kind === 'income' ? this.income : this.invest).push(Object.assign({}, e));
      return 0;
    }
    async update(row, e) { await this.wait(); if (!navigator.onLine) throw new Offline(); const i = this.entries.findIndex((x) => x.row === row); if (i >= 0) this.entries[i] = Object.assign({ row }, e); }
    async remove(row) {
      await this.wait(); if (!navigator.onLine) throw new Offline();
      this.entries = this.entries.filter((x) => x.row !== row).map((x) => (x.row > row ? Object.assign({}, x, { row: x.row - 1 }) : x));
    }
  }

  window.Backend = { GoogleBackend, DemoBackend, NeedsSignIn, Offline, store, isoToSerial, serialToIso };
})();
