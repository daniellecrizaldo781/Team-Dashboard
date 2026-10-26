/* ============================================================
 * app-render.js - Overview, Daily Productivity, Weekly Calls, QA
 * ============================================================ */

function kpi(mountId, items) {
  var m = $(mountId);
  if (!m) return;
  m.innerHTML = items.map(function (k) {
    return '<div class="kpi' + (k.tone ? ' ' + k.tone : '') + '">' +
      '<div class="lbl">' + esc(k.label) + '</div>' +
      '<div class="val">' + (k.html || esc(k.value)) + '</div>' +
      (k.sub ? '<div class="sub">' + esc(k.sub) + '</div>' : '') + '</div>';
  }).join('');
}

function topPerformerCard(mountId, rank) {
  var m = $(mountId);
  if (!m) return;
  var t = rank[0];
  if (!t) {
    m.innerHTML = '<div class="empty"><b>No top performer yet</b>No scorecard data available for the selected filters.</div>';
    return;
  }
  var stats = [];
  if (t.qa !== null)     stats.push({ l: 'QA Score', v: pct(t.qa) });
  if (t.prod !== null)   stats.push({ l: 'Productivity', v: pct(t.prod) });
  if (t.calls !== null)  stats.push({ l: 'Calls Handled', v: n0(t.calls) });
  if (t.tickets !== null && t.tickets !== 0) stats.push({ l: 'Tickets', v: n0(t.tickets) });
  if (t.evals)           stats.push({ l: 'QA Evaluations', v: n0(t.evals) });

  m.innerHTML = '<div class="tp">' +
    '<div class="tp-tag">\uD83C\uDFC6 Top Performing CSR</div>' +
    '<div class="tp-name">' + esc(t.agent) + (t.rating ? ' \u00b7 ' + esc(t.rating) : '') + '</div>' +
    '<div class="tp-score">' + (t.overall !== null ? pct(t.overall, 2) + ' Overall Score' : 'Ranked on QA score') +
      (t.scoreWeek ? ' \u00b7 scorecard week of ' + fmtWeek(t.scoreWeek) : '') + '</div>' +
    (stats.length ? '<div class="tp-stats">' + stats.map(function (s) {
      return '<div><span>' + esc(s.l) + '</span><b>' + s.v + '</b></div>';
    }).join('') + '</div>' : '') +
    '</div>';
}

