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

  // Turn a raw cell value into { text, runs }.
  //  - snapshot mode: a rich cell is { __rt: [[text, bold, italic], ...] }
  //  - live mode / plain: fall back to the plain string.
  function rich(cell) {
    if (cell && typeof cell === 'object' && Array.isArray(cell.__rt) && cell.__rt.length) {
      var txt = cell.__rt.map(function (r) { return r[0] || ''; }).join('');
      return { text: txt, runs: cell.__rt.map(function (r) { return [r[0] || '', !!r[1], !!r[2]]; }) };
    }
    return { text: S(cell), runs: null };
  }

  // Plain text of a cell, handling rich-text ({__rt}) cells the same way as rich().
  function plain(cell) {
    if (cell && typeof cell === 'object') {
      if (Array.isArray(cell.__rt) && cell.__rt.length) {
        return cell.__rt.map(function (r) { return (r[0] || ''); }).join('');
      }
      if (typeof cell.__d === 'string') return cell.__d;
    }
    return S(cell);
  }

  var out = [];
  var MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  for (var r = 1; r < g.length; r++) {
    var row = g[r];
    var cat = plain(row[iCat]);
    if (!cat) continue;                       // skip blank / trailing rows
    var rc = rich(row[iCasc]);

    var rawDate = row[iDate];
    var dateLabel;
    if (rawDate && typeof rawDate === 'object' && typeof rawDate.__d === 'string') {
      dateLabel = rawDate.__d;                // togrid.py date shape
    } else if (rawDate instanceof Date) {
      var mm = rawDate.getMonth() + 1, dd = rawDate.getDate();
      dateLabel = rawDate.getFullYear() + '-' + (mm < 10 ? '0' + mm : mm) + '-' + (dd < 10 ? '0' + dd : dd);
    } else {
      dateLabel = plain(rawDate);
    }
    var month = '', dayNum = null, ts = 0;
    if (/[a-z]/i.test(dateLabel)) {           // contains letters -> month name form
      var dm = dateLabel.match(/([A-Za-z]+)\s*(\d{1,2})?/);
      if (dm) {
        month = dm[1];
        if (dm[2]) dayNum = parseInt(dm[2], 10);
        var mi = MONTHS[(month || '').toLowerCase().slice(0,3)];
        if (mi != null && dayNum) ts = Date.UTC(2026, mi, dayNum);
      }
    } else {                                  // ISO form -> derive month/day
      var p = dateLabel.split('-');
      if (p.length === 3) {
        month = Object.keys(MONTHS)[(+p[1] - 1 + 12) % 12];
        dayNum = parseInt(p[2], 10);
        ts = Date.UTC(+p[0], +p[1] - 1, +p[2]);
      }
    }
    out.push({
      category:  cat,
      brand:     plain(row[iBrand]),
      title:     plain(row[iTitle]),
      date:      dateLabel,                   // normalized form
      month:     month,
      dayNum:    dayNum,
      ts:        ts,                           // epoch ms for newest-first sorting
      dateLabel: dateLabel,
      cascade:   rc.text,                      // plain text (fallback / search)
      cascadeRuns: rc.runs,                    // [[text, bold, italic], ...] or null
      linkRefs:  iLink >= 0 ? plain(row[iLink]) : ''
      // URLs are extracted at render time from cascade + linkRefs (no nested arrays in snapshot)
    });
  }
  // newest first (by full date); rows without a parseable date keep sheet order
  out.sort(function (a, b) {
    if (a.ts && b.ts) return b.ts - a.ts;
    if (a.ts && !b.ts) return -1;
    if (!a.ts && b.ts) return 1;
    if (a.dayNum != null && b.dayNum != null) return b.dayNum - a.dayNum;
    return 0;
  });
  return out;
}

