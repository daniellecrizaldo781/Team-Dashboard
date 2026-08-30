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
    { label: 'Average QA Score', html: qa.length ? pct(avg(qa.map(function (r) { return r.score; }))) : '\u2014',
      sub: qa.length ? n0(qa.length) + ' evaluations' : 'no QA records',
      tone: qa.length && avg(qa.map(function (r) { return r.score; })) >= 0.95 ? 'good' : '' }
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
    var latest = datedC.concat(undatedC).slice(0, 6);
    function showList() {
      if (ovd) { ovd.hidden = true; ovd.innerHTML = ''; }
      ovc.hidden = false;
      ovc.innerHTML = latest.map(function (r) {
        var idx = allC.indexOf(r);
        var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var dateTxt = r.dateLabel || r.date || '';
        if (r.ts) { var d = new Date(r.ts); dateTxt = MON[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear(); }
        return '<button class="casc-row" data-cidx="' + idx + '">' +
          '<span class="pill n casc-cat">' + esc(r.category) + '</span>' +
          '<span class="casc-row-title">' + esc(r.title || '(untitled)') + '</span>' +
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
}

/* ---------------- DAILY PRODUCTIVITY ---------------- */
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
    { label: 'Avg Productivity', html: wkRows.length ? pct(avg(wkRows.map(function (r) { return r.prod; }))) : '\u2014',
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

  // weekly grid: one row per agent, columns = Name | Wk Target | Actual |
  // Mon..Sun (ticket or OFF) | Productivity % | Final Score  - matching the sheet
  var byAg = groupBy(dp, function (r) { return r.agent; });
  var agents = byAg.keys.slice().sort();
  var dayKeys = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
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
  // sort by actual productivity desc
  grid.sort(function (x, y) { return (y.weeklyActual || 0) - (x.weeklyActual || 0); });

  var cols = [
    { key: 'agent', label: 'Name of Agent' },
    { key: 'weeklyTarget', label: 'Weekly Target', num: true, fmt: function (r) { return n0(r.weeklyTarget); } },
    { key: 'weeklyActual', label: 'Actual Productivity', num: true, fmt: function (r) { return n0(r.weeklyActual); } }
  ];
  dayKeys.forEach(function (d) {
    cols.push({ key: d, label: d, num: true,
      fmt: function (r) { var c = r.cells[dayKeys.indexOf(d)]; return c.off ? '<span class="pill off">OFF</span>' : c.v; } });
  });
  cols.push({ key: 'productivityPct', label: 'Productivity %', num: true,
    fmt: function (r) { return r.productivityPct === null ? '—' : scorePill(r.productivityPct); }, sortVal: function (r) { return r.productivityPct; } });
  cols.push({ key: 'finalScore', label: 'Final Score', num: true, fmt: function (r) { return n1(r.finalScore); } });

  makeTable('prTable', cols, grid, { sort: 'weeklyActual', dir: 'desc', per: 25, pagerId: 'prPager',
    empty: 'No productivity records available for the selected filters.' });
}

/* ---------------- WEEKLY CALL STATS ---------------- */
function renderCalls() {
  var cl = slice(DATA.weeklyCallStats);

  if (!cl.length) {
    var all = DATA.weeklyCallStats || [];
    var why = all.length
      ? 'No call statistics match the selected filters.'
      : 'The source sheet has no call-statistics blocks for ' + (DATA.dataYear || 2026) +
        ' yet. Fill in a \u201cWeekly Call Stats\u201d block (Ringing Attempts \u00b7 Picked Up \u00b7 AHT) ' +
        'under any week and it will appear here automatically after the next sync.';
    kpi('clKpis', [{ label: 'Weekly Call Stats', html: '—', sub: 'nothing to show yet' }]);
    chartEmpty('chClAgent');
    makeTable('clTable', [{ key: 'agent', label: 'Agent' }], [], { empty: why });
    return;
  }

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

  var byWk = groupBy(cl, function (r) { return r.week; });
  var wk = byWk.keys.slice().sort();

  var byAg = groupBy(cl, function (r) { return r.agent; });
  var ag = byAg.keys.slice().sort(function (a, b) {
    return sum(byAg.map[b].map(function (r) { return r.pickedUp; })) - sum(byAg.map[a].map(function (r) { return r.pickedUp; }));
  });
  makeTable('clTable', [
    { key: 'week', label: 'Week', fmt: function (r) { return fmtWeek(r.week); }, sortVal: function (r) { return r.week; } },
    { key: 'agent', label: 'Agent' },
    { key: 'attempts', label: 'Attempts', num: true, fmt: function (r) { return n0(r.attempts); } },
    { key: 'pickedUp', label: 'Picked Up', num: true, fmt: function (r) { return n0(r.pickedUp); } },
    { key: 'notPickedUp', label: 'Not Picked', num: true, fmt: function (r) { return n0(r.notPickedUp); } },
    { key: 'pickupRate', label: 'Pickup Rate', num: true, fmt: function (r) { return scorePill(r.pickupRate); }, sortVal: function (r) { return r.pickupRate; } },
    { key: 'aht', label: 'AHT' }
  ], cl, { sort: 'week', dir: 'desc' });
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

  // QA evaluations: pick one agent from the dropdown, show only their table
  var wrap = $('qaByAgent');
  var sel = $('qaAgentSel');
  if (!wrap || !sel) return;
  if (ranked.length) {
    sel.innerHTML = ranked.map(function (r) {
      return '<option value="' + esc(r.agent) + '">' + esc(r.agent) + ' (' + pct(r.score) + ')</option>';
    }).join('');
    if (F.qaAgent !== 'ALL' && ranked.filter(function (r) { return r.agent === F.qaAgent; }).length === 0) F.qaAgent = 'ALL';
    sel.value = (F.qaAgent && F.qaAgent !== 'ALL') ? F.qaAgent : ranked[0].agent;
    sel.onchange = function () { F.qaAgent = this.value; renderQa(); };
  }
  var chosen = (F.qaAgent && F.qaAgent !== 'ALL') ? F.qaAgent : (ranked[0] && ranked[0].agent);
  var rows = chosen ? (byAg.map[chosen] || []).slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); }) : [];
  if (!rows.length) {
    wrap.innerHTML = '<div class="empty"><b>No QA records</b>No QA evaluations for ' + esc(chosen || 'this agent') + '.</div>';
  } else {
    var avgSc = avg(rows.map(function (r) { return r.score; }));
    var html = '<div class="qa-agent-block">';
    html += '<div class="qa-agent-head"><span class="qa-agent-name">' + esc(chosen) + '</span>' +
            '<span class="qa-agent-meta">' + n0(rows.length) + ' evaluation' + (rows.length > 1 ? 's' : '') +
            ' &middot; avg ' + pct(avgSc) + '</span></div>';
    html += '<div class="tscroll"><table class="qa-agent-table"><thead><tr>' +
            '<th>Date</th><th>Day</th><th>Score</th><th>Ticket</th><th>Notes</th></tr></thead><tbody>';
    rows.forEach(function (x) {
      html += '<tr>' +
        '<td>' + fmtDate(x.date) + '</td>' +
        '<td>' + esc(x.day || '—') + '</td>' +
        '<td>' + scorePill(x.score, 0) + '</td>' +
        '<td>' + (x.link ? '<a href="' + esc(x.link) + '" target="_blank" rel="noopener" style="color:#C93B72">View</a>' : '—') + '</td>' +
        '<td>' + esc(x.notes || '—') + '</td>' +
      '</tr>';
    });
    html += '</tbody></table></div></div>';
    wrap.innerHTML = html;
  }

  renderQaJacky();
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
