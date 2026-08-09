/**
 * Team Weekly QA & Performance Dashboard
 * FILE 5 of 6  ->  LeaveSubmit.gs
 *
 * Lets an agent file a leave request from the dashboard. The new row is
 * appended to the 'Leave Request Sheet' with status Pending, exactly matching
 * the sheet's existing column order and value vocabulary.
 *
 * SECURITY NOTES
 *  - The browser never learns the Sheet ID; it only calls the Web App URL.
 *  - This endpoint can ONLY append a leave row. It cannot read, edit or
 *    delete anything else in either spreadsheet.
 *  - Every submission is validated against the sheet's real dropdown values,
 *    so a crafted request cannot inject arbitrary content.
 *  - Nothing is ever auto-approved: status is always forced to 'Pending'.
 */

var LEAVE_TAB = 'Leave Request Sheet';

/* The sheet's own vocabulary - submissions must match these exactly. */
var LEAVE_TYPES   = ['Off Adjustment', 'Half Day LWOP', 'Whole Day LWOP'];
var LEAVE_REASONS = ['Birthday/Family Celebration', 'Medical Appointment',
                     'Personal Errands', 'Attending an Event'];

/** Column order of 'Leave Request Sheet' (0-based), verified against the sheet. */
var LV_MONTH = 0, LV_AGENT = 1, LV_TYPE = 2, LV_REASON = 3, LV_DETAILS = 4,
    LV_MANILA = 5, LV_PST = 6, LV_STATUS = 7, LV_APPROVED_ON = 8, LV_NOTES = 9;

/**
 * POST handler. Accepts form-encoded or JSON body:
 *   { action:'submitLeave', agent, leaveType, reason, date:'YYYY-MM-DD', details }
 */
function doPost(e) {
  var out = { ok: false };
  try {
    var p = parseBody(e);
    if (p.action !== 'submitLeave') throw new Error('Unknown action.');
    out = submitLeave(p);
    out.ok = true;
  } catch (err) {
    out.ok = false;
    out.error = String(err && err.message ? err.message : err);
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseBody(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    var raw = e.postData.contents;
    // form-encoded (used by the dashboard to avoid a CORS preflight)
    if (raw.indexOf('=') > -1 && raw.indexOf('{') !== 0) {
      var o = {};
      raw.split('&').forEach(function (kv) {
        var i = kv.indexOf('=');
        if (i > 0) o[decodeURIComponent(kv.slice(0, i))] =
                     decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
      });
      if (o.payload) { try { return JSON.parse(o.payload); } catch (x) {} }
      return o;
    }
    try { return JSON.parse(raw); } catch (x) {}
  }
  return e.parameter || {};
}

function oneOf(v, list, label) {
  var s = S(v);
  for (var i = 0; i < list.length; i++) {
    if (list[i].toLowerCase() === s.toLowerCase()) return list[i];
  }
  throw new Error('Please choose a valid ' + label + '.');
}

/** 'YYYY-MM-DD' -> Date at local noon (noon avoids timezone date-shift). */
function parseYmd(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(S(s));
  if (!m) throw new Error('Please choose a valid leave date.');
  var d = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  if (isNaN(d)) throw new Error('Please choose a valid leave date.');
  return d;
}

function submitLeave(p) {
  var ss = SpreadsheetApp.openById(getSchedSheetId());
  var sh = ss.getSheetByName(LEAVE_TAB);
  if (!sh) throw new Error('Leave Request Sheet not found.');

  // ---- validate every field against the sheet's real vocabulary ----
  var agent = S(p.agent);
  if (!agent) throw new Error('Please select your name.');
  agent = matchExistingAgent(sh, agent);

  var type   = oneOf(p.leaveType, LEAVE_TYPES, 'leave type');
  var reason = oneOf(p.reason, LEAVE_REASONS, 'reason');

  var manila = parseYmd(p.date);
  if (manila.getFullYear() !== DATA_YEAR) {
    throw new Error('Leave dates must be within ' + DATA_YEAR + '.');
  }
  // PST date is one day behind Manila (matches every existing row)
  var pst = new Date(manila.getTime() - 24 * 60 * 60 * 1000);

  var details = S(p.details).slice(0, 300);

  // ---- duplicate guard ----
  var last = sh.getLastRow();
  if (last > 1) {
    var existing = sh.getRange(2, 1, last - 1, 8).getValues();
    for (var i = 0; i < existing.length; i++) {
      var r = existing[i];
      if (S(r[LV_AGENT]).toLowerCase() === agent.toLowerCase() &&
          isDate(r[LV_MANILA]) && sameDay(r[LV_MANILA], manila)) {
        throw new Error('A leave request for ' + agent + ' on that date already exists.');
      }
    }
  }

  // ---- append, matching the existing column layout ----
  var row = [];
  row[LV_MONTH]  = monthName(manila);
  row[LV_AGENT]  = agent;
  row[LV_TYPE]   = type;
  row[LV_REASON] = reason;
  row[LV_DETAILS] = details;
  row[LV_MANILA] = manila;
  row[LV_PST]    = pst;
  row[LV_STATUS] = 'Pending';          // never auto-approved
  row[LV_APPROVED_ON] = '';
  row[LV_NOTES]  = 'Filed via dashboard ' + fmtStampSheet(new Date());
  for (var c = 0; c < 10; c++) if (row[c] === undefined) row[c] = '';

  var target = firstEmptyLeaveRow(sh);
  sh.getRange(target, 1, 1, row.length).setValues([row]);
  sh.getRange(target, LV_MANILA + 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(target, LV_PST + 1).setNumberFormat('yyyy-mm-dd');

  return {
    message: 'Leave request submitted and is now Pending approval.',
    row: target,
    saved: { agent: agent, leaveType: type, reason: reason,
             date: p.date, status: 'Pending' }
  };
}

/**
 * The sheet uses short names ('Dan Mae David', 'Claudette Ibong') while the
 * dashboard shows full names. Reuse the sheet's own spelling when we can, so
 * the new row groups with that agent's existing rows.
 */
function matchExistingAgent(sh, incoming) {
  var last = sh.getLastRow();
  if (last > 1) {
    var names = sh.getRange(2, LV_AGENT + 1, last - 1, 1).getValues();
    var want = canonAgent(incoming);
    for (var i = 0; i < names.length; i++) {
      var n = S(names[i][0]);
      if (n && canonAgent(n) === want) return n;   // sheet's own spelling wins
    }
  }
  return incoming;
}

function firstEmptyLeaveRow(sh) {
  var last = sh.getLastRow();
  // the tab has ~893 blank formatted rows; find the first truly empty one
  if (last > 1) {
    var vals = sh.getRange(2, 1, last - 1, 8).getValues();
    for (var i = 0; i < vals.length; i++) {
      var blank = true;
      for (var c = 0; c < vals[i].length; c++) {
        if (S(vals[i][c])) { blank = false; break; }
      }
      if (blank) return i + 2;
    }
  }
  return last + 1;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function monthName(d) {
  return ['January','February','March','April','May','June','July',
          'August','September','October','November','December'][d.getMonth()];
}

function fmtStampSheet(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Manila', 'MMM d, yyyy');
}

/** Options for the dashboard's leave form - always from the live sheet. */
function leaveFormOptions() {
  return { leaveTypes: LEAVE_TYPES, reasons: LEAVE_REASONS };
}
