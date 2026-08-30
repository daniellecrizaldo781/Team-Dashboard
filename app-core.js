/* ============================================================
 * app-core.js - state, fetching, caching, filtering, helpers
 * ============================================================ */

var DATA = null;                 // last good payload
var F = { agent: 'ALL', week: 'ALL', moMonth: '', moAgent: '', lvMonth: '', qaAgent: 'ALL', scAgent: '', scWeek: '', tsWeek: '', otWeek: '', scRankWeek: '', from: '', to: '' };
var PAGE = 'overview';
var CACHE_KEY = 'tpcc_cache_v1'; // data cache only - never a credential

/* ---------------- helpers ---------------- */
function $(id) { return document.getElementById(id); }
function el(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
/* "January 2026" -> 202601 ; orders month labels chronologically */
function monthSortKey(label) {
  var MON = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
  var m = String(label || '').toLowerCase().match(/([a-z]{3})\w*\s*(\d{4})/);
  if (!m) return 0;
  return (+m[2]) * 100 + (MON[m[1].slice(0,3)] || 0);
}

function uniq(arr) { var s = {}, o = []; arr.forEach(function (v) { if (v && !s[v]) { s[v] = 1; o.push(v); } }); return o; }
function sum(a) { return a.reduce(function (x, y) { return x + (y || 0); }, 0); }
function avg(a) { var v = a.filter(function (x) { return typeof x === 'number' && !isNaN(x); }); return v.length ? sum(v) / v.length : null; }

/** Parse ISO as LOCAL date - never through Date.parse (UTC drift). */
function ymd(s) { if (!s) return null; var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

function pct(v, d) {
  if (v === null || v === undefined || isNaN(v)) return '\u2014';
  return (v * 100).toFixed(d === undefined ? 1 : d) + '%';
}
function n0(v) { return (v === null || v === undefined || isNaN(v)) ? '\u2014' : Math.round(v).toLocaleString(); }
function n1(v) { return (v === null || v === undefined || isNaN(v)) ? '\u2014' : (Math.round(v * 10) / 10).toLocaleString(); }

function fmtDate(s) {
  var d = ymd(s);
  if (!d || isNaN(d)) return esc(s || '\u2014');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtWeek(s) {
  var d = ymd(s);
  if (!d || isNaN(d)) return esc(s || '\u2014');
  var e = new Date(d); e.setDate(e.getDate() + 6);
  var sameM = d.getMonth() === e.getMonth();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' \u2013 ' +
         e.toLocaleDateString('en-US', sameM ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
}
function fmtStamp(iso) {
  var d = new Date(iso);
  if (isNaN(d)) return '\u2014';
  return d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/* ---------------- filtering ---------------- */
/** opts.ignoreAgent / opts.ignoreWeek let a view opt out of a filter. */
function pass(r, opts) {
  opts = opts || {};
  if (!opts.ignoreAgent && F.agent !== 'ALL' && r.agent !== F.agent) return false;
  if (!opts.ignoreWeek && F.week !== 'ALL' && r.week !== F.week) return false;
  if (r.date) {
    if (F.from && r.date < F.from) return false;
    if (F.to && r.date > F.to) return false;
  }
  return true;
}
function slice(arr, opts) { return (arr || []).filter(function (r) { return pass(r, opts); }); }

function groupBy(arr, keyFn) {
  var m = {}, order = [];
  (arr || []).forEach(function (r) {
    var k = keyFn(r);
    if (k === '' || k === null || k === undefined) return;
    if (!m[k]) { m[k] = []; order.push(k); }
    m[k].push(r);
  });
  return { keys: order, map: m };
}

/** Agent -> hotline (OHA / ALL BRANDS) derived from the OT schedule, which is the
 *  only weekly dataset that carries a hotline column. Covers every scheduled agent. */
function agentHotlineMap() {
  var m = {};
  (DATA.otSchedule || []).forEach(function (r) { if (r.agent && r.hotline) m[r.agent] = r.hotline; });
  return m;
}

// A shift is a half-day when it covers only part of the day (not a full 8-9h block)
function isHalfDayShift(s) {
  if (!s) return false;
  return /^8\s*AM\s*-\s*12\s*PM$/i.test(s) || /^3\s*PM\s*-\s*7\s*PM$/i.test(s);
}
function allAgents(d) {
  var a = [];
  ['dailyProductivity', 'weeklyCallStats', 'qaScores', 'qaBreakdown', 'scorecards',
   'teamSchedule', 'otSchedule', 'breakSchedule', 'leaveRequests']
    .forEach(function (k) { (d[k] || []).forEach(function (r) { if (r.agent) a.push(r.agent); }); });
  (((d.officialScorecard || {}).weekly) || []).forEach(function (r) { a.push(r.agent); });
  return uniq(a).sort();
}
/** Monday of the current real-world week. */
function thisWeekStart() {
  var d = new Date(), dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

function allWeeks(d) {
  var w = [];
  ['dailyProductivity', 'weeklyCallStats', 'qaScores', 'scorecards',
   'teamSchedule', 'otSchedule', 'leaveRequests']
    .forEach(function (k) { (d[k] || []).forEach(function (r) { if (r.week) w.push(r.week); }); });
  return uniq(w).sort().reverse();
}

/* ---------------- ranking (uses the sheet's OFFICIAL score) ---------------- */
/**
 * Official score priority (never a home-made formula):
 *   1. WEEKLY SCORECARD tab -> 'Overall %' (current; runs to the latest week)
 *   2. Team Weekly and Monthly Stats -> 'OVERALL SCORE' (older block layout)
 * A week whose Overall % is still all zeros is "in progress" and is skipped
 * in favour of that agent's last completed scorecard.
 */
function officialRows() {
  var out = [];
  // source 1 - WEEKLY SCORECARD tab
  (DATA.scorecards || []).forEach(function (r) {
    if (!/^overall\s*%$/i.test(r.metric || '')) return;
    if (r.value === null || r.value === undefined) return;
    out.push({ agent: r.agent, week: r.week, overall: r.value > 1.5 ? r.value / 100 : r.value, src: 'WEEKLY SCORECARD' });
  });
  // source 2 - older OVERALL SCORE blocks
  (((DATA.officialScorecard || {}).weekly) || []).forEach(function (r) {
    out.push({ agent: r.agent, week: r.week, overall: r.overall, components: r.components, src: 'Team Stats' });
  });
  return out;
}

/** The sheet's own text rating (e.g. 'Top Performer', 'Good') if present. */
function sheetRating(agent, week) {
  var hit = null;
  (DATA.scorecards || []).forEach(function (r) {
    if (r.agent === agent && r.week === week && /team ranking/i.test(r.metric || '') && r.raw) hit = r.raw;
  });
  return hit;
}

/** Per-agent components from the WEEKLY SCORECARD tab for a given week. */
function scorecardComponents(agent, week) {
  var want = /weighted|qa score|productivity %|attendance %|quality %|work ethic %|pick up %|total score|infractions/i;
  var o = {};
  (DATA.scorecards || []).forEach(function (r) {
    if (r.agent !== agent || r.week !== week) return;
    if (!want.test(r.metric || '')) return;
    if (r.value === null || r.value === undefined) return;
    o[r.metric] = r.value;
  });
  return Object.keys(o).length ? o : null;
}

// Each weighted component is capped at its real maximum so a metric can never
// read above its allotted score (e.g. Attendance Weighted cannot exceed 25%).
var WEIGHT_MAX = {
  'Attendance Weighted (25%)': 0.25,
  'Quality Weighted (35%)': 0.35,
  'Productivity Weighted (25%)': 0.25,
  'Work Ethic Weighted (15%)': 0.15
};

/** Same as scorecardComponents but with weighted metrics capped to their max and
 *  the infractions penalty (-10% of the total per infraction) applied. Returns
 *  a corrected TOTAL SCORE (out of 100) and Overall %. */
function scorecardCapped(agent, week) {
  var c = scorecardComponents(agent, week);
  if (!c) return null;
  var out = {};
  Object.keys(c).forEach(function (k) { out[k] = c[k]; });
  Object.keys(WEIGHT_MAX).forEach(function (k) {
    if (out[k] != null) out[k] = Math.min(out[k], WEIGHT_MAX[k]);
  });
  var total = (out['Attendance Weighted (25%)'] || 0) + (out['Quality Weighted (35%)'] || 0) +
              (out['Productivity Weighted (25%)'] || 0) + (out['Work Ethic Weighted (15%)'] || 0);
  var inf = out['Number of Infractions'];
  if (inf && inf > 0) {
    var deduct = inf * 0.10 * total;          // -10% of total per infraction
    out['Infractions Penalty'] = -deduct;
    total = Math.max(0, total - deduct);
  }
  out['TOTAL SCORE (out of 100)'] = total;
  out['Overall %'] = total / 100;
  return out;
}

function buildRanking(weekOverride) {
  if (!DATA) return [];
  var off = officialRows();

  // drop weeks that are entirely zero (scorecard not filled in yet)
  var byWeek = groupBy(off, function (r) { return r.week; });
  var liveWeeks = {};
  byWeek.keys.forEach(function (w) {
    if (byWeek.map[w].some(function (r) { return r.overall > 0; })) liveWeeks[w] = 1;
  });
  off = off.filter(function (r) { return liveWeeks[r.week]; });

  // a specific week can be forced (Overview's global Week selector) or taken
  // from the Scorecards page's own selector
  var scopeWeek = weekOverride || F.scRankWeek;
  var scoped;
  if (scopeWeek) {
    // show only that week's scorecards for every agent
    scoped = off.filter(function (r) {
      return (F.agent === 'ALL' || r.agent === F.agent) && r.week === scopeWeek;
    });
  } else {
    // each agent's MOST RECENT completed scorecard - never a cross-month average
    var byA0 = groupBy(off.filter(function (r) { return F.agent === 'ALL' || r.agent === F.agent; }),
                       function (r) { return r.agent; });
    scoped = byA0.keys.map(function (a) {
      var rows = byA0.map[a].slice().sort(function (x, y) { return (x.week || '').localeCompare(y.week || ''); });
      return rows[rows.length - 1];
    });
  }
  if (!scoped.length && !scopeWeek) {
    var byA = groupBy(off.filter(function (r) { return F.agent === 'ALL' || r.agent === F.agent; }), function (r) { return r.agent; });
    scoped = byA.keys.map(function (a) {
      var rows = byA.map[a].slice().sort(function (x, y) { return (x.week || '').localeCompare(y.week || ''); });
      return rows[rows.length - 1];
    });
  }

  // when a specific week is scoped, QA / productivity / calls stats are limited to that week too
  var qaSrc = slice(DATA.qaScores);
  var prSrc = slice(DATA.dailyProductivity);
  var clSrc = slice(DATA.weeklyCallStats);
  if (scopeWeek) {
    qaSrc = qaSrc.filter(function (r) { return r.week === scopeWeek; });
    prSrc = prSrc.filter(function (r) { return r.week === scopeWeek; });
    clSrc = clSrc.filter(function (r) { return r.week === scopeWeek; });
  }
  var qaBy = groupBy(qaSrc, function (r) { return r.agent; });
  var prBy = groupBy(prSrc, function (r) { return r.agent; });
  var clBy = groupBy(clSrc, function (r) { return r.agent; });

  var agents = uniq(scoped.map(function (r) { return r.agent; })
    .concat(qaBy.keys).concat(prBy.keys));

  var rows = agents.map(function (a) {
    var offRows = scoped.filter(function (r) { return r.agent === a; });
    var qa = qaBy.map[a] || [], pr = prBy.map[a] || [], cl = clBy.map[a] || [];
    // the scorecard week actually being shown for this agent - used so Calls /
    // Attempts reflect ONLY that week (not a sum across every week they appear in)
    var scWeek = offRows.length ? offRows[offRows.length - 1].week : null;
    return {
      agent: a,
      overall: offRows.length ? avg(offRows.map(function (r) { return r.overall; })) : null,
      components: offRows.length
        ? (scorecardCapped(a, offRows[offRows.length - 1].week) || offRows[offRows.length - 1].components)
        : null,
      scoreWeek: offRows.length ? offRows[offRows.length - 1].week : null,
      rating: offRows.length ? sheetRating(a, offRows[offRows.length - 1].week) : null,
      qa: qa.length ? avg(qa.map(function (r) { return r.score; })) : null,
      evals: qa.length,
      prod: pr.length ? avg(uniq(pr.map(function (r) { return r.week + '|' + r.productivityPct; }))
              .map(function (k) { var v = parseFloat(k.split('|')[1]); return isNaN(v) ? null : v; })) : null,
      tickets: pr.length ? sum(pr.map(function (r) { return r.tickets; })) : null,
      // Calls / attempts reflect ONLY the week being shown (not a sum across
      // every week the agent appears in) so the column matches the sheet's
      // "Call Pick Up #" for that week - whether a single week is selected or
      // the default most-recent-scorecard view is used.
      calls: cl.length ? sum(cl.filter(function (r) { return !scWeek || r.week === scWeek; }).map(function (r) { return r.pickedUp; })) : null,
      attempts: cl.length ? sum(cl.filter(function (r) { return !scWeek || r.week === scWeek; }).map(function (r) { return r.attempts; })) : null
    };
  });

  // rank on the official score; agents without one sort last
  rows.sort(function (x, y) {
    var a = x.overall, b = y.overall;
    if (a === null && b === null) return (y.qa || 0) - (x.qa || 0);
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  });
  rows.forEach(function (r, i) { r.rank = i + 1; });
  return rows;
}

/* Build a MONTHLY Official Scorecard Ranking for one month.
 * Each agent is scored by the AVERAGE of their weekly overall scores in that
 * month (taken from the granular officialScorecard.weekly source), so the
 * ranking reflects the whole month - not a single week. */
function buildMonthlyRanking(monthName) {
  if (!DATA) return [];
  var wk = (DATA.officialScorecard && DATA.officialScorecard.weekly) || [];
  // weekly rows whose label's week belongs to the selected month
  var rows = wk.filter(function (r) {
    return (r.weekLabel || r.week || '').indexOf(monthName) === 0 && r.overall > 0;
  });

  var byA = groupBy(rows, function (r) { return r.agent; });
  var agents = byA.keys.slice().sort();
  var out = agents.map(function (a) {
    var rs = byA.map[a];
    var weeks = rs.map(function (r) { return r.week; });
    var overall = avg(rs.map(function (r) { return r.overall; }));
    var components = scorecardCapped(a, rs[rs.length - 1].week) || rs[rs.length - 1].components;
    return {
      agent: a,
      overall: overall,
      components: components,
      scoreWeeks: weeks,
      rating: sheetRating(a, rs[rs.length - 1].week),
      weekCount: weeks.length,
      qa: null, prod: null, calls: null, evals: 0
    };
  });
  out.sort(function (x, y) {
    var a = x.overall, b = y.overall;
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  });
  out.forEach(function (r, i) { r.rank = i + 1; });
  return out;
}
/**
 * data.js ships compressed: tables are columnar and repeated strings live in
 * one shared table, referenced by index. Undo both to get normal objects.
 */
function expandSnapshot(raw) {
  if (!raw) return null;
  if (!raw.packed) return raw;                 // already plain

  var strings = raw.strings || [];
  // an interned string was written as a one-element array [i]; anything else
  // (number, boolean, null, plain string) is a literal value.
  // Array.isArray, not instanceof - the latter is false across JS realms.
  function dec(v) {
    return Array.isArray(v) ? strings[v[0]] : v;
  }

  var out = {
    lastUpdated: raw.lastUpdated,
    dataYear: raw.dataYear,
    mode: raw.mode,
    warnings: raw.warnings || [],
    officialScorecard: raw.officialScorecard || { weekly: [], monthly: [] },
    leaveFormOptions: raw.leaveFormOptions || { leaveTypes: [], reasons: [] }
  };

  Object.keys(raw.packed).forEach(function (name) {
    var t = raw.packed[name], cols = t.c;
    out[name] = (t.r || []).map(function (arr) {
      var o = {};
      for (var i = 0; i < cols.length; i++) {
        // trailing nulls were trimmed when packing - restore them
        if (cols[i] === 'cascadeRuns') {
          // runs: [[textIdx|text, bold, italic], ...] -> decode run text
          var runs = i < arr.length ? arr[i] : null;
          o.cascadeRuns = runs ? runs.map(function (r) {
            return [dec(r[0]), !!r[1], !!r[2]];
          }) : null;
          continue;
        }
        if (cols[i] === 'cascadeImages') {
          // array of {url, src} objects - already in final form, do NOT run the
          // string-interning decoder on it (dec() would mistake the array for a
          // shared-string reference and corrupt it).
          o.cascadeImages = i < arr.length ? arr[i] : null;
          continue;
        }
        if (cols[i] === 'troubleshooting') {
          // array of {q, a} objects - final form, skip the string decoder.
          o.troubleshooting = i < arr.length ? arr[i] : null;
          continue;
        }
        o[cols[i]] = i < arr.length ? dec(arr[i]) : null;
      }
      return o;
    });
  });
  return out;
}

/* ---------------- data load ---------------- */
function setSync(state, text) {
  var d = $('syncDot'), t = $('syncText');
  d.className = 'dot' + (state ? ' ' + state : '');
  t.textContent = text;
}
function toast(msg, kind) {
  var t = $('toast');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(function () { t.hidden = true; }, 3600);
}
function banner(msg, kind) {
  var b = $('banner');
  if (!msg) { b.hidden = true; return; }
  b.className = 'banner' + (kind ? ' ' + kind : '');
  b.textContent = msg;
  b.hidden = false;
}

function readCache() {
  try {
    var raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function writeCache(d) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch (e) { /* quota - non-fatal */ }
}

/**
 * Load the baked-in snapshot from data.js. There is no network call and no
 * Apps Script: data.js is part of the site, so this always succeeds unless
 * the file itself failed to load.
 *
 * isManual = true when the user pressed Refresh Data.
 */
function fetchData(isManual) {
  if (isManual) { $('loader').hidden = false; $('btnRefresh').disabled = true; }
  setSync('busy', 'Updating\u2026');

  return new Promise(function (resolve) {
    // let the browser paint the loader before the (synchronous) expand
    setTimeout(function () {
      try {
        if (!window.DASHBOARD_DATA) throw new Error('data.js did not load');

        DATA = expandSnapshot(window.DASHBOARD_DATA);
        writeCache(window.DASHBOARD_DATA);

        setSync('ok', 'Last Updated: ' + fmtStamp(DATA.lastUpdated) +
                      (window.DATA_SOURCE_NOTE ? ' \u00b7 ' + window.DATA_SOURCE_NOTE : ''));
        banner('');
        if (DATA.warnings && DATA.warnings.length) {
          banner('Some sections could not be read: ' + DATA.warnings.join('; ') +
                 '. The rest of the dashboard is up to date.', '');
        }
        fillSelects();
        render();
        if (isManual) toast('Dashboard updated successfully.', 'ok');
      } catch (err) {
        var cached = readCache();
        if (cached) {
          DATA = expandSnapshot(cached);
          setSync('err', 'Last Updated: ' + fmtStamp(DATA.lastUpdated) + ' (cached)');
          banner('We\u2019re having trouble loading the latest data. Showing the last ' +
                 'successfully loaded data from ' + fmtStamp(DATA.lastUpdated) + '.', 'err');
          fillSelects();
          render();
          if (isManual) toast('Unable to load new data. Showing last successful data.', 'err');
        } else {
          setSync('err', 'Unable to load data');
          banner('We\u2019re having trouble connecting to the latest data. The data file ' +
                 '(data.js) could not be loaded. (' + err.message + ')', 'err');
          if (isManual) toast('Unable to load data.', 'err');
        }
      }
      $('loader').hidden = true;
      $('btnRefresh').disabled = false;
      resolve();
    }, isManual ? 260 : 0);
  });
}

/* ---------------- real-time auto-poll ----------------
 * The dashboard reads a static data.js snapshot. To avoid forcing the user to
 * hard-refresh, the open tab quietly re-fetches data.js on an interval and
 * re-renders the moment the snapshot's content changes.
 *
 * IMPORTANT: we re-fetch the SAME versioned URL the page already loaded
 * (data.js?v=NN) - never an unversioned ?poll= URL. An unversioned fetch can be
 * served a stale/partial copy from the CDN edge, which would silently replace
 * the good data with a half-loaded snapshot ("other data disappears").
 * We also refuse to apply a newer payload that has FEWER rows than what we
 * already have, so a transient partial download can never wipe the dashboard. */
var _pollTimer = null;
function startAutoPoll(intervalMs) {
  if (_pollTimer) clearInterval(_pollTimer);
  // derive the versioned URL from the <script src="data.js?v=NN"> tag
  var srcEl = document.querySelector('script[src*="data.js"]');
  var base = 'data.js';
  if (srcEl) {
    var m = (srcEl.getAttribute('src') || '').match(/data\.js(\?[^"']*)?$/);
    if (m) base = 'data.js' + (m[1] || '');
  }
  _pollTimer = setInterval(function () {
    if (document.hidden) return;            // don't poll a backgrounded tab
    var url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'poll=' + Date.now();
    fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (txt) {
        if (!txt) return;
        // data.js assigns window.DASHBOARD_DATA = {...}; eval only the assignment
        var m = txt.match(/window\.DASHBOARD_DATA\s*=\s*([\s\S]*?);\s*$/);
        if (!m) return;
        var next;
        try { next = JSON.parse(m[1]); } catch (e) { return; }
        var prev = window.DASHBOARD_DATA ? JSON.stringify(window.DASHBOARD_DATA) : '';
        if (prev && prev === JSON.stringify(next)) return;   // unchanged
        // safety: never replace good data with a smaller/partial snapshot
        if (window.DASHBOARD_DATA && rowCount(next) < rowCount(window.DASHBOARD_DATA) * 0.5) {
          console.warn('auto-poll: refusing partial snapshot (row count dropped), keeping current data');
          return;
        }
        window.DASHBOARD_DATA = next;
        DATA = expandSnapshot(next);
        writeCache(next);
        setSync('ok', 'Last Updated: ' + fmtStamp(DATA.lastUpdated) +
          (window.DATA_SOURCE_NOTE ? ' · ' + window.DATA_SOURCE_NOTE : ''));
        fillSelects();
        render();
      })
      .catch(function () { /* transient network blip - next tick retries */ });
  }, intervalMs || 45000);
}

// total row count across packed datasets - used to detect partial snapshots
function rowCount(snapshot) {
  if (!snapshot || !snapshot.packed) return 0;
  var n = 0;
  Object.keys(snapshot.packed).forEach(function (k) {
    var t = snapshot.packed[k];
    if (t && t.r) n += t.r.length;
  });
  return n;
}
