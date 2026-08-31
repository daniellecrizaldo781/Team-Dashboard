/* ============================================================
 * app-notes.js - Internal Note Helper
 * Paste rough agent notes -> clean, paste-ready internal note:
 *   || Channel: Aircall
 *   || Email: <email>
 *   || Complaint: <summary>
 *   || Resolution: <summary>
 * Channel is always Aircall (per requirement).
 *
 * AI mode: POSTs to DASHBOARD_CONFIG.notesWebAppUrl (an Apps Script doPost
 *   web app - see apps-script/NotesSummarize.gs). CORS-safe form post.
 * Offline mode: no URL configured -> best-effort local formatting so the
 *   page is fully testable without deploying anything.
 * ============================================================ */
(function () {
  function $(id) { return document.getElementById(id); }

  /* Best-effort formatter used when no AI endpoint is configured. */
  function buildFallback(raw) {
    var email = (raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i) || [''])[0];
    var cleaned = raw.replace(/\s{2,}/g, ' ').trim();
    // Customer name: right after "customer"/"client"/"caller", else a Capitalized
    // Name just before the email, else blank.
    var name = '';
    var nm = cleaned.match(/\b(customer|client|caller)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/);
    if (nm) name = nm[2].trim();
    else if (email) {
      var before = cleaned.split(email)[0];
      var mm = before.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s*$/);
      if (mm) name = mm[1].trim();
    }
    // Strip the name + email (and stray parens/commas) so they don't leak into
    // the Complaint/Resolution lines.
    var body = cleaned
      .replace(new RegExp('\\b(customer|client|caller)\\s+' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), ' ')
      .replace(email, ' ')
      .replace(/[()]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^\s*,\s*/, '').trim();
    // Split at the first resolution keyword so Complaint + Resolution are real.
    var resRe = /\b(resolution|resolved|resolve|we (did|walked|reset|re-paired|repaired|fixed|set up|guided|advised|explained|replaced|updated|sent|escalated)|fixed|solution|now (working|fine|ok|good)|issue (resolved|fixed)|outcome|closed|happy|satisfied)\b/i;
    var m = body.match(resRe);
    var complaint = body, resolution = '';
    if (m && m.index > 0) {
      complaint = body.slice(0, m.index).replace(/[,\s]+$/, '').trim();
      resolution = body.slice(m.index).trim();
    }
    return '|| Channel: Aircall\n' +
           '|| Customer Name: ' + (name || '') + '\n' +
           '|| Email: ' + (email || '') + '\n' +
           '|| Complaint: ' + (complaint || '') + '\n' +
           '|| Resolution: ' + (resolution || '');
  }

  /* Returns a Promise<{ok, text?, error?, offline?}> */
  function summarize(raw) {
    return new Promise(function (resolve) {
      raw = (raw || '').trim();
      if (!raw) { resolve({ ok: false, error: 'Paste the agent’s notes first.' }); return; }
      var url = (window.DASHBOARD_CONFIG && window.DASHBOARD_CONFIG.notesWebAppUrl) || '';
      if (!url) { resolve({ ok: true, text: buildFallback(raw), offline: true }); return; }
      var envelope = { action: 'summarizeNotes', channel: 'Aircall', notes: raw };
      var body = 'payload=' + encodeURIComponent(JSON.stringify(envelope));
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res && res.text) resolve({ ok: true, text: res.text });
          else resolve({ ok: false, error: 'The note service returned no summary.' });
        })
        .catch(function () {
          resolve({ ok: false, error: 'Could not reach the note service. Check notesWebAppUrl in config.js.' });
        });
    });
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    } catch (e) {}
  }
  function copyText(text, btn) {
    function flash() { if (btn) { var t = btn.textContent; btn.textContent = 'Copied!'; setTimeout(function () { btn.textContent = t; }, 1400); } }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(flash, function () { legacyCopy(text); flash(); });
    } else { legacyCopy(text); flash(); }
  }

  function wireNotes() {
    var input = $('notesInput'), out = $('notesOutput'), outWrap = $('notesOutputWrap'),
        status = $('notesStatus'), summarizeBtn = $('notesSummarize'),
        clearBtn = $('notesClear'), copyBtn = $('notesCopy');
    if (!input) return; // Notes page not in the DOM
    summarizeBtn.onclick = function () {
      status.textContent = 'Summarizing…'; status.className = 'notes-status';
      summarize(input.value).then(function (res) {
        if (!res.ok) {
          status.textContent = res.error || 'Something went wrong.';
          status.className = 'notes-status err';
          outWrap.hidden = true;
          return;
        }
        out.textContent = res.text;
        outWrap.hidden = false;
        status.textContent = res.offline
          ? 'Offline mode (no AI configured) — paste your Notes web-app URL in config.js for AI summaries.'
          : 'Done — copy and paste onto the record.';
        status.className = 'notes-status ok';
      });
    };
    clearBtn.onclick = function () {
      input.value = ''; outWrap.hidden = true; status.textContent = ''; status.className = 'notes-status'; input.focus();
    };
    copyBtn.onclick = function () { if (out.textContent) copyText(out.textContent, copyBtn); };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireNotes);
  else wireNotes();
})();
