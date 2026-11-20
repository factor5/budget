// A fake Google for one test: Drive files, sign-in and the Sheets API, all in memory.
// Every phone (browser context) in the test talks to the same fake, like real phones
// talking to the same Google account.

const { Spreadsheet, ApiError } = require('./spreadsheet');
const { GSI_CLIENT, GAPI } = require('./browser-scripts');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

class FakeGoogle {
  constructor() {
    this.files = new Map(); // id → Spreadsheet
    this.tokens = new Map(); // token → { valid }
    this.nextId = 1;
    this.signIns = []; // { prompt, scope } for each sign-in window that opened
    this.requests = []; // every Google API call: { method, path }
    this.nextSignIn = 'allow'; // 'allow' | 'cancel' | 'deny'
    this.failures = []; // queued { status, message } returned to the next API calls
    this.beforeWriteHooks = [];
  }

  /* ---------- what tests set up ---------- */

  /** A new, empty spreadsheet in My Drive. */
  createSpreadsheet(title) {
    const s = new Spreadsheet('sheet-' + this.nextId++, title);
    this.files.set(s.id, s);
    return s;
  }

  file(title) {
    const f = [...this.files.values()].find((x) => x.title === title);
    if (!f) throw new Error('No file named ' + title + ' in the fake Drive');
    return f;
  }

  /** The next sign-in window: the user allows, closes it, or Google refuses. */
  onNextSignIn(outcome) { this.nextSignIn = outcome; }

  /** The user's access ends on Google's side (for example removed at myaccount.google.com). */
  revokeAllTokens() { for (const t of this.tokens.values()) t.valid = false; }

  /** Whether any phone still holds a token Google accepts. */
  hasValidAccess() { return [...this.tokens.values()].some((t) => t.valid); }

  /** The next API call fails with this HTTP status. */
  failNextRequest(status, message) { this.failures.push({ status, message }); }

  /** Every API call fails with this status until stopFailing(). */
  failAllRequests(status, message) { this.alwaysFail = { status, message }; }
  stopFailing() { this.alwaysFail = null; this.failures = []; }

  /** Runs fn just before the next write reaches the sheet: as if another phone was a moment faster. */
  beforeNextWrite(fn) { this.beforeWriteHooks.push(fn); }

  apiCalls(filter) { return this.requests.filter((r) => !filter || (r.method + ' ' + r.path).includes(filter)); }

  /* ---------- wiring into a browser context ---------- */

