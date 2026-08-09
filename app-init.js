/* ============================================================
 * app-init.js - dispatcher, navigation, filters, auto-refresh
 * ============================================================ */

var PAGE_META = {
  overview:     ['Overview', 'Team performance at a glance'],
  productivity: ['Daily Productivity', 'Daily ticket handling and productivity vs target'],
  calls:        ['Weekly Call Stats', 'Call volume and pickup performance by week'],
  qa:           ['QA Scores', 'Quality evaluations and rankings for all agents'],
  scorecards:   ['Scorecards', 'Official overall scores and team ranking'],
  schedule:     ['Team Schedule', 'Shifts and rest days by agent'],
  otbreak:      ['OT & Break Schedule', 'Overtime and break assignments'],
  leave:        ['Leave Requests', 'File and view leave requests'],
};

/** Single dispatcher - every page re-renders from current filter state. */
function render() {
  if (!DATA) return;
  try { renderOverview(); }     catch (e) { console.error('overview', e); }
  try { renderProductivity(); } catch (e) { console.error('productivity', e); }
  try { renderCalls(); }        catch (e) { console.error('calls', e); }
  try { renderQa(); }           catch (e) { console.error('qa', e); }
  try { renderScorecards(); }   catch (e) { console.error('scorecards', e); }
  try { renderSchedule(); }     catch (e) { console.error('schedule', e); }
  try { renderOtBreak(); }      catch (e) { console.error('otbreak', e); }
  try { renderLeaves(); }       catch (e) { console.error('leave', e); }
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
    // a specific week supersedes an explicit date range
    if (F.week !== 'ALL') { F.from = ''; F.to = ''; $('fFrom').value = ''; $('fTo').value = ''; }
    render();
  };
  $('fFrom').onchange = function () {
    F.from = this.value;
    if (F.from && F.week !== 'ALL') { F.week = 'ALL'; $('fWeek').value = 'ALL'; }
    render();
  };
  $('fTo').onchange = function () {
    F.to = this.value;
    if (F.to && F.week !== 'ALL') { F.week = 'ALL'; $('fWeek').value = 'ALL'; }
    render();
  };
  $('btnReset').onclick = function () {
    F = { agent: 'ALL', week: 'ALL', from: '', to: '' };
    $('fAgent').value = 'ALL'; $('fWeek').value = 'ALL';
    $('fFrom').value = ''; $('fTo').value = '';
    ['prSearch', 'clSearch', 'qaSearch', 'scSearch', 'tsSearch', 'otSearch', 'bkSearch', 'lvSearch']
      .forEach(function (id) { if ($(id)) $(id).value = ''; });
    ['prTable', 'clTable', 'qaTable', 'qaRank', 'scTable', 'scDetail', 'tsTable', 'otTable', 'bkTable', 'lvTable']
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
  wireSearch('qaSearch', 'qaTable');
  wireSearch('scSearch', 'scTable');
  wireSearch('tsSearch', 'tsTable');
  wireSearch('otSearch', 'otTable');
  wireSearch('bkSearch', 'bkTable');
  wireSearch('lvSearch', 'lvTable');

  var lf = $('leaveForm');
  if (lf) lf.onsubmit = function (e) {
    e.preventDefault();
    var payload = {
      agent: $('lvAgent').value,
      leaveType: $('lvType').value,
      reason: $('lvReason').value,
      dateManila: $('lvDate').value,
      details: $('lvDetails').value
    };
    submitLeave(payload).then(function (res) {
      var note = $('leaveNote');
      if (res && res.ok) {
        note.textContent = res.local
          ? 'Saved locally (no sheet endpoint configured). It will appear after the next sync once wired.'
          : 'Submitted to the leave sheet.';
        note.className = 'leave-note ok';
        lf.reset();
        renderLeaves();
      } else {
        note.textContent = 'Submission failed. Please try again.';
        note.className = 'leave-note bad';
      }
    });
  };

  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(resizeCharts, 160); });
}

/* Snapshot mode: the data cannot change while the page is open, so there is
 * nothing to poll for. Refresh Data re-reads and re-renders on demand. */
function init() {
  wire();
  setPage('overview');
  fetchData(false);
}

document.addEventListener('DOMContentLoaded', init);
