/**
 * Team Performance Dashboard - Leave Request submitter (SELF-CONTAINED)
 *
 * Paste this ENTIRE file into a new Apps Script project bound to your
 * schedule spreadsheet (the one that holds the "Leave Request Sheet" tab),
 * then Deploy > New deployment > Web app:
 *   - Execute as:  Me
 *   - Who has access: Anyone
 * Copy the Web app URL and paste it into the dashboard's config.js:
 *   window.DASHBOARD_CONFIG.leaveWebAppUrl = 'https://script.google.com/...';
 *
 * What it does:
 *   - Appends one row to "Leave Request Sheet" with status forced to Pending.
 *   - Validates every field against the sheet's real dropdown vocabulary, so a
 *     crafted request can't inject bad values.
 *   - Cannot read, edit or delete anything else in the spreadsheet.
 *   - Never auto-approves.
 *
 * SECURITY: the browser only ever sees this Web App URL - never a Sheet ID or
 * credentials. The endpoint can ONLY append a leave row.
 */

var LEAVE_TAB = 'Leave Request Sheet';

/* The schedule spreadsheet that holds the Leave Request Sheet tab.
 * (Sheet IDs are not secrets - the same value is already referenced by the
 * dashboard's GitHub Action. Binding the script to that spreadsheet lets
 * getActiveSpreadsheet() work too, so this is only a fallback.) */
var SCHED_SHEET_ID = '1rLP2iXwK_0bjEOXt2_rH9brqcXecdrkVupVk2U1-5L8';
var DATA_YEAR = 2026;

/* Must match the dashboard's leave-form dropdowns EXACTLY. */
var LEAVE_TYPES   = ['Off Adjustment', 'Half Day LWOP', 'Whole Day LWOP'];
var LEAVE_REASONS = ['Birthday/Family Celebration', 'Medical Appointment',
                     'Personal Emergency', 'Others'];

/* Column order of "Leave Request Sheet" (0-based), verified against the tab. */
var LV_MONTH = 0, LV_AGENT = 1, LV_TYPE = 2, LV_REASON = 3, LV_DETAILS = 4,
    LV_MANILA = 5, LV_PST = 6, LV_STATUS = 7, LV_APPROVED_ON = 8, LV_NOTES = 9;

/* ---------------- tiny helpers (self-contained) ---------------- */
function S(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }

function canonAgent(v) {
  return S(v).toLowerCase()
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDate(v) {
  if (v instanceof Date) return !isNaN(v.getTime());
  var d = new Date(v);
  return !isNaN(d.getTime());
}

function getSchedSheetId() { return SCHED_SHEET_ID; }

/* ---------------- POST handler ---------------- */
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

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'leave-submit' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseBody(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    var raw = e.postData.contents;
    // form-encoded wrapper (used by the dashboard to avoid a CORS preflight)
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

function parseYmd(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(S(s));
  if (!m) throw new Error('Please choose a valid leave date.');
  var d = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  if (isNaN(d)) throw new Error('Please choose a valid leave date.');
  return d;
}

function submitLeave(p) {
  var ss = (typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.getActiveSpreadsheet())
           ? SpreadsheetApp.getActiveSpreadsheet()
           : SpreadsheetApp.openById(getSchedSheetId());
  var sh = ss.getSheetByName(LEAVE_TAB);
  if (!sh) throw new Error('Leave Request Sheet not found.');

  // accept either dashboard field name
  var dateStr = p.date || p.dateManila;

  var agent = S(p.agent);
  if (!agent) throw new Error('Please select your name.');
  agent = matchExistingAgent(sh, agent);

  var type   = oneOf(p.leaveType, LEAVE_TYPES, 'leave type');
  var reason = oneOf(p.reason, LEAVE_REASONS, 'reason');

  var manila = parseYmd(dateStr);
  if (manila.getFullYear() !== DATA_YEAR) {
    throw new Error('Leave dates must be within ' + DATA_YEAR + '.');
  }
  // PST is one day behind Manila (matches every existing row)
  var pst = new Date(manila.getTime() - 24 * 60 * 60 * 1000);

  var details = S(p.details).slice(0, 300);

  // duplicate guard
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

  var row = [];
  row[LV_MONTH]       = monthName(manila);
  row[LV_AGENT]       = agent;
  row[LV_TYPE]        = type;
  row[LV_REASON]      = reason;
  row[LV_DETAILS]     = details;
  row[LV_MANILA]      = manila;
  row[LV_PST]         = pst;
  row[LV_STATUS]      = 'Pending';   // never auto-approved
  row[LV_APPROVED_ON] = '';
  row[LV_NOTES]       = 'Filed via dashboard ' + fmtStampSheet(new Date());
  for (var c = 0; c < 10; c++) if (row[c] === undefined) row[c] = '';

  var target = firstEmptyLeaveRow(sh);
  sh.getRange(target, 1, 1, row.length).setValues([row]);
  sh.getRange(target, LV_MANILA + 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(target, LV_PST + 1).setNumberFormat('yyyy-mm-dd');

  return {
    message: 'Leave request submitted and is now Pending approval.',
    row: target,
    saved: { agent: agent, leaveType: type, reason: reason, date: dateStr, status: 'Pending' }
  };
}

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
  try {
    return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Manila', 'MMM d, yyyy');
  } catch (e) { return String(d); }
}
