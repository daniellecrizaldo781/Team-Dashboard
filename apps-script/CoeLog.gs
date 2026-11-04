/**
 * COE Request logger (SELF-CONTAINED)
 *
 * Bind this to your COE Request spreadsheet (the one with the "COE Request"
 * tab), then Deploy > New deployment > Web app:
 *   - Execute as:  Me
 *   - Who has access: Anyone
 * Copy the Web app URL and paste it into config.js:
 *   window.DASHBOARD_CONFIG.coeLogWebAppUrl = 'https://script.google.com/...';
 *
 * What it does:
 *   - Validates the submitted agent against the COE Request tab.
 *   - Appends one row to the "COE Request Log" tab: date/time, agent, email,
 *     start date, hourly rate, and the IP it came from (best-effort).
 *   - Cannot read, edit or delete anything else.
 *
 * SECURITY: the browser only ever sees this Web App URL - never a Sheet ID or
 * credentials. The endpoint can ONLY append one COE log row.
 */

var COE_TAB = 'COE Request';
var COE_LOG_TAB = 'COE Request Log';
/* Fallback sheet ID (same value referenced by the dashboard's pipeline); binding
 * the script to the spreadsheet makes getActiveSpreadsheet() work instead. */
var COE_SHEET_ID = '1FlRJc9sMx7vW96gD3jMninQz8oqegMTS3qR5WwcQbVg';

/* ---------------- tiny helpers ---------------- */
function SV(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }

function doPost(e) {
  var out = { ok: false };
  try {
    var p = parseBody(e);
    if (p.action !== 'logCoe') throw new Error('Unknown action.');
    out = logCoe(p, e);
    out.ok = true;
  } catch (err) {
    out.ok = false;
    out.error = String(err && err.message ? err.message : err);
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'coe-log' }))
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

function coeDateText(c) {
  if (c instanceof Date) {
    var y = c.getFullYear(), m = c.getMonth() + 1, d = c.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  return SV(c);
}

function getCoeSheet() {
  try {
    if (typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.getActiveSpreadsheet()) {
      return SpreadsheetApp.getActiveSpreadsheet();
    }
  } catch (e) {}
  return SpreadsheetApp.openById(COE_SHEET_ID);
}

function logCoe(p) {
  var ss = getCoeSheet();

  // validate the agent against the COE Request tab (spelling wins from the sheet)
  var src = ss.getSheetByName(COE_TAB);
  if (!src) throw new Error('COE Request tab not found.');
  var srcLast = src.getLastRow();
  var agent = SV(p.agent);
  if (!agent) throw new Error('Please select your name.');
  var want = agent.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  var srcRows = srcLast > 1 ? src.getRange(2, 1, srcLast - 1, 3).getValues() : [];
  var email = '', start = '';
  var matched = null;
  for (var r = 0; r < srcRows.length; r++) {
    var n = SV(srcRows[r][0]);
    if (n && n.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim() === want) {
      matched = n; email = SV(srcRows[r][2]); start = coeDateText(srcRows[r][1]); break;
    }
  }
  if (!matched) throw new Error('Agent not found in the COE Request sheet.');
  agent = matched;

  // make the log tab
  var lg = ss.getSheetByName(COE_LOG_TAB);
  if (!lg) {
    lg = ss.insertSheet(COE_LOG_TAB);
    lg.appendRow(['Requested At (PST)', 'Agent', 'Email', 'Start Date', 'Hourly Rate', 'IP', 'Issue Date']);
    lg.getRange(1, 1, 1, 7).setFontWeight('bold');
  }

  var now = new Date();
  lg.appendRow([
    Utilities.formatDate(now, Session.getScriptTimeZone() || 'America/Los_Angeles', 'yyyy-MM-dd HH:mm:ss'),
    agent, email, start, SV(p.rate), SV(p.ip), SV(p.issueDate)
  ]);
  var last = lg.getLastRow();
  lg.getRange(last, 4).setNumberFormat('yyyy-mm-dd');
  if (last !== 1) lg.getRange(last, 7).setNumberFormat('yyyy-mm-dd');

  return { message: 'COE request logged successfully.', row: last, saved: { agent: agent, when: String(now) } };
}
