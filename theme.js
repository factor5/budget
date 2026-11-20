/* Light / dark theme. Loaded in <head> so the right colours show from the first frame. */
(function () {
  'use strict';
  const KEY = 'theme'; // 'auto' | 'light' | 'dark'
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let pref = 'auto';
  try { const s = localStorage.getItem(KEY); if (s === 'light' || s === 'dark') pref = s; } catch (_) {}
  const isDark = () => pref === 'dark' || (pref === 'auto' && !!(mq && mq.matches));
  function apply() {
    const root = document.documentElement;
    if (pref === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', pref);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark() ? '#0F1216' : '#116A55');
  }
  apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', apply);
  window.Theme = {
    get: () => pref,
    set(v) { pref = v; try { if (v === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch (_) {} apply(); },
  };
})();
