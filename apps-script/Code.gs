/**
 * Team Weekly QA & Performance Dashboard - secure JSON API
 * FILE 1 of 4  ->  Code.gs
 *
 * The Sheet IDs are NOT written in this file. They are stored as Script
 * Properties (Apps Script's built-in secret store), so the IDs never appear
 * in the code, in the repository, or in the browser.
 *
 * ONE-TIME SETUP: run setSecrets() once (see Secrets.gs), then delete the
 * two IDs you pasted there. After that the values live only in Script
 * Properties, which are visible only to you as the project owner.
 */

/** Reads a secret from Script Properties. Throws a clear error if missing. */
function secret(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) {
    throw new Error(
      'Missing Script Property "' + key + '". Open Apps Script -> Project Settings -> ' +
      'Script Properties and add it, or run setSecrets() once from Secrets.gs.');
  }
  return v.trim();
}

function getPerfSheetId()  { return secret('PERF_SHEET_ID'); }
function getSchedSheetId() { return secret('SCHED_SHEET_ID'); }

/** Publish only data on/after this date. The dashboard opened in August 2026,
 * so everything before 2026-08-01 is excluded (per request). */
var DATA_FROM = '2026-08-01';

/** Schedule-type datasets (Team Schedule, OT, Break) are capped at this date so
 * far-future roster weeks don't clutter the dashboard. Other datasets keep their
 * DATA_FROM lower bound only. */
var DATA_TO = '2026-08-31';

/** Publish only this calendar year's data. Change in one place if needed. */
var DATA_YEAR = 2026;

var QA_TABS = ['Dan','Godwin','Candy','Claudette','Sofhia','Cherry','Lyra','Mikka'];

/* Canonical agent names: QA tab -> full name used everywhere else */
var TAB_TO_AGENT = {
  'Dan':'Danielle Mae David', 'Godwin':'Godwin Arellano Reasol',
  'Candy':'Candy Laid', 'Claudette':'Mary Claudette Ibong',
  'Sofhia':'Sofhia Mae Santiago', 'Cherry':'Cherry Tubongbanua',
  'Lyra':'Lyra Miclat', 'Mikka':'Joemica Cari\u00f1o'
};

function doGet(e) {
  var mode = (e && e.parameter && e.parameter.mode) || 'data';
  var out = {};
  try {
    out = (mode === 'schema') ? buildSchema() : buildData();
    out.ok = true;
  } catch (err) {
    out.ok = false;
    out.error = String(err && err.message ? err.message : err);
  }
  out.lastUpdated = new Date().toISOString();
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- shared helpers ---------------- */

function S(v) { return (v === null || v === undefined) ? '' : String(v).replace(/\s+/g, ' ').trim(); }

function isDate(v) {
  if (v && typeof v === 'object' && typeof v.__d === 'string') return true;  // togrid.py date shape
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v);
}

