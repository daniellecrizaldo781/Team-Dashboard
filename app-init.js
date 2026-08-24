/* ============================================================
 * app-init.js - dispatcher, navigation, filters, auto-refresh
 * ============================================================ */

var PAGE_META = {
  overview:     ['Overview', 'Team performance at a glance'],
  productivity: ['Daily Productivity', 'Daily ticket handling and productivity vs target'],
  calls:        ['Weekly Call Stats', 'Call volume and pickup performance by week'],
  qa:           ['QA Scores', 'Quality evaluations and rankings for all agents'],
  scorecards:   ['Scorecards', 'Official overall scores and team ranking'],
  monthly:      ['Monthly Scorecard', 'Monthly overall scores from the Monthly Scorecard tab'],
  schedule:     ['Team Schedule', 'Shifts and rest days by agent'],
  otbreak:      ['OT & Break Schedule', 'Overtime and break assignments'],
  leave:        ['Leave Requests', 'File and view leave requests'],
  resources:     ['Resources', 'Quick links, guides and contacts for the team'],
};

/** Single dispatcher - every page re-renders from current filter state. */
function render() {
  if (!DATA) return;
  try { renderOverview(); }     catch (e) { console.error('overview', e); }
  try { renderProductivity(); } catch (e) { console.error('productivity', e); }
  try { renderCalls(); }        catch (e) { console.error('calls', e); }
  try { renderQa(); }           catch (e) { console.error('qa', e); }
  try { renderScorecards(); }   catch (e) { console.error('scorecards', e); }
  try { renderMonthly(); }      catch (e) { console.error('monthly', e); }
  try { renderSchedule(); }     catch (e) { console.error('schedule', e); }
  try { renderOtBreak(); }      catch (e) { console.error('otbreak', e); }
  try { renderLeaves(); }       catch (e) { console.error('leave', e); }
  try { renderResources(); }    catch (e) { console.error('resources', e); }
  setTimeout(resizeCharts, 30);
}

function setPage(p) {
  PAGE = p;
  var cap = p.charAt(0).toUpperCase() + p.slice(1);
  document.querySelectorAll('.page').forEach(function (s) { s.hidden = s.id !== 'page' + cap; });
  document.querySelectorAll('.nav-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-page') === p);
  });
  var m = PAGE_META[p] || ['', ''];
  $('pageTitle').textContent = m[0];
  $('pageSub').textContent = m[1];
  // Schedule, OT&Break, Leave, Scorecards & Monthly use their own controls, not the global filter bar
  var filters = $('filters');
  if (filters) filters.style.display = (p === 'schedule' || p === 'otbreak' || p === 'leave' || p === 'scorecards' || p === 'monthly' || p === 'resources') ? 'none' : '';
  closeNav();
  window.scrollTo(0, 0);
  setTimeout(resizeCharts, 40);   // charts sized inside a hidden box measure 0
}

function openNav() { $('sidebar').classList.add('open'); $('backdrop').classList.add('show'); }
function closeNav() { $('sidebar').classList.remove('open'); $('backdrop').classList.remove('show'); }

/** Populate filter dropdowns from the data - nothing hard-coded. */
function fillSelects() {
  if (!DATA) return;
  var a = $('fAgent'), w = $('fWeek');

  var agents = allAgents(DATA);
  var keepA = F.agent;
  a.innerHTML = '<option value="ALL">All Agents</option>' +
    agents.map(function (x) { return '<option value="' + esc(x) + '">' + esc(x) + '</option>'; }).join('');
  a.value = agents.indexOf(keepA) >= 0 ? keepA : 'ALL';
  F.agent = a.value;

  var weeks = allWeeks(DATA);
  var keepW = F.week;
  var now = thisWeekStart();
  // "Current/Previous" are anchored to today, not to the furthest future roster week
  var past = weeks.filter(function (x) { return x <= now; });
  var cur = past[0] || weeks[0];
  var prev = past[1];
  var opts = ['<option value="ALL">All Weeks</option>'];
  if (cur)  opts.push('<option value="' + esc(cur) + '">Current Week (' + fmtWeek(cur) + ')</option>');
  if (prev) opts.push('<option value="' + esc(prev) + '">Previous Week (' + fmtWeek(prev) + ')</option>');
  weeks.forEach(function (x) {
    if (x === cur || x === prev) return;
    opts.push('<option value="' + esc(x) + '">' + fmtWeek(x) + (x > now ? ' (upcoming)' : '') + '</option>');
  });
  w.innerHTML = opts.join('');
  w.value = weeks.indexOf(keepW) >= 0 ? keepW : 'ALL';
  F.week = w.value;
}

