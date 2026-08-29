/**
 * FILE 5 of 5  ->  Parsers4.gs
 * Cascades & Handling tab (knowledge-base style entries the team must follow).
 *
 * The tab lives in the SCHEDULE sheet (same doc as Leave/Schedule). Its header
 * is a variation of:  Category | Brand Specific | Title | Date | Cascade | Link References
 * We locate it by header signature (not a hard-coded name) so renames are safe,
 * and map columns by name so column order/reordering won't break parsing.
 */

/** Find the Cascades tab by header signature, in BOTH contexts:
 *  - live Apps Script (ss.getSheets) and snapshot mode (ss.__d map). */
function findCascadeTab(ss) {
  var names;
  if (ss && typeof ss.getSheets === 'function') {
    names = ss.getSheets().map(function (s) { return s.getName(); });
  } else if (ss && ss.__d && typeof ss.__d === 'object') {
    names = Object.keys(ss.__d);
  } else {
    return null;
  }
  for (var i = 0; i < names.length; i++) {
    var g = grid(ss, names[i]);
    if (!g.length) continue;
    var head = (g[0] || []).map(function (c) { return S(c).toLowerCase(); });
    var hasCat = head.indexOf('category') >= 0;
    var hasCasc = head.some(function (h) { return h.indexOf('cascade') >= 0; });
    if (hasCat && hasCasc) return names[i];
  }
  return null;
}

/** Pull every http(s) URL out of a block of text. */
function extractUrls(text) {
  var out = [], re = /https?:\/\/[^\s)<>"'\]]+/g, m;
  while ((m = re.exec(text || ''))) out.push(m[0].replace(/[.,;]+$/, ''));
  return out;
}

function parseCascades(ss) {
  var name = findCascadeTab(ss);
  if (!name) return [];
  var g = grid(ss, name);
  if (g.length < 2) return [];

  var head = g[0].map(function (c) {
    return S(c).toLowerCase().replace(/\s+/g, ' ').trim();
  });
  function col() {
    for (var i = 0; i < head.length; i++) {
      for (var j = 0; j < arguments.length; j++) {
        if (head[i].indexOf(arguments[j]) >= 0) return i;
      }
    }
    return -1;
  }
  var iCat   = col('category');
  var iBrand = col('brand');
  var iTitle = col('title');
  var iDate  = col('date');
  var iCasc  = col('cascade');
  var iLink  = col('link');
  if (iCat < 0 || iCasc < 0) return [];

  var out = [];
  var MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  for (var r = 1; r < g.length; r++) {
    var row = g[r];
    var cat = S(row[iCat]);
    if (!cat) continue;                       // skip blank / trailing rows
    var rawDate = row[iDate];
    // rawDate may be a Date object, a JS-date string, or a plain "August 28".
    var dateLabel;
    if (rawDate && typeof rawDate === 'object' && typeof rawDate.__d === 'string') {
      dateLabel = rawDate.__d;                // togrid.py date shape
    } else if (rawDate instanceof Date) {
      var mm = rawDate.getMonth() + 1, dd = rawDate.getDate();
      dateLabel = rawDate.getFullYear() + '-' + (mm < 10 ? '0' + mm : mm) + '-' + (dd < 10 ? '0' + dd : dd);
    } else {
      dateLabel = S(rawDate);
    }
    var month = '', dayNum = null;
    if (/[a-z]/i.test(dateLabel)) {           // contains letters -> month name form
      var dm = dateLabel.match(/([A-Za-z]+)\s*(\d{1,2})?/);
      if (dm) {
        month = dm[1];
        if (dm[2]) dayNum = parseInt(dm[2], 10);
      }
    } else {                                  // ISO form -> derive month/day
      var p = dateLabel.split('-');
      if (p.length === 3) { month = Object.keys(MONTHS)[(+p[1] - 1 + 12) % 12]; dayNum = parseInt(p[2], 10); }
    }
    out.push({
      category:  cat,
      brand:     S(row[iBrand]),
      title:     S(row[iTitle]),
      date:      dateLabel,                   // normalized form
      month:     month,
      dayNum:    dayNum,
      dateLabel: dateLabel,
      cascade:   S(row[iCasc]),
      linkRefs:  iLink >= 0 ? S(row[iLink]) : ''
      // URLs are extracted at render time from cascade + linkRefs (no nested arrays in snapshot)
    });
  }
  // newest first when a day number is present, otherwise keep sheet order
  out.sort(function (a, b) {
    if (a.dayNum == null || b.dayNum == null) return 0;
    return b.dayNum - a.dayNum;
  });
  return out;
}
