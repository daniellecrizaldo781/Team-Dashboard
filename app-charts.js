/* ============================================================
 * app-charts.js - Chart.js wrappers + reusable table builder
 * ============================================================ */

var CHARTS = {};
var PINK = {
  rose: '#E8578E', roseD: '#C93B72', dusty: '#D9A0B8', mauve: '#A96A94',
  lav: '#B99BDD', blush: '#FBE7EF', ink: '#3A2233', ink3: '#9B8090',
  ok: '#2FA37A', warn: '#E0A33A', bad: '#D9455F'
};
var SERIES = [PINK.rose, PINK.lav, PINK.dusty, PINK.mauve, PINK.roseD, '#7FB6E3', PINK.ok, PINK.warn];

if (window.Chart) {
  Chart.defaults.font.family = '"Segoe UI",Inter,system-ui,sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = PINK.ink3;
  Chart.defaults.maintainAspectRatio = false;
}

function destroyChart(id) {
  if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; }
}

/** Renders an empty-state message in place of a chart. */
function chartEmpty(id, msg) {
  destroyChart(id);
  var c = document.getElementById(id);
  if (!c) return true;
  var box = c.parentNode;
  var old = box.querySelector('.empty');
  if (old) old.remove();
  c.style.display = 'none';
  box.appendChild(el('div', 'empty', '<b>No data available</b>' + esc(msg || 'for the selected filters.')));
  return true;
}
function chartReady(id) {
  var c = document.getElementById(id);
  if (!c) return null;
  var box = c.parentNode;
  var old = box.querySelector('.empty');
  if (old) old.remove();
  c.style.display = '';
  return c;
}

var TIP = {
  backgroundColor: 'rgba(58,34,51,.93)', padding: 11, cornerRadius: 9,
  titleFont: { size: 12.5, weight: '600' }, bodyFont: { size: 12.5 },
  displayColors: true, boxPadding: 4
};

function mkChart(id, cfg) {
  var c = chartReady(id);
  if (!c) return;
  destroyChart(id);
  CHARTS[id] = new Chart(c.getContext('2d'), cfg);
}

/** Bar chart. opts: {horizontal, percent, color, label} */
function barChart(id, labels, values, opts) {
  opts = opts || {};
  if (!labels.length) return chartEmpty(id);
  mkChart(id, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: opts.label || 'Value',
        data: values,
        backgroundColor: opts.colors || (opts.color || PINK.rose),
        borderRadius: 7,
        borderSkipped: false,
        maxBarThickness: 42
      }]
    },
    options: {
      indexAxis: opts.horizontal ? 'y' : 'x',
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: Object.assign({}, TIP, {
          callbacks: {
            label: function (c) {
              var v = c.parsed[opts.horizontal ? 'x' : 'y'];
              return ' ' + (opts.percent ? pct(v) : n1(v)) + (opts.unit ? ' ' + opts.unit : '');
            }
          }
        })
      },
      scales: {
        x: {
          grid: { display: !!opts.horizontal, color: PINK.blush },
          ticks: {
            autoSkip: false, maxRotation: 40, minRotation: 0,
            callback: function (v, i) {
              if (opts.horizontal) return opts.percent ? pct(v, 0) : v;
              var l = String(this.getLabelForValue(v));
              return l.length > 14 ? l.slice(0, 13) + '\u2026' : l;
            }
          }
        },
        y: {
          beginAtZero: true,
          grid: { display: !opts.horizontal, color: PINK.blush },
          ticks: {
            callback: function (v) {
              if (opts.horizontal) {
                var l = String(this.getLabelForValue(v));
                return l.length > 16 ? l.slice(0, 15) + '\u2026' : l;
              }
              return opts.percent ? pct(v, 0) : v;
            }
          }
        }
      }
    }
  });
}

/** Line chart. series = [{label, data, color}] */
function lineChart(id, labels, series, opts) {
  opts = opts || {};
  if (!labels.length || !series.length) return chartEmpty(id);
  mkChart(id, {
    type: 'line',
    data: {
      labels: labels,
      datasets: series.map(function (s, i) {
        var col = s.color || SERIES[i % SERIES.length];
        return {
          label: s.label, data: s.data, borderColor: col,
          backgroundColor: col + '22', fill: series.length === 1,
          tension: .34, borderWidth: 2.5, pointRadius: 3.5,
          pointBackgroundColor: '#fff', pointBorderColor: col, pointBorderWidth: 2,
          spanGaps: true
        };
      })
    },
    options: {
      responsive: true, interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: series.length > 1
          ? { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, boxWidth: 7 } }
          : { display: false },
        tooltip: Object.assign({}, TIP, {
          callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + (opts.percent ? pct(c.parsed.y) : n1(c.parsed.y)); } }
        })
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 40, autoSkip: true, maxTicksLimit: 10 } },
        y: {
          beginAtZero: !opts.noZero, grid: { color: PINK.blush },
          ticks: { callback: function (v) { return opts.percent ? pct(v, 0) : v; } }
        }
      }
    }
  });
}

