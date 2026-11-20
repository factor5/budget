// Stand-ins for the two scripts the app loads from Google: sign-in (accounts.google.com/gsi/client)
// and the file picker (apis.google.com/js/api.js). They run in the page and ask the
// fake Google in the test process what to do, through https://fake-google.test/.

const GSI_CLIENT = `
(function () {
  window.google = window.google || {};
  window.google.accounts = { oauth2: {
    initTokenClient: function (cfg) {
      var client = {
        callback: cfg.callback,
        error_callback: cfg.error_callback,
        requestAccessToken: function (opts) {
          fetch('https://fake-google.test/oauth/authorize', { method: 'POST', body: JSON.stringify({ client_id: cfg.client_id, scope: cfg.scope, prompt: (opts && opts.prompt) || '' }) })
            .then(function (r) { return r.json(); })
            .then(function (r) {
              if (r.popup_closed) { if (client.error_callback) client.error_callback({ type: 'popup_closed' }); return; }
              client.callback(r);
            });
        },
      };
      return client;
    },
    revoke: function (token, done) {
      fetch('https://fake-google.test/oauth/revoke', { method: 'POST', body: token }).finally(function () { if (done) done(); });
    },
  } };
})();
`;

const GAPI = `
(function () {
  window.gapi = { load: function (name, cb) { setTimeout(cb, 0); } };
  window.google = window.google || {};
  function showPicker(o) {
    fetch('https://fake-google.test/picker/files', { method: 'POST', body: JSON.stringify({ token: o.token, developerKey: o.key, appId: o.appId, view: o.view && o.view.viewId }) })
      .then(function (r) { return r.json(); })
      .then(function (files) {
        var box = document.createElement('div');
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', 'Google Picker: ' + o.title);
        box.style.cssText = 'position:fixed;inset:10%;z-index:99999;background:#fff;color:#000;padding:12px;overflow:auto;border:1px solid #888';
        var h = document.createElement('h2'); h.textContent = o.title; box.appendChild(h);
        var close = function (data) { box.remove(); o.cb(data); };
        files.forEach(function (f) {
          var b = document.createElement('button'); b.type = 'button'; b.textContent = f.name; b.style.cssText = 'display:block;margin:6px 0';
          b.onclick = function () { close({ action: 'picked', docs: [{ id: f.id, name: f.name }] }); };
          box.appendChild(b);
        });
        var c = document.createElement('button'); c.type = 'button'; c.textContent = 'Cancel';
        c.onclick = function () { close({ action: 'cancel' }); };
        box.appendChild(c);
        document.body.appendChild(box);
      });
  }
  function Builder() { this.o = {}; }
  Builder.prototype.setTitle = function (t) { this.o.title = t; return this; };
  Builder.prototype.addView = function (v) { this.o.view = v; return this; };
  Builder.prototype.setOAuthToken = function (t) { this.o.token = t; return this; };
  Builder.prototype.setDeveloperKey = function (k) { this.o.key = k; return this; };
  Builder.prototype.setAppId = function (a) { this.o.appId = a; return this; };
  Builder.prototype.setLocale = function () { return this; };
  Builder.prototype.setCallback = function (cb) { this.o.cb = cb; return this; };
  Builder.prototype.build = function () { var o = this.o; return { setVisible: function (v) { if (v) showPicker(o); } }; };
  function DocsView(id) { this.viewId = id; }
  DocsView.prototype.setMode = function (m) { this.mode = m; return this; };
  window.google.picker = {
    ViewId: { SPREADSHEETS: 'spreadsheets' },
    DocsViewMode: { LIST: 'list' },
    Action: { PICKED: 'picked', CANCEL: 'cancel' },
    DocsView: DocsView,
    PickerBuilder: Builder,
  };
})();
`;

module.exports = { GSI_CLIENT, GAPI };