/* ===========================================================
 * Products  (FILE 5, row 2 of the Products sheet)
 * Columns (by header name):
 *   Product Name | Description | Package Inclusion | Instruction Manual |
 *   Product Image (Drive link) | Email Support | Hotline Number |
 *   Return Handling | Product Not Working | Damaged Package | Incorrect Bundle
 * The "Trouble Shooting and Handling" header spans the last four columns.
 * Cell text is preserved EXACTLY (no whitespace collapsing) so the sheet's
 * formatting (line breaks in the manual, etc.) is kept verbatim.
 * =========================================================== */
function parseProducts(ss) {
  var g = grid(ss, 'Sheet1');
  if (!g || g.length < 2) return [];

  function cellText(c) {
    if (c && typeof c === 'object') {
      if (Array.isArray(c.__rt) && c.__rt.length) return c.__rt.map(function (r) { return (r[0] || ''); }).join('');
      if (typeof c.__d === 'string') return c.__d;
    }
    return (c === null || c === undefined) ? '' : String(c);
  }
  // keep the cell text exactly as written (only map null -> '')
  function exact(c) {
    if (c && typeof c === 'object') {
      if (Array.isArray(c.__rt) && c.__rt.length) {
        return c.__rt.map(function (r) { return (r[0] || ''); }).join('');
      }
      if (typeof c.__d === 'string') return c.__d;
    }
    return (c === null || c === undefined) ? '' : String(c);
  }
  function col() {  // locate a column index by header substring (case-insensitive)
    for (var j = 0; j < arguments.length; j++) {
      for (var i = 0; i < head.length; i++) {
        if (('' + head[i]).toLowerCase().indexOf(arguments[j]) >= 0) return i;
      }
    }
    return -1;
  }

  // The sheet has a title row ("Product Information") above the real header
  // ("Product Name" ...). Find the header row by scanning the first few rows.
  var hRow = -1;
  for (var hr = 0; hr < Math.min(g.length, 6); hr++) {
    var rowText = g[hr].map(cellText).join(' ').toLowerCase();
    if (rowText.indexOf('product name') >= 0) { hRow = hr; break; }
  }
  if (hRow < 0) return [];

  var head = g[hRow].map(function (c) {
    return (c && typeof c === 'object' && typeof c.__d === 'string') ? c.__d : (c || '');
  }).map(function (c) { return ('' + c).toLowerCase().replace(/\s+/g, ' ').trim(); });

  var iName = col('product name');
  if (iName < 0) return [];
  var iDesc   = col('description');
  var iIncl   = col('package inclusion');
  var iManual = col('instruction manual');
  var iImg    = col('product image');
  var iEmail  = col('email support');
  var iHot    = col('hotline');
  var FIXED = 7;  // name,desc,inclusion,manual,image,email,hotline are fixed; col 7+ are handling items

  var out = [];
  for (var r = hRow + 1; r < g.length; r++) {
    var row = g[r];
    var name = exact(row[iName]);
    if (!name) continue;  // skip blank/trailing rows
    var ts = [];
    // col 7+ = handling/issue items (Return Handling, No Foaming Action, ...).
    // Use the header text as the title; if blank, derive it from the cell's
    // first line so every item still has a clickable collapsible heading.
    for (var c = FIXED; c < row.length; c++) {
      var title = (head[c] && head[c].trim()) ? head[c].trim() : null;
      var body  = exact(row[c]);
      if (!body) continue;
      if (!title) {
        var firstLine = body.split('\n')[0].replace(/[:\-\u2013\u2014]\s*$/, '').trim();
        title = firstLine || ('Issue ' + (ts.length + 1));
      }
      ts.push({ q: title, a: body });
    }
    out.push({
      name: name,
      description: iDesc >= 0 ? exact(row[iDesc]) : '',
      inclusion: iIncl >= 0 ? exact(row[iIncl]) : '',
      manual: iManual >= 0 ? exact(row[iManual]) : '',
      image: iImg >= 0 ? exact(row[iImg]) : '',       // Drive link (embedded at bake)
      email: iEmail >= 0 ? exact(row[iEmail]) : '',
      hotline: iHot >= 0 ? exact(row[iHot]) : '',
      troubleshooting: ts                            // [{q,a}, ...]
    });
  }
  return out;
}