function wire() {
  document.querySelectorAll('.nav-btn').forEach(function (b) {
    b.onclick = function () { setPage(b.getAttribute('data-page')); };
  });
  $('navToggle').onclick = function () {
    $('sidebar').classList.contains('open') ? closeNav() : openNav();
  };
  $('backdrop').onclick = closeNav;

  $('fAgent').onchange = function () { F.agent = this.value; render(); };
  $('fWeek').onchange  = function () {
    F.week = this.value;
    render();
  };
  $('btnReset').onclick = function () {
    F = { agent: 'ALL', week: 'ALL', moMonth: '', moAgent: '', lvMonth: '', qaAgent: 'ALL', scAgent: '', scWeek: '',
          tsWeek: '', otWeek: '', scRankWeek: '', from: '', to: '' };
    $('fAgent').value = 'ALL'; $('fWeek').value = 'ALL';
    ['otWeek', 'scRankWeek'].forEach(function (id) { if ($(id)) $(id).value = ''; });
    ['prSearch', 'clSearch', 'scSearch', 'bkSearch']
      .forEach(function (id) { if ($(id)) $(id).value = ''; });
    ['prTable', 'clTable', 'scTable', 'bkTable']
      .forEach(function (id) { if ($(id) && $(id)._st) { $(id)._st.q = ''; $(id)._st.page = 1; } });
    render();
    toast('Filters reset.');
  };

  $('btnRefresh').onclick = function () { fetchData(true); };

  document.querySelectorAll('#obTabs .tab').forEach(function (t) {
    t.onclick = function () {
      document.querySelectorAll('#obTabs .tab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      var k = t.getAttribute('data-tab');
      $('obOt').hidden = k !== 'ot';
      $('obBrk').hidden = k !== 'brk';
      setTimeout(resizeCharts, 30);
    };
  });

  wireSearch('prSearch', 'prTable');
  wireSearch('clSearch', 'clTable');
  wireSearch('scSearch', 'scTable');
  wireSearch('bkSearch', 'bkTable');

  // OT & Break: week selector (matches the Schedule pattern)
  function bindRange(id, key) {
    var el = $(id);
    if (!el) return;
    el.onchange = function () { F[key] = this.value; renderOtBreak(); };
  }
  ['otWeek'].forEach(function (id) { bindRange(id, id); });

  // ---- Leave Request PIN gate (Option B) ----
  var lf = $('leaveForm');
  var lvPin = $('lvPin');
  var lvAgent = $('lvAgent');
  var pinMsg = $('pinMsg');
  var lvFormLocked = true; // agent must unlock with PIN before submitting

  function verifyPin() {
    var pins = (window.DASHBOARD_CONFIG && window.DASHBOARD_CONFIG.agentPins) || {};
    var code = (lvPin.value || '').trim();
    if (!code) {
      lvFormLocked = true;
      lvAgent.value = '';
      lvAgent.placeholder = 'Locked - enter PIN';
      lvPin.className = '';
      if (pinMsg) { pinMsg.hidden = true; }
      return;
    }
    var matched = null;
    for (var name in pins) { if (pins[name] === code) { matched = name; break; } }
    if (matched) {
      lvFormLocked = false;
      lvAgent.value = matched;
      lvAgent.placeholder = matched;
      lvPin.className = 'ok-input';
      if (pinMsg) { pinMsg.hidden = false; pinMsg.className = 'cf-msg ok'; pinMsg.textContent = 'Unlocked as ' + matched + '.'; }
    } else {
      lvFormLocked = true;
      lvAgent.value = '';
      lvAgent.placeholder = 'Locked - wrong PIN';
      lvPin.className = 'err-input';
      if (pinMsg) { pinMsg.hidden = false; pinMsg.className = 'cf-msg err'; pinMsg.textContent = 'Wrong PIN. Try again.'; }
    }
  }
  if (lvPin) lvPin.addEventListener('input', verifyPin);

  if (lf) lf.onsubmit = function (e) {
    e.preventDefault();
    if (lvFormLocked || !lvAgent.value) {
      if (pinMsg) { pinMsg.hidden = false; pinMsg.className = 'cf-msg err'; pinMsg.textContent = 'Enter your 4-digit PIN to unlock the form first.'; }
      toast('Enter your 4-digit PIN to unlock the form first.', 'err');
      return;
    }
    var details = ($('lvDetails').value || '').trim();
    if (!details) {
      $('lvDetails').className = 'err-input';
      if (pinMsg) { pinMsg.hidden = false; pinMsg.className = 'cf-msg err'; pinMsg.textContent = 'Details are required. Please add a note before submitting.'; }
      toast('Details are required - please add a note before submitting.', 'err');
      $('lvDetails').focus();
      return;
    }
    var payload = {
      agent: lvAgent.value,
      leaveType: $('lvType').value,
      reason: $('lvReason').value,
      date: $('lvDate').value,
      details: details
    };
    submitLeave(payload).then(function (res) {
      var note = $('leaveNote');
      if (res && res.ok) {
        note.textContent = res.local
          ? 'Saved locally (no sheet endpoint configured). It will appear after the next sync once wired.'
          : 'Submitted to the leave sheet as ' + lvAgent.value + '.';
        note.className = 'cf-msg ok';
        toast('Your leave request has been processed. ' + lvAgent.value + ', it is now Pending approval.', 'ok');
        lf.reset();
        lvFormLocked = true;
        lvAgent.value = '';
        lvAgent.placeholder = 'Locked - enter PIN';
        if (pinMsg) { pinMsg.hidden = true; }
        renderLeaves();
      } else {
        note.textContent = 'Submission failed. Please try again.';
        note.className = 'cf-msg err';
        toast('Submission failed. Please try again.', 'err');
      }
    });
  };

  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(resizeCharts, 160); });
}

/* Resources page: a curated, editable library - no Agent/Week filters.
 * Edit the arrays below to change what shows. */
var RESOURCE_DATA = {
  links: [
    { t: 'Team Resources Sheet', d: 'Live shared spreadsheet', u: 'https://docs.google.com/spreadsheets/d/1H6OP8ZFmYZUdFuT0ZAI-0QPdVf_6Z4L6PISUoh46h3k/edit?gid=0#gid=0' }
  ],
  guides: [],
  contacts: []
};

function renderResources() {
  var map = { resLinks: 'links', resGuides: 'guides', resContacts: 'contacts' };
  Object.keys(map).forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.innerHTML = (RESOURCE_DATA[map[id]] || []).map(function (r) {
      return '<a class="res-card" href="' + esc(r.u) + '" target="_blank" rel="noopener">' +
        '<div class="res-t">' + esc(r.t) + '</div>' +
        '<div class="res-d">' + esc(r.d) + '</div></a>';
    }).join('');
  });
}

/* Snapshot mode: the data cannot change while the page is open, so there is
 * nothing to poll for. Refresh Data re-reads and re-renders on demand. */
function init() {
  wire();
  setPage('overview');
  fetchData(false);
}

document.addEventListener('DOMContentLoaded', init);