/** Doughnut chart. parts = [{label, value}] */
function donut(id, parts, colorMap) {
  parts = (parts || []).filter(function (p) { return p.value > 0; });
  if (!parts.length) return chartEmpty(id);
  mkChart(id, {
    type: 'doughnut',
    data: {
      labels: parts.map(function (p) { return p.label; }),
      datasets: [{
        data: parts.map(function (p) { return p.value; }),
        backgroundColor: parts.map(function (p, i) {
          return (colorMap && colorMap[p.label]) || SERIES[i % SERIES.length];
        }),
        borderColor: '#fff', borderWidth: 2.5, hoverOffset: 7
      }]
    },
    options: {
      responsive: true, cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 13, boxWidth: 7 } },
        tooltip: Object.assign({}, TIP, {
          callbacks: {
            label: function (c) {
              var t = c.dataset.data.reduce(function (a, b) { return a + b; }, 0);
              return ' ' + c.label + ': ' + c.parsed + ' (' + (t ? (c.parsed / t * 100).toFixed(0) : 0) + '%)';
            }
          }
        })
      }
    }
  });
}

function resizeCharts() {
  Object.keys(CHARTS).forEach(function (k) { try { CHARTS[k].resize(); } catch (e) {} });
}

/* ============================================================
 * Reusable interactive table (search + sort + pagination)
 * cols: [{key, label, num, fmt(row), sortVal(row)}]
 * ============================================================ */
function makeTable(mountId, cols, rows, opts) {
  opts = opts || {};
  var mount = $(mountId);
  if (!mount) return;
  var st = mount._st || (mount._st = { sort: opts.sort || null, dir: opts.dir || 'desc', page: 1, q: '' });
  st.rows = rows;
  st.cols = cols;
  st.per = opts.per || 0;
  st.empty = opts.empty || 'No data available for the selected filters.';
  st.pagerId = opts.pagerId;
  drawTable(mount);
}

function drawTable(mount) {
  var st = mount._st, cols = st.cols;
  var rows = st.rows.slice();

  if (st.q) {
    var q = st.q.toLowerCase();
    rows = rows.filter(function (r) {
      return cols.some(function (c) {
        var v = c.text ? c.text(r) : r[c.key];
        return String(v === null || v === undefined ? '' : v).toLowerCase().indexOf(q) >= 0;
      });
    });
  }

  if (st.sort) {
    var col = cols.filter(function (c) { return c.key === st.sort; })[0];
    if (col) {
      var sgn = st.dir === 'asc' ? 1 : -1;
      rows.sort(function (a, b) {
        var x = col.sortVal ? col.sortVal(a) : a[col.key];
        var y = col.sortVal ? col.sortVal(b) : b[col.key];
        if (x === null || x === undefined || x === '') return 1;
        if (y === null || y === undefined || y === '') return -1;
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * sgn;
        return String(x).localeCompare(String(y)) * sgn;
      });
    }
  }

  var total = rows.length;
  if (!total) {
    mount.innerHTML = '<div class="empty"><b>No results</b>' + esc(st.empty) + '</div>';
    if (st.pagerId && $(st.pagerId)) $(st.pagerId).innerHTML = '';
    return;
  }

  var pages = st.per ? Math.max(1, Math.ceil(total / st.per)) : 1;
  if (st.page > pages) st.page = pages;
  var view = st.per ? rows.slice((st.page - 1) * st.per, st.page * st.per) : rows;

  var h = '<table><thead><tr>';
  cols.forEach(function (c) {
    var act = st.sort === c.key ? (st.dir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
    h += '<th class="sortable' + (c.num ? ' num' : '') + '" data-k="' + esc(c.key) + '">' + esc(c.label) + act + '</th>';
  });
  h += '</tr></thead><tbody>';
  view.forEach(function (r) {
    h += '<tr>';
    cols.forEach(function (c) {
      h += '<td' + (c.num ? ' class="num"' : '') + '>' + (c.fmt ? c.fmt(r) : esc(r[c.key])) + '</td>';
    });
    h += '</tr>';
  });
  h += '</tbody></table>';
  mount.innerHTML = h;

  mount.querySelectorAll('th.sortable').forEach(function (th) {
    th.onclick = function () {
      var k = th.getAttribute('data-k');
      if (st.sort === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
      else { st.sort = k; st.dir = 'desc'; }
      drawTable(mount);
    };
  });

  if (st.pagerId && $(st.pagerId)) {
    var p = $(st.pagerId);
    if (pages <= 1) { p.innerHTML = ''; return; }
    p.innerHTML = '';
    var prev = el('button', '', '\u2039 Prev'); prev.disabled = st.page <= 1;
    var next = el('button', '', 'Next \u203A'); next.disabled = st.page >= pages;
    var lbl = el('span', '', 'Page ' + st.page + ' of ' + pages + ' \u00b7 ' + total.toLocaleString() + ' rows');
    prev.onclick = function () { st.page--; drawTable(mount); };
    next.onclick = function () { st.page++; drawTable(mount); };
    p.appendChild(prev); p.appendChild(lbl); p.appendChild(next);
  }
}

function wireSearch(inputId, mountId) {
  var i = $(inputId);
  if (!i) return;
  i.oninput = function () {
    var m = $(mountId);
    if (m && m._st) { m._st.q = i.value; m._st.page = 1; drawTable(m); }
  };
}

/* score -> pill class, using the sheet's own 0-1 scale */
function scorePill(v, d) {
  if (v === null || v === undefined || isNaN(v)) return '<span class="pill off">\u2014</span>';
  var k = v >= 0.95 ? 'ok' : (v >= 0.85 ? 'warn' : 'bad');
  return '<span class="pill ' + k + '">' + pct(v, d === undefined ? 1 : d) + '</span>';
}
