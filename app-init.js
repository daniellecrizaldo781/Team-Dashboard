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
    { t: 'Follow up Refund Sheet', d: 'For customers that are reporting that refunds marked as successful have not been received after 10 business days. For refunds showing as failed, retry processing after an hour. If the refund fails again, please track the issue.', u: 'https://docs.google.com/spreadsheets/d/1e93ydbpPOt_ucH8DabDwfa65AqheLpcXAysfgfdVVYA/edit?gid=155669863#gid=155669863' },
    { t: 'CSR Manual Creation Tracker', d: 'This escalation sheet is used to document and track all brands that require manual order creation or reshipment requests.', u: 'https://docs.google.com/spreadsheets/d/1nsEKMBc34_QiHxorGuJOv6B34-3m8CEgNokPlVZaAag/edit?gid=1414496553#gid=1414496553' },
    { t: 'DHL Reshipment Claim Sheet', d: 'This escalation sheet is used as a tracker to log customer-reported tracking or packing issues—such as lost or delayed shipments, incorrect delivery, damaged items, incomplete orders, or wrong items—so the warehouse team can quickly investigate and resolve them', u: 'https://docs.google.com/spreadsheets/d/1Puj4kVn4hxKTCCKHU79wtPUc9kF879Z-/edit?pli=1&gid=1626765804#gid=1626765804' },
    { t: 'Marketing Email Tracker', d: 'These emails must be responded to as required, must not be closed or merged, and should always be assigned to Mary Rose Panti for tracking and monitoring.', u: 'https://docs.google.com/spreadsheets/d/19EqtioMwsh-uE0GcaZyXgQ7KoUa4YJbazdkYSq6ZnnI/edit?usp=sharing' },
    { t: 'Shopify Refund Sheet', d: 'This escalation sheet is used to track Shopify Refund Requests & Follow Ups. Orders should be escalated for refund if they cannot be found in Sticky but are created in Shiphero. If the order does not appear under the customer’s email, search using the customer’s name or any other available details. All possible search methods must be exhausted before proceeding with escalation.', u: 'https://docs.google.com/spreadsheets/d/1_tsC9xyqbQvMILQ0zHcCiQGEcGUy-AOlvjxB3FwPfYA/edit?gid=0#gid=0' },
    { t: 'Amazon | Walmart | Ebay Sheet', d: 'This escalation sheet is used to track Amazon, Walmart, and eBay inquiries for orders that were placed directly through these marketplaces and requesting proper review and follow-up.', u: 'https://docs.google.com/spreadsheets/d/1_tsC9xyqbQvMILQ0zHcCiQGEcGUy-AOlvjxB3FwPfYA/edit?gid=0#gid=0' },
    { t: 'OHA Refund Pushback Tagging', d: 'This escalation sheet is used for OHA Refund Push Back Tagging on OHA orders where Save and Upgrade offers have already been made and require proper tagging and follow-up.', u: 'https://docs.google.com/spreadsheets/d/10Pas0kcWf7uM5IJInfUGz0Ry8fSlMPdRhN8iw__Zajg/edit?usp=sharing' },
    { t: 'OHA Hearing Specialist Referrals / Consultation Portal', d: 'This escalation sheet is used for OHA Refund Push Back Tagging on OHA orders where Save and Upgrade offers have already been made and require proper tagging and follow-up.', u: 'https://specialist-training-portal.vercel.app/portal' },
    { t: 'NEW Undelivered Message Escalation', d: 'This escalation sheet is used to track and manage email messages that failed to send or were returned as undeliverable, ensuring timely investigation and resolution of delivery issues.', u: 'https://docs.google.com/spreadsheets/d/1qHKkhldX64HF81brktLcfHY6RCIAr7XQwAdvhbjWxU0/edit?gid=925490607#gid=925490607' },
    { t: 'Return Label Request for  Customers without valid email (socmed)', d: 'This escalation sheet is used to document and track return label requests for customers who cannot receive emails, ensuring their return labels are sent through Facebook Messenger when email delivery is not possible. This helps maintain a seamless, reliable, and well-tracked alternative communication method.', u: 'https://docs.google.com/spreadsheets/d/1_IKymCZEXIC9OMNJPvUUkPd5SYakB_z-YozLAXbQmEY/edit?gid=0#gid=0' },
    { t: 'Request Follow-up Escalation Sheet', d: 'Use this tracking sheet to escalate customers who call to follow up on an email response regarding their return request. Logging these cases enables coordination with the Email Team and allows us to request priority handling for customers awaiting a response.', u: 'https://docs.google.com/spreadsheets/d/1g6qqyLzbwPFD482kW_YbYEOacj05eJuVrQS5ddpr338/edit?gid=0#gid=0' },
    { t: 'Shopify CX Details Updating Sheet', d: 'Use this link to escalate customer requests for updating their name, email address, or phone number. Before escalating, make sure the customer’s details have been updated in both Sticky and ShipHero so the information remains consistent across systems.', u: 'https://docs.google.com/spreadsheets/d/10JTg3sfpzXYDfRkm079BU0vUL7bZPcmE6lwY3pp6hJ4/edit?gid=0#gid=0' },
    { t: 'Outbound Sales', d: 'This escalation sheet is used for customers requesting to place an order through phone call', u: 'https://docs.google.com/spreadsheets/d/11R-CosEoediUOVnUIHj2uI_2lKv9syOnNaBtLaIjr9Q/edit?gid=316129417#gid=316129417' }
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
