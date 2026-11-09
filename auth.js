/* ============================================================
 * auth.js - Supabase magic-link gate for the whole dashboard.
 * Loads after supabase.js + config.js. Exposes window.AUTH.
 * ============================================================ */
(function () {
  'use strict';
  var cfg = (window.DASHBOARD_CONFIG || {});
  var sb = null;
  var user = null;

  function init() {
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      console.warn('Supabase not configured; auth disabled.');
      return Promise.resolve(false);
    }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return sb.auth.getSession().then(function (res) {
      var s = res && res.data && res.data.session;
      if (s && s.user) { user = s.user; return true; }
      return false;
    });
  }

  function isAllowed(email) {
    if (!email) return Promise.resolve(false);
    return sb.from('allowed_emails').select('email').eq('email', email.toLowerCase()).maybeSingle()
      .then(function (r) {
        if (r.error) { console.error('allowed check', r.error); return false; }
        return !!r.data;
      });
  }

  function showOverlay() {
    var o = document.getElementById('authOverlay');
    if (o) o.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    var lb = document.getElementById('authLogoutBtn');
    if (lb) lb.style.display = 'none';
  }
  function hideOverlay() {
    var o = document.getElementById('authOverlay');
    if (o) o.style.display = 'none';
    document.body.style.overflow = '';
    var lb = document.getElementById('authLogoutBtn');
    if (lb) { lb.style.display = 'inline-block'; lb.onclick = function(){ window.AUTH.signOut(); }; }
  }

  function gate() {
    return init().then(function (authed) {
      if (authed && user) { hideOverlay(); return true; }
      showOverlay();
      return false;
    }).catch(function (e) { console.error('auth gate', e); showOverlay(); return false; });
  }

  function signIn(email, password) {
    if (!sb) return Promise.resolve({ error: { message: 'Supabase not configured' } });
    return sb.auth.signInWithPassword({ email: email, password: password });
  }

  function signOut() {
    if (sb) sb.auth.signOut();
    user = null;
    showOverlay();
  }

  // wire UI
  function wire() {
    var btn = document.getElementById('authSend');
    var input = document.getElementById('authEmail');
    var msg = document.getElementById('authMsg');
    if (btn) btn.addEventListener('click', function () {
      var email = (input && input.value || '').trim();
      var passInput = document.getElementById('authPass');
      var password = (passInput && passInput.value || '').trim();
      if (!email) { if (msg) msg.textContent = 'Enter your email.'; return; }
      if (!password) { if (msg) msg.textContent = 'Enter your password.'; passInput && passInput.focus(); return; }
      btn.disabled = true;
      signIn(email, password).then(function (r) {
        btn.disabled = false;
        if (r.error) { if (msg) msg.textContent = r.error.message; return; }
        // Successful sign-in (users are pre-approved in Supabase Auth) -> unlock
        user = r.data && r.data.user;
        hideOverlay();
        if (typeof render === 'function') render();
      });
    });
    // handle sign-in / sign-out state changes (and restore on reload)
    if (sb) sb.auth.onAuthStateChange(function (event, session) {
      if (session && session.user) {
        user = session.user;
        hideOverlay();
        if (typeof render === 'function') render();
      } else {
        showOverlay();
      }
    });
  }

  window.AUTH = { init: init, gate: gate, signOut: signOut, getUser: function () { return user; } };

  // auto-run gate on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { wire(); gate(); });
  } else {
    wire(); gate();
  }
})();