  async attach(context, phone) {
    await context.route(/^https:\/\/accounts\.google\.com\/gsi\/client/, (route) => route.fulfill({ contentType: 'text/javascript', body: GSI_CLIENT }));
    await context.route(/^https:\/\/apis\.google\.com\/js\/api\.js/, (route) => route.fulfill({ contentType: 'text/javascript', body: GAPI }));
    await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
    await context.route(/^https:\/\/fake-google\.test\//, (route) => this.handleControl(route, phone));
    await context.route(/^https:\/\/(sheets|www)\.googleapis\.com\//, (route) => this.handleApi(route, phone));
  }

  async handleControl(route, phone) {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (phone.offline) return route.abort('internetdisconnected');
    if (path === '/oauth/authorize') {
      const body = JSON.parse(req.postData() || '{}');
      this.signIns.push({ prompt: body.prompt, scope: body.scope });
      const outcome = this.nextSignIn; this.nextSignIn = 'allow';
      if (outcome === 'cancel') return route.fulfill({ json: { popup_closed: true } });
      if (outcome === 'deny') return route.fulfill({ json: { error: 'access_denied', error_description: 'Access denied' } });
      const token = 'token-' + this.nextId++;
      this.tokens.set(token, { valid: true });
      return route.fulfill({ json: { access_token: token, expires_in: 3599, scope: body.scope, token_type: 'Bearer' } });
    }
    if (path === '/oauth/revoke') {
      const t = this.tokens.get(req.postData()); if (t) t.valid = false;
      return route.fulfill({ status: 200, body: '' });
    }
    if (path === '/picker/files') {
      const files = [...this.files.values()].map((f) => ({ id: f.id, name: f.title }));
      return route.fulfill({ json: files });
    }
    return route.fulfill({ status: 404, body: 'fake: unknown control ' + path });
  }

  async handleApi(route, phone) {
    const req = route.request();
    const headers = Object.assign({ 'Content-Type': 'application/json' }, CORS);
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (phone.offline) return route.abort('internetdisconnected');
    const url = new URL(req.url());
    this.requests.push({ method: req.method(), path: decodeURIComponent(url.pathname) + url.search, phone: phone.name });
    try {
      const failure = this.failures.shift() || this.alwaysFail;
      if (failure) throw new ApiError(failure.status, failure.message || 'fake failure');
      const auth = req.headers()['authorization'] || '';
      const tok = this.tokens.get(auth.replace(/^Bearer /, ''));
      if (!tok || !tok.valid) throw new ApiError(401, 'Request had invalid authentication credentials.');
      const body = req.postData() ? JSON.parse(req.postData()) : null;
      const json = await this.dispatch(req.method(), url, body);
      return route.fulfill({ status: 200, headers, body: JSON.stringify(json) });
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      return route.fulfill({ status: e.status, headers, body: JSON.stringify({ error: { code: e.status, message: e.message } }) });
    }
  }

  async dispatch(method, url, body) {
    const path = decodeURIComponent(url.pathname);
    let m;
    if (url.hostname === 'www.googleapis.com' && method === 'POST' && (m = /^\/drive\/v3\/files\/([^/]+)\/copy$/.exec(path))) {
      const src = this.sheet(m[1]);
      await this.runWriteHooks();
      const copy = src.copy('sheet-' + this.nextId++, body && body.name ? body.name : 'Copy of ' + src.title);
      this.files.set(copy.id, copy);
      return { kind: 'drive#file', id: copy.id, name: copy.title, mimeType: 'application/vnd.google-apps.spreadsheet' };
    }
    if (url.hostname !== 'sheets.googleapis.com') throw new ApiError(404, 'fake: unknown API ' + url.hostname + path);
    if ((m = /^\/v4\/spreadsheets\/([^/:]+)$/.exec(path)) && method === 'GET') return this.sheet(m[1]).metadata();
    if ((m = /^\/v4\/spreadsheets\/([^/:]+)\/values:batchGet$/.exec(path)) && method === 'GET') {
      const s = this.sheet(m[1]);
      if (url.searchParams.get('valueRenderOption') !== 'UNFORMATTED_VALUE') throw new ApiError(400, 'fake: expected UNFORMATTED_VALUE');
      return { spreadsheetId: s.id, valueRanges: url.searchParams.getAll('ranges').map((r) => { const values = s.read(r); return Object.assign({ range: r, majorDimension: 'ROWS' }, values.length ? { values } : {}); }) };
    }
    if ((m = /^\/v4\/spreadsheets\/([^/:]+)\/values\/(.+)$/.exec(path)) && method === 'PUT') {
      const s = this.sheet(m[1]);
      if (url.searchParams.get('valueInputOption') !== 'RAW') throw new ApiError(400, 'fake: expected valueInputOption=RAW');
      await this.runWriteHooks();
      return Object.assign({ spreadsheetId: s.id }, s.write(m[2], body.values));
    }
    if ((m = /^\/v4\/spreadsheets\/([^/:]+):batchUpdate$/.exec(path)) && method === 'POST') {
      const s = this.sheet(m[1]);
      await this.runWriteHooks();
      return Object.assign({ spreadsheetId: s.id }, s.batchUpdate(body.requests));
    }
    throw new ApiError(404, 'fake: unknown Sheets call ' + method + ' ' + path);
  }

  sheet(id) {
    const s = this.files.get(id);
    if (!s) throw new ApiError(404, 'Requested entity was not found.');
    return s;
  }

  async runWriteHooks() {
    const hooks = this.beforeWriteHooks.splice(0);
    for (const fn of hooks) await fn();
  }
}

module.exports = { FakeGoogle };