/* ---------------- OVERVIEW ---------------- */
function renderOverview() {
  var rank = buildRanking(F.week !== 'ALL' ? F.week : null);
  var dp = slice(DATA.dailyProductivity);
  var qa = slice(DATA.qaScores);
  var cl = slice(DATA.weeklyCallStats);
  // derive from PERFORMANCE rows in view - schedule rows run into future weeks
  var perfWeeks = uniq(dp.map(function (r) { return r.week; })
    .concat(qa.map(function (r) { return r.week; }))
    .concat(cl.map(function (r) { return r.week; }))).sort();
  var curWeek = F.week !== 'ALL' ? F.week : (perfWeeks[perfWeeks.length - 1] || '');

  var items = [
    { label: 'Total Agents', value: n0(rank.length), sub: 'in current view' },
    { label: 'Average QA Score', html: rank.some(function (r) { return r.qa != null; })
        ? pct(avg(rank.map(function (r) { return r.qa; }).filter(function (v) { return v !== null; })))
        : '\u2014',
      sub: rank.length ? n0(rank.length) + ' agents' : 'no scorecards',
      tone: rank.some(function (r) { return r.qa != null; }) && avg(rank.map(function (r) { return r.qa; }).filter(function (v) { return v !== null; })) >= 0.95 ? 'good' : '' }
  ];
  var prodVals = rank.map(function (r) { return r.prod; }).filter(function (v) { return v !== null; });
  items.push({ label: 'Average Productivity', html: prodVals.length ? pct(avg(prodVals)) : '\u2014',
               sub: prodVals.length ? 'vs weekly target' : 'no productivity data' });
  if (cl.length) {
    items.push({ label: 'Total Calls Handled', value: n0(sum(cl.map(function (r) { return r.pickedUp; }))), sub: 'picked up' });
    items.push({ label: 'Total Call Attempts', value: n0(sum(cl.map(function (r) { return r.attempts; }))), sub: 'ringing attempts' });
  }
  items.push({ label: 'Top Performing CSR', html: rank[0] ? '<span style="font-size:18px">' + esc(rank[0].agent) + '</span>' : '—',
               sub: rank[0] && rank[0].overall !== null ? pct(rank[0].overall, 2) + ' overall' : '' , tone: 'good' });
  items.push({ label: 'Current Week', html: curWeek ? fmtWeek(curWeek) : '\u2014', sub: curWeek || 'all weeks' });
  kpi('ovKpis', items);

  topPerformerCard('topPerformer', rank);

  var withProd = rank.filter(function (r) { return r.prod !== null; });
  barChart('chOvProd', withProd.map(function (r) { return r.agent; }),
    withProd.map(function (r) { return r.prod; }),
    { percent: true, horizontal: true, label: 'Productivity' });

  makeTable('ovBoard', [
    { key: 'rank', label: '#', num: true, fmt: function (r) { return '<span class="rank">' + r.rank + '</span>'; } },
    { key: 'agent', label: 'Agent' },
    { key: 'overall', label: 'Overall', num: true, fmt: function (r) { return scorePill(r.overall, 2); } },
    { key: 'qa', label: 'QA', num: true, fmt: function (r) { return scorePill(r.qa); } },
    { key: 'prod', label: 'Productivity', num: true, fmt: function (r) { return r.prod === null ? '\u2014' : pct(r.prod); } },
    { key: 'calls', label: 'Calls', num: true, fmt: function (r) { return n0(r.calls); } },
    { key: 'evals', label: 'QA Evals', num: true, fmt: function (r) { return n0(r.evals); } }
  ], rank, { sort: 'rank', dir: 'asc' });

  // ---- Latest Cascades (newest uploaded first) ----
  var ovc = $('ovCascades');
  var ovd = $('ovCascDetail');
  if (ovc) {
    var allC = (DATA && DATA.cascades) || [];
    var datedC = allC.filter(function (r) { return r.ts; })
      .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    var undatedC = allC.filter(function (r) { return !r.ts; });
    var latest = datedC.concat(undatedC).slice(0, 3);
    function showList() {
      if (ovd) { ovd.hidden = true; ovd.innerHTML = ''; }
      ovc.hidden = false;
      ovc.innerHTML = latest.map(function (r) {
        var idx = allC.indexOf(r);
        var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var dateTxt = r.dateLabel || r.date || '';
        if (r.ts) { var d = new Date(r.ts); dateTxt = MON[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear(); }
        return '<button class="casc-row" data-cidx="' + idx + '">' +
          '<span class="pill n casc-cat">' + cascTextHtml(r.category) + '</span>' +
          '<span class="casc-row-title">' + cascTextHtml(r.title || '(untitled)') + '</span>' +
          (dateTxt ? '<span class="casc-row-date">' + esc(dateTxt) + '</span>' : '') +
          '<span class="casc-row-arrow">&#8250;</span>' +
        '</button>';
      }).join('');
      Array.prototype.forEach.call(ovc.querySelectorAll('.casc-row'), function (btn) {
        btn.onclick = function () {
          var i = parseInt(btn.getAttribute('data-cidx'), 10);
          openCascadeInline(allC[i]);
        };
      });
    }
    function openCascadeInline(r) {
      if (!r) return;
      ovc.hidden = true;
      ovd.hidden = false;
      ovd.innerHTML = '<button class="casc-back" id="ovCascBack">&larr; Back to latest cascades</button>' + cascadeDetailHtml(r);
      var back = $('ovCascBack');
      if (back) back.onclick = function () { showList(); window.scrollTo(0, 0); };
      Array.prototype.forEach.call(ovd.querySelectorAll('.casc-img'), function (span) {
        span.onclick = function (e) {
          e.stopPropagation();
          var img = span.querySelector('img');
          var lb = $('lb'), lbImg = $('lbImg');
          if (lb && lbImg && img) { lbImg.src = img.src; lb.classList.add('show'); }
        };
      });
      window.scrollTo(0, 0);
    }
    if (!latest.length) {
          ovc.innerHTML = '<div class="empty">No cascades yet.</div>';
        } else {
          showList();
        }
      }

      // ---- Product Updates (products with an update notice) ----
      var ovp = $('ovProdUpdates');
      if (ovp) {
        var allP = (DATA && DATA.products) || [];
        var updated = allP.filter(function (p) { return p.update && String(p.update).trim(); });
        if (!updated.length) {
          ovp.innerHTML = '<div class="empty">No product updates.</div>';
        } else {
          ovp.innerHTML = updated.map(function (p) {
            var idx = allP.indexOf(p);
            var st = statusClass(p.updateStatus);
            return '<button class="casc-row prod-update-row" data-pidx="' + idx + '">' +
              '<span class="pill n casc-cat">\uD83D\uDCE2 Update</span>' +
              '<span class="casc-row-title">' + esc(p.name) + '</span>' +
              (p.updateStatus ? '<span class="prod-update-status ' + esc(st) + '">' + esc(p.updateStatus) + '</span>' : '') +
              '<span class="casc-row-arrow">&#8250;</span>' +
            '</button>';
          }).join('');
          Array.prototype.forEach.call(ovp.querySelectorAll('.prod-update-row'), function (btn) {
            btn.onclick = function () {
              var i = parseInt(btn.getAttribute('data-pidx'), 10);
              openProductFromOverview(allP[i]);
            };
          });
        }
      }

      // ---- Agent Status History (Team Danielle) ----
      renderOverviewStatus();
    }

/* ---------------- AGENT STATUS HISTORY (Team Danielle) ---------------- */
// Renders the two status tables on the Overview page from DATA.status
// (pre-aggregated by tools/fetch_status.py from the Call EOD dashboard).
var STATUS_ABBR = {
  offline:'offline', available:'avail', in_call:'in_call', ringing:'ring',
  after_call_work:'acw', doing_back_office:'back_off', back_office:'back_off',
  other:'other', do_not_disturb:'dnd', on_a_break:'break', out_for_lunch:'lunch',
  in_training:'train'
};
var STATUS_ORDER = ['offline','available','in_call','ringing','after_call_work',
  'doing_back_office','other','do_not_disturb','on_a_break','out_for_lunch','in_training'];
function fmtHrs(min) { return (min / 60).toFixed(2) + ' h'; }
function renderOverviewStatus() {
  var st = DATA.status || {};
  var byAgent = st.byAgent || {};
  var daily = st.daily || {};
  var dates = st.dates || [];
  var statuses = st.statuses || [];
  var wkSel = $('ovStatusWeek');
    var kpis = $('ovStatusKpis');
  var perAgent = $('ovStatusPerAgent');
  var legend = $('ovStatusLegend');
  var dailySel = $('ovStatusDailySel');
  var dailyTbl = $('ovStatusDaily');
  if (!perAgent) return;

  // week selector (from the dates present)
  var weeks = uniq(dates.map(function (d) { return weekStart(d); })).sort().reverse();
  if (wkSel) {
    if (!F.ovStatusWeek || weeks.indexOf(F.ovStatusWeek) < 0) F.ovStatusWeek = weeks[0] || '';
    wkSel.innerHTML = weeks.map(function (w) { return '<option value="' + esc(w) + '">' + esc(fmtWeek(w)) + '</option>'; }).join('');
    wkSel.value = F.ovStatusWeek;
    wkSel.onchange = function () { F.ovStatusWeek = this.value; renderOverviewStatus(); };
  }
  var scopeWeek = F.ovStatusWeek || '';

    // filter daily to the selected week
  var weekDates = scopeWeek ? dates.filter(function (d) { return weekStart(d) === scopeWeek; }) : dates;

  // ---- Time in Status per Status (per agent) ----
    var agents = Object.keys(byAgent).sort();
    var allSt = statuses.slice().sort(function (x, y) {
    var ix = STATUS_ORDER.indexOf(x), iy = STATUS_ORDER.indexOf(y);
    return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || x.localeCompare(y);
  });
  var stCols = allSt.map(function (s) { return { label: STATUS_ABBR[s] || s, key: '_' + s, num: true }; });
    var perRows = agents.map(function (a) {
      var row = { a: esc(a), tot: fmtHrs(sum(Object.keys(byAgent[a]).map(function (k) { return byAgent[a][k]; }))) };
      allSt.forEach(function (s) { row['_' + s] = byAgent[a][s] ? fmtHrs(byAgent[a][s]) : '0.00'; });
      return row;
    });
    makeTable('ovStatusPerAgent',
      [{ label: 'Agent', key: 'a' }, { label: 'Total Hrs', key: 'tot', num: true }].concat(stCols),
      perRows.length ? perRows : [{ a: '<div class="empty">No status data.</div>', tot: '' }]);
  if (legend) {
    legend.innerHTML = '<b>Status key:</b> ' + allSt.map(function (s) {
      return '<span class="lg"><b>' + (STATUS_ABBR[s] || s) + '</b> = ' + esc(s) + '</span>';
    }).join(' &middot; ');
  }

  // ---- Daily Status Hours per Agent (per selected status) ----
  if (dailySel && dailyTbl) {
    if (typeof window.__ovStatusDailySel === 'undefined') window.__ovStatusDailySel = allSt[0] || '';
    var cur = window.__ovStatusDailySel;
    dailySel.innerHTML = allSt.map(function (s) {
      return '<option value="' + esc(s) + '"' + (s === cur ? ' selected' : '') + '>' + esc(STATUS_ABBR[s] || s) + ' &mdash; ' + esc(s) + '</option>';
    }).join('');
    function renderDaily() {
      var stSel = dailySel.value;
      window.__ovStatusDailySel = stSel;
      var byAD = {}; var dset = {};
      weekDates.forEach(function (d) { dset[d] = 1; });
      Object.keys(daily).forEach(function (a) {
              Object.keys(daily[a]).forEach(function (d) {
          if (!dset[d]) return;
          var v = daily[a][d][stSel];
          if (v === undefined) return;
          var k = a + '|' + d;
          byAD[k] = (byAD[k] || 0) + v;
        });
      });
      var dateCols = weekDates.slice().sort();
      var byA = {};
      Object.keys(byAD).forEach(function (k) {
        var p = k.split('|'); var a = p[0], d = p[1];
        byA[a] = byA[a] || { agent: a, total: 0, byDate: {} };
        byA[a].total += byAD[k];
        byA[a].byDate[d] = (byA[a].byDate[d] || 0) + byAD[k];
      });
      var rows = Object.keys(byA).map(function (a) {
        var o = byA[a];
        var out = { ag: esc(a), tot: fmtHrs(o.total), _tot: o.total };
        dateCols.forEach(function (d) { out['_' + d] = o.byDate[d] ? fmtHrs(o.byDate[d]) : ''; });
        return out;
      }).sort(function (x, y) { return y._tot - x._tot; });
      var cols = [{ label: 'Agent', key: 'ag' }, { label: 'Total ' + esc(STATUS_ABBR[stSel] || stSel) + ' Hrs', key: 'tot', num: true }];
            dateCols.forEach(function (d) { cols.push({ label: fmtDY(d), key: '_' + d }); });
      makeTable('ovStatusDaily', cols,
        rows.length ? rows : [{ ag: '<div class="empty">No ' + esc(stSel) + ' hours for this week.</div>', tot: '', _tot: 0 }]);
    }
    dailySel.onchange = renderDaily;
    renderDaily();
  }

  // KPIs
  if (kpis) {
    var totalHrs = agents.reduce(function (s, a) { return s + sum(Object.keys(byAgent[a]).map(function (k) { return byAgent[a][k]; })); }, 0);
    var bo = agents.reduce(function (s, a) { return s + (byAgent[a].doing_back_office || 0); }, 0);
    kpi('ovStatusKpis', [
      { label: 'Agents Tracked', value: n0(agents.length), sub: 'Team Danielle' },
      { label: 'Total Status Hours', html: fmtHrs(totalHrs), sub: scopeWeek ? fmtWeek(scopeWeek) : 'all weeks' },
      { label: 'Back-Office Hours', html: fmtHrs(bo), sub: 'doing_back_office', tone: bo > 0 ? 'warn' : '' }
    ]);
  }
}

/* ---------------- DAILY PRODUCTIVITY ---------------- */
function buildProdGrid(dp) {
  var dayKeys = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var byAg = groupBy(dp, function (r) { return r.agent; });
  var agents = byAg.keys.slice().sort();
  var grid = agents.map(function (a) {
    var rows = byAg.map[a];
    var first = rows[0] || {};
    var byDay = {};
    rows.forEach(function (r) { if (r.day) byDay[r.day] = r; });
    var cells = dayKeys.map(function (d) {
      var r = byDay[d];
      if (!r) return { v: '—', off: false };
      return r.off ? { v: 'OFF', off: true } : { v: (r.tickets === null ? '—' : n0(r.tickets)), off: false };
    });
    return {
      agent: a,
      weeklyTarget: first.weeklyTarget,
      weeklyActual: first.weeklyActual,
      cells: cells,
      productivityPct: first.productivityPct,
      finalScore: first.finalScore
    };
  });
  grid.sort(function (x, y) { return (y.weeklyActual || 0) - (x.weeklyActual || 0); });
  return grid;
}
function prodCols(dayDateFn) {
  var dayKeys = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  function shortDate(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    if (p.length === 3) return (+p[1]) + '/' + (+p[2]);
    return iso;
  }
  var cols = [
    { key: 'agent', label: 'Name of Agent' },
    { key: 'weeklyTarget', label: 'Weekly Target', num: true, fmt: function (r) { return n0(r.weeklyTarget); } },
    { key: 'weeklyActual', label: 'Actual Productivity', num: true, fmt: function (r) { return n0(r.weeklyActual); } }
  ];
  dayKeys.forEach(function (d) {
    cols.push({ key: d, num: true, center: true,
      labelHtml: '<span class="pr-day-date">' + esc(shortDate(dayDateFn(d))) + '</span>' + d,
      fmt: function (r) { var c = r.cells[dayKeys.indexOf(d)]; return c.off ? '<span class="pill off">OFF</span>' : c.v; } });
  });
  cols.push({ key: 'productivityPct', label: 'Productivity %', num: true,
    fmt: function (r) { return r.productivityPct === null ? '—' : scorePill(r.productivityPct); }, sortVal: function (r) { return r.productivityPct; } });
  cols.push({ key: 'finalScore', label: 'Final Score', num: true, fmt: function (r) { return n1(r.finalScore); } });
  return cols;
}
function renderProductivity() {
  var dp = slice(DATA.dailyProductivity);
  var worked = dp.filter(function (r) { return !r.off && r.tickets !== null; });

  // weekly summary rows (target/actual/% are per agent-week, not per day)
  var wkKeys = {}, wkRows = [];
  dp.forEach(function (r) {
    var k = r.agent + '|' + r.week;
    if (wkKeys[k]) return;
    wkKeys[k] = 1;
    wkRows.push({ agent: r.agent, week: r.week, target: r.weeklyTarget, actual: r.weeklyActual,
                  prod: r.productivityPct, score: r.finalScore });
  });

  kpi('prKpis', [
    { label: 'Avg Tickets / Day', value: n1(avg(worked.map(function (r) { return r.tickets; }))), sub: 'per agent per day' },
    { label: 'Avg Productivity', html: wkRows.length ? pct(avg(wkRows.map(function (r) { return r.prod; }))) : '—',
      sub: 'actual vs target',
      tone: wkRows.length && avg(wkRows.map(function (r) { return r.prod; })) >= 1 ? 'good' : 'warn' },
    { label: 'Weekly Target', value: n0(sum(wkRows.map(function (r) { return r.target; }))), sub: 'combined target' },
    { label: 'Weekly Actual', value: n0(sum(wkRows.map(function (r) { return r.actual; }))), sub: 'combined actual' },
    { label: 'Avg Final Score', value: n1(avg(wkRows.map(function (r) { return r.score; }))), sub: 'out of 5' },
    { label: 'Days Off', value: n0(dp.filter(function (r) { return r.off; }).length), sub: 'in current view' }
  ]);

  var byAg = groupBy(worked, function (r) { return r.agent; });
  var ag = byAg.keys.slice().sort(function (a, b) {
    return sum(byAg.map[b].map(function (r) { return r.tickets; })) - sum(byAg.map[a].map(function (r) { return r.tickets; }));
  });
  barChart('chPrAgent', ag, ag.map(function (a) { return sum(byAg.map[a].map(function (r) { return r.tickets; })); }),
    { horizontal: true, label: 'Tickets' });

  // day -> date for the latest week in the current view
  var dayDate = {};
  (function () {
    var wd = null;
    dp.forEach(function (r) { if (r.week && (!wd || r.week > wd)) wd = r.week; });
    var w = dp.filter(function (r) { return r.week === wd; });
    w.forEach(function (r) { if (r.day && r.date) dayDate[r.day] = r.date; });
  })();

  var grid = buildProdGrid(dp);
  var cols = prodCols(function (d) { return dayDate[d]; });
  makeTable('prTable', cols, grid, { sort: 'weeklyActual', dir: 'desc', per: 25, pagerId: 'prPager',
    empty: 'No productivity records available for the selected filters.' });

  // ---- Daily Email Support Productivity (same sheet, separate section) ----
  var edp = slice(DATA.dailyEmailProductivity || []);
  var eWorked = edp.filter(function (r) { return !r.off && r.tickets !== null; });
  if (eWorked.length) {
    var eWkKeys = {}, eWkRows = [];
    edp.forEach(function (r) {
      var k = r.agent + '|' + r.week;
      if (eWkKeys[k]) return;
      eWkKeys[k] = 1;
      eWkRows.push({ agent: r.agent, week: r.week, target: r.weeklyTarget, actual: r.weeklyActual,
                    prod: r.productivityPct, score: r.finalScore });
    });
    // add KPIs for email productivity
    var extraKpis = [
      { label: 'Avg Email Tickets / Day', value: n1(avg(eWorked.map(function (r) { return r.tickets; }))), sub: 'per agent per day' },
      { label: 'Avg Email Productivity', html: eWkRows.length ? pct(avg(eWkRows.map(function (r) { return r.prod; }))) : '—',
        sub: 'actual vs target',
        tone: eWkRows.length && avg(eWkRows.map(function (r) { return r.prod; })) >= 1 ? 'good' : 'warn' },
      { label: 'Email Weekly Target', value: n0(sum(eWkRows.map(function (r) { return r.target; }))), sub: 'combined target' },
      { label: 'Email Weekly Actual', value: n0(sum(eWkRows.map(function (r) { return r.actual; }))), sub: 'combined actual' },
      { label: 'Days Off (Email)', value: n0(edp.filter(function (r) { return r.off; }).length), sub: 'in current view' }
    ];
    kpi('prEmailKpis', extraKpis);

    var eGrid = buildProdGrid(edp);
    var eCols = prodCols(function (d) {
      var wd2 = null;
      edp.forEach(function (r) { if (r.week && (!wd2 || r.week > wd2)) wd2 = r.week; });
      var w2 = edp.filter(function (r) { return r.week === wd2; });
      var ed = {};
      w2.forEach(function (r) { if (r.day && r.date) ed[r.day] = r.date; });
      return ed[d];
    });
    makeTable('prEmailTable', eCols, eGrid, { sort: 'weeklyActual', dir: 'desc', per: 25, pagerId: 'prEmailPager',
      empty: 'No email productivity records available for the selected filters.' });
  } else {
    var ek = $('prEmailKpis'); if (ek) ek.innerHTML = '';
    var et = $('prEmailTable'); if (et) { et.innerHTML = '<div class="empty"><b>No email productivity data</b>No "Daily Email Support Productivity Record" sections found in the current view.</div>'; }
  }
}

/* ---------------- WEEKLY CALL STATS ---------------- */
function ahtToSec(h) {
  if (!h) return null;
  var p = String(h).split(':');
  if (p.length < 2) return null;
  var sec = (+p[0]) * 3600 + (+p[1]) * 60 + (+(p[2] || 0));
  return isNaN(sec) ? null : sec;
}
function secToAht(s) {
  if (s === null || isNaN(s)) return '\u2014';
  s = Math.round(s);
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  var mS = ('0' + m).slice(-2), sS = ('0' + sec).slice(-2);
  return (h > 0 ? h + ':' : '') + mS + ':' + sS;
}
/** Per-line average pickup rate (weighted) + average AHT (mean of seconds). */
function callLineAvg(rows) {
  var att = sum(rows.map(function (r) { return r.attempts; }));
  var pic = sum(rows.map(function (r) { return r.pickedUp; }));
  var secs = rows.map(function (r) { return ahtToSec(r.aht); }).filter(function (s) { return s !== null; });
  return {
    pickupRate: att ? pic / att : null,
    aht: secs.length ? sum(secs) / secs.length : null,
    count: rows.length
  };
}
function renderCallTable(mountId, avgId, rows, empty) {
  var a = callLineAvg(rows);
  var avg = '';
  if (a.pickupRate !== null) avg += 'Avg Pickup ' + pct(a.pickupRate);
  if (a.aht !== null) avg += (avg ? ' \u00b7 ' : '') + 'Avg AHT ' + secToAht(a.aht);
  var el = $(avgId); if (el) el.textContent = avg;
  makeTable(mountId, [
    { key: 'week', label: 'Week', fmt: function (r) { return fmtWeek(r.week); }, sortVal: function (r) { return r.week; } },
    { key: 'agent', label: 'Agent' },
    { key: 'attempts', label: 'Attempts', num: true, fmt: function (r) { return n0(r.attempts); } },
    { key: 'pickedUp', label: 'Picked Up', num: true, fmt: function (r) { return n0(r.pickedUp); } },
    { key: 'notPickedUp', label: 'Not Picked', num: true, fmt: function (r) { return n0(r.notPickedUp); } },
    { key: 'pickupRate', label: 'Pickup Rate', num: true, fmt: function (r) { return scorePill(r.pickupRate); }, sortVal: function (r) { return r.pickupRate; } },
    { key: 'aht', label: 'AHT' }
  ], rows, { sort: 'week', dir: 'desc', empty: empty });
}
function renderCalls() {
  var cl = slice(DATA.weeklyCallStats);

  if (!cl.length) {
    var all = DATA.weeklyCallStats || [];
    var why = all.length
      ? 'No call statistics match the selected filters.'
      : 'The source sheet has no call-statistics blocks for ' + (DATA.dataYear || 2026) +
        ' yet. Fill in a \u201cWeekly Call Stats\u201d block (Ringing Attempts \u00b7 Picked Up \u00b7 AHT) ' +
        'under any week and it will appear here automatically after the next sync.';
    kpi('clKpis', [{ label: 'Weekly Call Stats', html: '\u2014', sub: 'nothing to show yet' }]);
    renderCallTable('clOhaTable', 'clOhaAvg', [], '');
    renderCallTable('clNbTable', 'clNbAvg', [], '');
    return;
  }

  // optional search-box filter (agent) applied before the line split
  var sq = (($('clSearch') || {}).value || '').toLowerCase().trim();
  if (sq) cl = cl.filter(function (r) { return (r.agent || '').toLowerCase().indexOf(sq) >= 0; });

  var attempts = sum(cl.map(function (r) { return r.attempts; }));
  var picked = sum(cl.map(function (r) { return r.pickedUp; }));
  var agents = uniq(cl.map(function (r) { return r.agent; }));
  var weeks = uniq(cl.map(function (r) { return r.week; }));

  kpi('clKpis', [
    { label: 'Total Calls Handled', value: n0(picked), sub: 'picked up' },
    { label: 'Total Call Volume', value: n0(attempts), sub: 'ringing attempts' },
    { label: 'Not Picked Up', value: n0(sum(cl.map(function (r) { return r.notPickedUp; }))), sub: 'missed' },
    { label: 'Pickup Rate', html: attempts ? pct(picked / attempts) : '\u2014', sub: 'team average',
      tone: attempts && picked / attempts >= 0.95 ? 'good' : 'warn' },
    { label: 'Avg Calls / Agent', value: agents.length ? n1(picked / agents.length) : '\u2014', sub: n0(agents.length) + ' agents' },
    { label: 'Weeks Covered', value: n0(weeks.length), sub: 'in current view' }
  ]);

  // split by hotline line (OHA vs ALL BRANDS) - same source as the Schedule page
    var hl = agentHotlineMap();
    var oha = cl.filter(function (r) { return (hl[r.agent] || 'ALL BRANDS') === 'OHA'; });
    var nb  = cl.filter(function (r) { return (hl[r.agent] || 'ALL BRANDS') !== 'OHA'; });

    renderCallTable('clOhaTable', 'clOhaAvg', oha, 'No OHA call statistics match the selected filters.');
    renderCallTable('clNbTable', 'clNbAvg', nb, 'No All-Brands call statistics match the selected filters.');

    renderCallCompare(oha, nb);
  }

  /* ---------------- WEEK COMPARISON (side-by-side, per line) ---------------- */
      function renderCallCompare(oha, nb) {
        var card = $('clCmpCard'), sel = $('clCmpWeek');
        if (!card) return;

        var allWeeks = uniq((DATA.weeklyCallStats || []).map(function (r) { return r.week; })).sort();
        if (allWeeks.length < 2) { card.hidden = true; return; }
        card.hidden = false;

        // week selector: pick the "current" week; compare against the previous one
        if (sel) {
          sel.innerHTML = allWeeks.map(function (w) {
            return '<option value="' + esc(w) + '">' + esc(fmtWeek(w)) + '</option>';
          }).join('');
          var def = F.week && F.week !== 'ALL' && allWeeks.indexOf(F.week) >= 0 ? F.week : allWeeks[allWeeks.length - 1];
          sel.value = def;
          sel.onchange = function () { renderCallCompare(oha, nb); };
        }
        var cur = sel ? sel.value : allWeeks[allWeeks.length - 1];
        var i = allWeeks.indexOf(cur);
        var prev = i > 0 ? allWeeks[i - 1] : null;
        if (!prev) { card.hidden = true; return; }

        function lineAvg(rows, week) {
          return callLineAvg(rows.filter(function (r) { return r.week === week; }));
        }

        function deltaHtml(d, higherIsBetter, isPct) {
          if (d === null || d === undefined) return '<span class="cmp-delta flat">\u2014</span>';
          if (Math.abs(d) < 1e-9) return '<span class="cmp-delta flat">\u25b6 0</span>';
          var up = d > 0;
          var good = higherIsBetter ? up : !up;
          var arrow = up ? '\u25b2' : '\u25bc';
          var cls = good ? 'up' : 'down';
          var mag = isPct ? pct(Math.abs(d)) : secToAht(Math.abs(d));
          return '<span class="cmp-delta ' + cls + '">' + arrow + ' ' + mag + '</span>';
        }

        // side-by-side: two week averages + change column
        function renderSide(mountId, rows, label) {
          var a = lineAvg(rows, cur), b = lineAvg(rows, prev);
          var pr = deltaHtml(a.pickupRate !== null && b.pickupRate !== null ? a.pickupRate - b.pickupRate : null, true, true);
          var aht = deltaHtml(a.aht !== null && b.aht !== null ? a.aht - b.aht : null, false, false);
          var el = $(mountId);
          if (!el) return;
          el.innerHTML =
            '<div class="cmp-avg"><span class="cmp-label">' + label + ' — Avg Pickup</span>' +
              (a.pickupRate !== null ? '<span class="cmp-cur">' + pct(a.pickupRate) + '</span>' : '') +
              (b.pickupRate !== null ? '<span class="cmp-prev">' + pct(b.pickupRate) + '</span>' : '') +
              '<span class="cmp-delta">' + pr + '</span></div>' +
            '<div class="cmp-avg"><span class="cmp-label">Avg AHT</span>' +
              (a.aht !== null ? '<span class="cmp-cur">' + secToAht(a.aht) + '</span>' : '') +
              (b.aht !== null ? '<span class="cmp-prev">' + secToAht(b.aht) + '</span>' : '') +
              '<span class="cmp-delta">' + aht + '</span></div>';
        }

        renderSide('clCmpOha', oha, 'OHA');
        renderSide('clCmpNb', nb, 'All Brands');
      }

/* ---------------- QA SCORES (all agents, one page) ---------------- */
function renderQa() {
  var qa = slice(DATA.qaScores);
  var byAg = groupBy(qa, function (r) { return r.agent; });
  var ranked = byAg.keys.map(function (a) {
    var rows = byAg.map[a];
    return { agent: a, score: avg(rows.map(function (r) { return r.score; })), evals: rows.length,
             perfect: rows.filter(function (r) { return r.score >= 1; }).length };
  }).sort(function (x, y) { return y.score - x.score; });
  ranked.forEach(function (r, i) { r.rank = i + 1; });

  kpi('qaKpis', [
    { label: 'Average QA Score', html: qa.length ? pct(avg(qa.map(function (r) { return r.score; }))) : '—',
      sub: 'team average', tone: qa.length && avg(qa.map(function (r) { return r.score; })) >= 0.95 ? 'good' : 'warn' }
  ]);

  // podium
  var pod = $('qaPodium');
  if (!ranked.length) {
    pod.innerHTML = '<div class="empty"><b>No QA rankings</b>No QA records available for the selected filters.</div>';
  } else {
    var medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];
    pod.innerHTML = ranked.slice(0, 3).map(function (r, i) {
      return '<div class="pod' + (i === 0 ? ' p1' : '') + '">' +
        '<div class="medal">' + medals[i] + '</div>' +
        '<div class="nm">' + esc(r.agent) + '</div>' +
        '<div class="sc">' + pct(r.score) + '</div>' +
        '<div class="mt">' + n0(r.evals) + ' evaluations</div></div>';
    }).join('');
  }

  makeTable('qaRank', [
    { key: 'rank', label: 'Rank', num: true,
      fmt: function (r) { return r.rank <= 3 ? ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'][r.rank - 1] + ' ' + r.rank : '<span class="rank">' + r.rank + '</span>'; } },
    { key: 'agent', label: 'Agent' },
    { key: 'score', label: 'QA Score', num: true, fmt: function (r) { return scorePill(r.score); } },
    { key: 'evals', label: 'Evaluations', num: true, fmt: function (r) { return n0(r.evals); } },
    { key: 'perfect', label: 'Perfect', num: true, fmt: function (r) { return n0(r.perfect); } }
  ], ranked, { sort: 'rank', dir: 'asc', empty: 'No QA records available for this agent.' });

  // QA evaluations: list of agents (name + overall score), click to open lightbox
    var list = $('qaAgentList');
    if (list) {
      if (!ranked.length) {
        list.innerHTML = '<div class="empty"><b>No QA records</b>No QA evaluations available for the selected filters.</div>';
      } else {
        list.innerHTML = ranked.map(function (r) {
          return '<button type="button" class="qa-agent-row" onclick="openQaAgent(\'' + esc(r.agent) + '\')">' +
            '<span class="qa-agent-name">' + esc(r.agent) + '</span>' +
            '<span class="qa-agent-score">' + scorePill(r.score) + '</span>' +
            '<span class="qa-agent-evals">' + n0(r.evals) + ' eval' + (r.evals > 1 ? 's' : '') + '</span>' +
            '<span class="qa-agent-arrow">&#9654;</span>' +
            '</button>';
        }).join('');
      }
    }

    renderQaJacky();
  }

  /* Open the QA lightbox for one agent: fullscreen list of their QA tickets + scores. */
  function openQaAgent(agent) {
    var lb = document.getElementById('lb');
    var img = document.getElementById('lbImg');
    var fr = document.getElementById('lbFrame');
    var content = document.getElementById('lbContent');
    if (!lb || !content) return;
    if (img) img.style.display = 'none';
    if (fr) fr.style.display = 'none';
    content.style.display = 'block';
    var rows = (DATA.qaScores || []).filter(function (r) { return r.agent === agent; })
      .slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var avgSc = rows.length ? avg(rows.map(function (r) { return r.score; })) : null;
    var html = '<div class="qa-lb-head">' +
      '<span class="qa-lb-title">' + esc(agent) + '</span>' +
      '<span class="qa-lb-meta">' + n0(rows.length) + ' evaluation' + (rows.length > 1 ? 's' : '') +
      (avgSc !== null ? ' &middot; avg ' + pct(avgSc) : '') + '</span></div>';
    if (!rows.length) {
      html += '<div class="empty"><b>No QA records</b>No QA evaluations for ' + esc(agent) + '.</div>';
    } else {
      html += '<div class="tscroll"><table class="qa-agent-table"><thead><tr>' +
        '<th>Date</th><th>Day</th><th>Score</th><th>Ticket</th><th>Notes</th></tr></thead><tbody>';
      rows.forEach(function (x) {
        html += '<tr>' +
          '<td>' + fmtDate(x.date) + '</td>' +
          '<td>' + esc(x.day || '—') + '</td>' +
          '<td>' + scorePill(x.score, 1) + '</td>' +
          '<td>' + (x.link ? '<a href="' + esc(x.link) + '" target="_blank" rel="noopener" style="color:#C93B72">View</a>' : '—') + '</td>' +
          '<td>' + esc(x.notes || '—') + '</td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
    }
    content.innerHTML = html;
        lb.classList.add('show');
      }

/* QA Jacky / TL breakdown - mirrors the sheet's QA JACKY SCORE 30% / QA TL SCORE 10% block. */
function renderQaJacky() {
  var rows = slice(DATA.qaBreakdown);
  // show the latest week first; if a specific week is selected, respect it
  var wk = uniq(rows.map(function (r) { return r.week; })).sort().reverse();
  var target = F.week !== 'ALL' && wk.indexOf(F.week) >= 0 ? F.week : wk[0];
  var view = target ? rows.filter(function (r) { return r.week === target; }) : rows;

  var pctv = function (v) {
    if (v === null || v === undefined) return '—';
    var p = (v > 1.5 ? v : v * 100);          // sheet stores 1.0 = 100%
    return pct(p / 100, 0);
  };

  makeTable('qaJacky', [
    { key: 'agent', label: 'Name of Agent' },
    { key: 'jacky', label: 'QA Jacky Score 30%', num: true, fmt: function (r) { return pctv(r.jacky); }, sortVal: function (r) { return r.jacky; } },
    { key: 'tl', label: 'QA TL Score 10%', num: true, fmt: function (r) { return pctv(r.tl); }, sortVal: function (r) { return r.tl; } },
    { key: 'finalQA', label: 'Final QA Score', num: true, fmt: function (r) { return pctv(r.finalQA); }, sortVal: function (r) { return r.finalQA; } },
    { key: 'productivityPct', label: 'Productivity % (30%)', num: true, fmt: function (r) { return pctv(r.productivityPct); }, sortVal: function (r) { return r.productivityPct; } },
    { key: 'finalProductivity', label: 'Final Productivity Score', num: true, fmt: function (r) { return pctv(r.finalProductivity); }, sortVal: function (r) { return r.finalProductivity; } }
  ], view, { sort: 'agent', dir: 'asc', empty: 'No QA Jacky/TL scores available for the selected filters.' });
}