/** Date -> 'YYYY-MM-DD' local, never round-tripped through UTC parsing. */
function iso(d) {
  if (d && typeof d === 'object' && typeof d.__d === 'string') return d.__d;  // togrid.py date shape
  if (!isDate(d)) return '';
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

/** Accepts a Date or a text date; returns ISO or ''. */
function toISO(v) {
  if (isDate(v)) return iso(v);
  var s = S(v);
  if (!s) return '';
  var d = new Date(s);
  return isNaN(d) ? '' : iso(d);
}

/** Monday of the week containing an ISO date. */
function weekStart(isoStr) {
  if (!isoStr) return '';
  var p = isoStr.split('-');
  var d = new Date(+p[0], +p[1] - 1, +p[2]);
  var dow = (d.getDay() + 6) % 7;         // Mon = 0
  d.setDate(d.getDate() - dow);
  return iso(d);
}

/** Number or null - strips %, commas, spaces. Never returns NaN. */
function num(v) {
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var s = S(v).replace(/[,%\s]/g, '');
  if (s === '' || /^(off|n\/a|na|-|--)$/i.test(s)) return null;
  var n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Reads a whole tab as a raw value grid; [] when the tab is absent/empty. */
function grid(ss, tabName) {
  var sh = ss.getSheetByName(tabName);
  if (!sh) return [];
  var lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 1 || lc < 1) return [];
  return sh.getRange(1, 1, lr, lc).getValues();
}

function canonAgent(name) {
  var s = S(name);
  if (!s) return '';
  // fold the known spelling drift in the source sheets
  var fixes = [
    [/^danielle?l? mae david$/i, 'Danielle Mae David'],
    [/^dan mae david$/i,         'Danielle Mae David'],
    [/^danielle david$/i,        'Danielle Mae David'],
    [/^godwin( arellano)?( reasol)?$/i, 'Godwin Arellano Reasol'],
    [/^godwin reasol$/i,         'Godwin Arellano Reasol'],
    [/^(mary )?claudette ibong$/i, 'Mary Claudette Ibong'],
    [/^sofhia (mae )?santiago$/i,  'Sofhia Mae Santiago'],
    [/^cherry tubong ?banua$/i,    'Cherry Tubongbanua'],
    [/^candy laid$/i,              'Candy Laid'],
    [/^lyra miclat$/i,             'Lyra Miclat'],
    [/^jo[ae]mica\s*(cari[n\u00f1]o|carnio|carino)$/i, 'Joemica Cari\u00f1o'],
    [/^cherry (rose )?tubong ?banua$/i, 'Cherry Tubongbanua']
  ];
  for (var i = 0; i < fixes.length; i++) if (fixes[i][0].test(s)) return fixes[i][1];
  // Surname-anchored folding: the sheets abbreviate the same person many ways
  // (e.g. 'Angel Pamaong' vs 'Leishel Angel Thea Pamaong').
  if (/^jo[ae]mica/i.test(s) || /cari[n\u00f1]o|carnio/i.test(s)) return 'Joemica Cari\u00f1o';
  if (/pamaong/i.test(s))   return 'Leishel Angel Thea Pamaong';
  if (/apuli/i.test(s))     return 'Dana Therese Apuli';
  if (/kowei/i.test(s))     return 'Jessica Chen Kowei';
  if (/tubong/i.test(s))    return 'Cherry Tubongbanua';
  if (/miclat/i.test(s))    return 'Lyra Miclat';
  if (/aliviado/i.test(s))  return 'Cynthia Mae Aliviado';
  if (/caralos/i.test(s))   return 'Ingred Caralos';
  return s;
}

/** True for rows that are clearly not an agent data row. */
function notAgentRow(s) {
  return !s || /^(name of agent|nam(e)? of agent|users|agent name|day|week|total|team|assig|overtime|daily productivity|attendance|hours|grand total)/i.test(s);
}

/* ---------------- schema (structure inspection) ---------------- */

function buildSchema() {
  return { mode: 'schema', performance: schemaOf(getPerfSheetId()), schedule: schemaOf(getSchedSheetId()) };
}

function schemaOf(id) {
  var ss = SpreadsheetApp.openById(id);
  return {
    title: ss.getName(),
    tabs: ss.getSheets().map(function (sh) {
      var lr = sh.getLastRow(), lc = sh.getLastColumn(), head = [], sample = [];
      if (lr > 0 && lc > 0) {
        var b = sh.getRange(1, 1, Math.min(6, lr), lc).getDisplayValues();
        head = b[0]; sample = b.slice(1);
      }
      return { name: sh.getName(), gid: sh.getSheetId(), rows: lr, cols: lc, firstRow: head, sampleRows: sample };
    })
  };
}

/* ---------------- main payload ---------------- */

function buildData() {
  var perf  = SpreadsheetApp.openById(getPerfSheetId());
  var sched = SpreadsheetApp.openById(getSchedSheetId());

  // one source failing must not kill the whole payload
  var d = {
    mode: 'data',
    warnings: [],
    dailyProductivity: safe(function () { return parseDailyProductivity(perf); }, [], 'dailyProductivity'),
    weeklyCallStats:   safe(function () { return parseWeeklyCallStats(perf); },   [], 'weeklyCallStats'),
    officialScorecard: safe(function () { return parseOfficialScorecard(perf); }, {weekly:[],monthly:[]}, 'officialScorecard'),
    qaScores:          safe(function () { return parseQA(perf); },                [], 'qaScores'),
    qaBreakdown:       safe(function () { return parseQaJacky(perf); },           [], 'qaBreakdown'),
    scorecards:        safe(function () { return parseScorecards(perf); },        [], 'scorecards'),
    monthlyScores:     safe(function () { return parseMonthly(perf); },           [], 'monthlyScores'),
    teamSchedule:      safe(function () { return parseTeamSchedule(sched); },     [], 'teamSchedule'),
    otSchedule:        safe(function () { return parseOT(sched); },               [], 'otSchedule'),
    breakSchedule:     safe(function () { return parseBreaks(sched); },           [], 'breakSchedule'),
    leaveRequests:     safe(function () { return parseLeave(sched); },            [], 'leaveRequests')
  };
  d.leaveFormOptions = safe(function () { return leaveFormOptions(); },
                            { leaveTypes: [], reasons: [] }, 'leaveFormOptions');
  d = restrictToYear(d, DATA_YEAR);
  // Scorecards stay full-history (the WEEKLY SCORECARD tab reaches back to
  // January); every other dataset is trimmed to on/after DATA_FROM (August).
  var scorecardsFull = d.scorecards;
  d = restrictFrom(d, DATA_FROM);
  d.scorecards = scorecardsFull;
  // Schedule-type datasets are also capped at DATA_TO so far-future roster
  // weeks (Sep/Oct) don't clutter the dashboard.
  ['teamSchedule', 'otSchedule', 'breakSchedule'].forEach(function (k) {
    if (Array.isArray(d[k])) d[k] = d[k].filter(function (r) { return rowFrom(r, DATA_FROM) && beforeTo(r, DATA_TO); });
  });
  d.dataYear = DATA_YEAR;
  d.dataFrom = DATA_FROM;
  d.dataTo = DATA_TO;
  d.warnings = WARN;
  return d;
}

/* ---------------- year restriction ---------------- */
/**
 * Only 2026 data is published. Filtering happens HERE, server-side, so
 * older rows never reach the browser at all.
 *
 * A row is kept when any of its date-ish fields (date / week / dateManila /
 * datePST / approvedOn) falls in DATA_YEAR. Rows carrying no date at all are
 * kept - e.g. the Break Schedule is a day-of-week grid with no dates, so
 * dropping it would silently empty that page.
 */
var DATE_KEYS = ['date', 'week', 'dateManila', 'datePST', 'approvedOn', 'weekStart'];

function inYear(v, year) {
  if (!v) return false;
  var s = toISO(v) || S(v);   // toISO handles real Dates, {"__d":...} AND plain strings
  var m = s.match(/(19|20)\d{2}/);
  return !!m && m[0] === String(year);
}

function rowInYear(r, year) {
  if (!r || typeof r !== 'object') return true;
  var sawDate = false;
  for (var i = 0; i < DATE_KEYS.length; i++) {
    var v = r[DATE_KEYS[i]];
    if (v === null || v === undefined || v === '') continue;
    sawDate = true;
    if (inYear(v, year)) return true;
  }
  return !sawDate;   // undated reference rows are kept
}

function restrictToYear(d, year) {
  Object.keys(d).forEach(function (k) {
    var v = d[k];
    if (Array.isArray(v)) {
      d[k] = v.filter(function (r) { return rowInYear(r, year); }).map(function (r) { return clampWeek(r, year); });
    } else if (v && typeof v === 'object' && (v.weekly || v.monthly)) {
      if (Array.isArray(v.weekly))  v.weekly  = v.weekly.filter(function (r) { return rowInYear(r, year); }).map(function (r) { return clampWeek(r, year); });
      if (Array.isArray(v.monthly)) v.monthly = v.monthly.filter(function (r) { return rowInYear(r, year); }).map(function (r) { return clampWeek(r, year); });
    }
  });
  return d;
}

/**
 * A week starting Mon Dec 29 2025 still contains Jan 1-4 2026. Those rows are
 * genuinely this year, so we keep them but pull the week label to Jan 1 -
 * otherwise the dashboard would show a "2025" week after the user deleted all
 * 2025 data, which looks like stale data leaking through.
 */
function clampWeek(r, year) {
  if (r && typeof r === 'object' && r.week && !inYear(r.week, year)) {
    var m = String(r.week).match(/^(\d{4})-/);
    if (m && +m[1] < year) r.week = year + '-01-01';
  }
  return r;
}

/* ---------------- date-from restriction ----------------
 * Keep only rows whose date is on/after DATA_FROM (2026-08-01), so the
 * dashboard covers the period it actually started in. A row carrying no date
 * at all is kept (reference grids like the Break Schedule), matching the
 * behaviour of restrictToYear.
 */
function rowFrom(r, fromISO) {
  if (!r || typeof r !== 'object') return true;
  var from = new Date(fromISO + 'T00:00:00');
  var sawDate = false;
  for (var i = 0; i < DATE_KEYS.length; i++) {
    var v = r[DATE_KEYS[i]];
    if (v === null || v === undefined || v === '') continue;
    sawDate = true;
    var isoStr = toISO(v);                     // handles real Date, {"__d":...} AND plain strings
    if (!isoStr) continue;
    var t = new Date(isoStr + 'T00:00:00').getTime();
    if (!isNaN(t) && t >= from.getTime()) return true;
  }
  return !sawDate;
}

/* Keep only rows whose date is on/before DATA_TO (inclusive). Used to cap
 * schedule datasets so future roster weeks don't appear. Undated rows kept. */
function beforeTo(r, toISOStr) {
  if (!r || typeof r !== 'object') return true;
  var to = new Date(toISOStr + 'T00:00:00');
  var sawDate = false;
  for (var i = 0; i < DATE_KEYS.length; i++) {
    var v = r[DATE_KEYS[i]];
    if (v === null || v === undefined || v === '') continue;
    sawDate = true;
    var isoStr = toISO(v);
    if (!isoStr) continue;
    var t = new Date(isoStr + 'T00:00:00').getTime();
    if (!isNaN(t) && t <= to.getTime()) return true;
  }
  return !sawDate;
}

function restrictFrom(d, fromISO) {
  Object.keys(d).forEach(function (k) {
    var v = d[k];
    if (Array.isArray(v)) {
      d[k] = v.filter(function (r) { return rowFrom(r, fromISO); });
    } else if (v && typeof v === 'object' && (v.weekly || v.monthly)) {
      if (Array.isArray(v.weekly))  v.weekly  = v.weekly.filter(function (r) { return rowFrom(r, fromISO); });
      if (Array.isArray(v.monthly)) v.monthly = v.monthly.filter(function (r) { return rowFrom(r, fromISO); });
    }
  });
  return d;
}

var WARN = [];
function safe(fn, fallback, label) {
  try { return fn(); }
  catch (err) { WARN.push(label + ': ' + (err && err.message ? err.message : err)); return fallback; }
}
