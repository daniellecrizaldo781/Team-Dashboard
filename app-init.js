/* ============================================================
 * app-init.js - dispatcher, navigation, filters, auto-refresh
 * ============================================================ */

var PAGE_META = {
  overview:     ['Overview', 'Team performance at a glance'],
  productivity: ['Daily Productivity', 'Daily ticket handling and productivity vs target'],
  calls:        ['Weekly Call Stats', 'Call volume and pickup performance by week'],
  qa:           ['QA Scores', 'Quality evaluations and rankings for all agents'],
  scorecards:   ['Scorecards', 'Official overall scores and team ranking'],
  roster:       ['Team Schedule & OT', 'Shifts, rest days, overtime and breaks by agent'],
  cascades:     ['Cascades & Handling', 'Process cascades, handling notes and reference links'],
  leave:        ['Leave Requests', 'File and view leave requests'],
  products:      ['Products', 'Product guides, inclusions and handling'],
  resources:     ['Resources', 'Quick links, guides and contacts for the team'],
};

/** Single dispatcher - every page re-renders from current filter state. */
function render() {
  if (!DATA) return;
  // Each page re-renders; the Scorecards page internally toggles Weekly/Monthly.
  try { renderOverview(); }     catch (e) { console.error('overview', e); }
  try { renderProductivity(); } catch (e) { console.error('productivity', e); }
  try { renderCalls(); }        catch (e) { console.error('calls', e); }
  try { renderQa(); }           catch (e) { console.error('qa', e); }
  try { renderScorecards(); }   catch (e) { console.error('scorecards', e); }
  try { renderRoster(); }       catch (e) { console.error('roster', e); }
  try { renderCascades(); }     catch (e) { console.error('cascades', e); }
  try { renderLeaves(); }       catch (e) { console.error('leave', e); }
  try { renderProducts(); }     catch (e) { console.error('products', e); }
  try { renderResources(); }    catch (e) { console.error('resources', e); }
  setTimeout(resizeCharts, 30);
}

function setPage(p) {
  PAGE = p;
  var cap = p.charAt(0).toUpperCase() + p.slice(1);
  document.querySelectorAll('.page').forEach(function (s) { s.hidden = s.id !== 'page' + cap; });
  document.querySelectorAll('.nav-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-page') === p);
  });
  var m = PAGE_META[p] || ['', ''];
  $('pageTitle').textContent = m[0];
  $('pageSub').textContent = m[1];
  // Schedule, OT&Break, Leave, Scorecards, Products, Resources & Overview use
  // their own controls, not the global filter bar (Overview shows no filters)
  var filters = $('filters');
  if (filters) filters.style.display = (p === 'roster' || p === 'cascades' || p === 'leave' || p === 'scorecards' || p === 'resources' || p === 'products' || p === 'overview') ? 'none' : '';
  closeNav();
  window.scrollTo(0, 0);
  setTimeout(resizeCharts, 40);   // charts sized inside a hidden box measure 0
}

function openNav() { $('topnav').classList.add('open'); $('backdrop').classList.add('show'); }
function closeNav() { $('topnav').classList.remove('open'); $('backdrop').classList.remove('show'); }

/** Roster page = Team Schedule + OT & Break rendered into the combined page. */
function renderRoster() {
  try { renderSchedule(); } catch (e) { console.error('schedule', e); }
  try { renderOtBreak(); }  catch (e) { console.error('otbreak', e); }
}

/** Populate filter dropdowns from the data - nothing hard-coded. */
function fillSelects() {
  if (!DATA) return;
  var a = $('fAgent'), w = $('fWeek');

  var agents = allAgents(DATA);
  var keepA = F.agent;
  a.innerHTML = '<option value="ALL">All Agents</option>' +
    agents.map(function (x) { return '<option value="' + esc(x) + '">' + esc(x) + '</option>'; }).join('');
  a.value = agents.indexOf(keepA) >= 0 ? keepA : 'ALL';
  F.agent = a.value;

  var weeks = allWeeks(DATA);
  var keepW = F.week;
  var now = thisWeekStart();
  // "Current/Previous" are anchored to today, not to the furthest future roster week
  var past = weeks.filter(function (x) { return x <= now; });
  var cur = past[0] || weeks[0];
  var prev = past[1];
  var opts = ['<option value="ALL">All Weeks</option>'];
  if (cur)  opts.push('<option value="' + esc(cur) + '">Current Week (' + fmtWeek(cur) + ')</option>');
  if (prev) opts.push('<option value="' + esc(prev) + '">Previous Week (' + fmtWeek(prev) + ')</option>');
  weeks.forEach(function (x) {
    if (x === cur || x === prev) return;
    opts.push('<option value="' + esc(x) + '">' + fmtWeek(x) + (x > now ? ' (upcoming)' : '') + '</option>');
  });
  w.innerHTML = opts.join('');
  w.value = weeks.indexOf(keepW) >= 0 ? keepW : 'ALL';
  F.week = w.value;
}

function wire() {
  document.querySelectorAll('.nav-btn').forEach(function (b) {
    b.onclick = function () { setPage(b.getAttribute('data-page')); };
  });
  $('navToggle').onclick = function () {
    $('topnav').classList.contains('open') ? closeNav() : openNav();
  };
  $('backdrop').onclick = closeNav;

  // lightbox close
  var lb = $('lb');
  if (lb) {
    lb.onclick = function () { lb.classList.remove('show'); };
    var lc = $('lbClose'); if (lc) lc.onclick = function (e) { e.stopPropagation(); lb.classList.remove('show'); };
  }

  $('fAgent').onchange = function () { F.agent = this.value; render(); };
  $('fWeek').onchange  = function () {
    F.week = this.value;
    render();
  };
  $('btnReset').onclick = function () {
    F = { agent: 'ALL', week: 'ALL', moMonth: '', moAgent: '', lvMonth: '', qaAgent: 'ALL', scAgent: '', scWeek: '',
          tsWeek: '', otWeek: '', scRankWeek: '', from: '', to: '' };
    $('fAgent').value = 'ALL'; $('fWeek').value = 'ALL';
    ['otWeek', 'scRankWeek'].forEach(function (id) { if ($(id)) $(id).value = ''; });
    ['prSearch', 'clSearch', 'scSearch', 'bkSearch']
      .forEach(function (id) { if ($(id)) $(id).value = ''; });
    ['prTable', 'clTable', 'scTable', 'bkTable']
      .forEach(function (id) { if ($(id) && $(id)._st) { $(id)._st.q = ''; $(id)._st.page = 1; } });
    render();
    toast('Filters reset.');
  };

  $('btnRefresh').onclick = function () { fetchData(true); };

  document.querySelectorAll('#obTabs .tab').forEach(function (t) {
    t.onclick = function () {
      document.querySelectorAll('#obTabs .tab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      var k = t.getAttribute('data-tab');
      $('obOt').hidden = k !== 'ot';
      $('obBrk').hidden = k !== 'brk';
      setTimeout(resizeCharts, 30);
    };
  });

  // Scorecards Weekly / Monthly chip toggle (single page)
  document.querySelectorAll('#scChips .chip').forEach(function (c) {
    c.onclick = function () {
      document.querySelectorAll('#scChips .chip').forEach(function (x) { x.classList.remove('active'); });
      c.classList.add('active');
      var mode = c.getAttribute('data-mode');
      var weekly = mode === 'weekly';
      $('scWeekly').hidden = !weekly;
      $('scMonthly').hidden = weekly;
      if (!weekly) { try { renderMonthly(); } catch (e) { console.error('monthly', e); } }
      else { try { renderScorecards(); } catch (e) { console.error('scorecards', e); } }
      setTimeout(resizeCharts, 30);
    };
  });

  wireSearch('prSearch', 'prTable');
  wireSearch('clSearch', 'clTable');
  wireSearch('scSearch', 'scTable');
  wireSearch('bkSearch', 'bkTable');

  // OT & Break: week selector (matches the Schedule pattern)
  function bindRange(id, key) {
    var el = $(id);
    if (!el) return;
    el.onchange = function () { F[key] = this.value; renderOtBreak(); };
  }
  ['otWeek'].forEach(function (id) { bindRange(id, id); });

  // ---- Leave Request PIN gate (Option B) ----
  var lf = $('leaveForm');
  var lvPin = $('lvPin');
  var lvAgent = $('lvAgent');
  var pinMsg = $('pinMsg');
  var lvFormLocked = true; // agent must unlock with PIN before submitting

  function verifyPin() {
    var pins = (window.DASHBOARD_CONFIG && window.DASHBOARD_CONFIG.agentPins) || {};
    var code = (lvPin.value || '').trim();
    if (!code) {
      lvFormLocked = true;
      lvAgent.value = '';
      lvAgent.placeholder = 'Locked - enter PIN';
      lvPin.className = '';
      if (pinMsg) { pinMsg.hidden = true; }
      return;
    }
    var matched = null;
    for (var name in pins) { if (pins[name] === code) { matched = name; break; } }
    if (matched) {
      lvFormLocked = false;
      lvAgent.value = matched;
      lvAgent.placeholder = matched;
      lvPin.className = 'ok-input';
      if (pinMsg) { pinMsg.hidden = false; pinMsg.className = 'cf-msg ok'; pinMsg.textContent = 'Unlocked as ' + matched + '.'; }
    } else {
      lvFormLocked = true;
      lvAgent.value = '';
      lvAgent.placeholder = 'Locked - wrong PIN';
      lvPin.className = 'err-input';
      if (pinMsg) { pinMsg.hidden = false; pinMsg.className = 'cf-msg err'; pinMsg.textContent = 'Wrong PIN. Try again.'; }
    }
  }
  if (lvPin) lvPin.addEventListener('input', verifyPin);

  if (lf) lf.onsubmit = function (e) {
    e.preventDefault();
    if (lvFormLocked || !lvAgent.value) {
      if (pinMsg) { pinMsg.hidden = false; pinMsg.className = 'cf-msg err'; pinMsg.textContent = 'Enter your 4-digit PIN to unlock the form first.'; }
      toast('Enter your 4-digit PIN to unlock the form first.', 'err');
      return;
    }
    var details = ($('lvDetails').value || '').trim();
    if (!details) {
      $('lvDetails').className = 'err-input';
      if (pinMsg) { pinMsg.hidden = false; pinMsg.className = 'cf-msg err'; pinMsg.textContent = 'Details are required. Please add a note before submitting.'; }
      toast('Details are required - please add a note before submitting.', 'err');
      $('lvDetails').focus();
      return;
    }
    var payload = {
      agent: lvAgent.value,
      leaveType: $('lvType').value,
      reason: $('lvReason').value,
      date: $('lvDate').value,
      details: details
    };
    submitLeave(payload).then(function (res) {
      var note = $('leaveNote');
      if (res && res.ok) {
        note.textContent = res.local
          ? 'Saved locally (no sheet endpoint configured). It will appear after the next sync once wired.'
          : 'Submitted to the leave sheet as ' + lvAgent.value + '.';
        note.className = 'cf-msg ok';
        toast('Your leave request has been processed. ' + lvAgent.value + ', it is now Pending approval.', 'ok');
        lf.reset();
        lvFormLocked = true;
        lvAgent.value = '';
        lvAgent.placeholder = 'Locked - enter PIN';
        if (pinMsg) { pinMsg.hidden = true; }
        renderLeaves();
      } else {
        note.textContent = 'Submission failed. Please try again.';
        note.className = 'cf-msg err';
        toast('Submission failed. Please try again.', 'err');
      }
    });
  };

  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(resizeCharts, 160); });
}

/* Resources page: a curated, editable library - no Agent/Week filters.
 * Edit the arrays below to change what shows. */
var RESOURCE_DATA = {
  links: [
    { t: 'Follow up Refund Sheet', d: 'For customers that are reporting that refunds marked as successful have not been received after 10 business days. For refunds showing as failed, retry processing after an hour. If the refund fails again, please track the issue.', u: 'https://docs.google.com/spreadsheets/d/1e93ydbpPOt_ucH8DabDwfa65AqheLpcXAysfgfdVVYA/edit?gid=155669863#gid=155669863' },
    { t: 'CSR Manual Creation Tracker', d: 'This escalation sheet is used to document and track all brands that require manual order creation or reshipment requests.', u: 'https://docs.google.com/spreadsheets/d/1nsEKMBc34_QiHxorGuJOv6B34-3m8CEgNokPlVZaAag/edit?gid=1414496553#gid=1414496553' },
    { t: 'DHL Reshipment Claim Sheet', d: 'This escalation sheet is used as a tracker to log customer-reported tracking or packing issues—such as lost or delayed shipments, incorrect delivery, damaged items, incomplete orders, or wrong items—so the warehouse team can quickly investigate and resolve them', u: 'https://docs.google.com/spreadsheets/d/1Puj4kVn4hxKTCCKHU79wtPUc9kF879Z-/edit?pli=1&gid=1626765804#gid=1626765804' },
    { t: 'Marketing Email Tracker', d: 'These emails must be responded to as required, must not be closed or merged, and should always be assigned to Mary Rose Panti for tracking and monitoring.', u: 'https://docs.google.com/spreadsheets/d/19EqtioMwsh-uE0GcaZyXgQ7KoUa4YJbazdkYSq6ZnnI/edit?usp=sharing' },
    { t: 'Shopify Refund Sheet', d: 'This escalation sheet is used to track Shopify Refund Requests & Follow Ups. Orders should be escalated for refund if they cannot be found in Sticky but are created in Shiphero. If the order does not appear under the customer’s email, search using the customer’s name or any other available details. All possible search methods must be exhausted before proceeding with escalation.', u: 'https://docs.google.com/spreadsheets/d/1_tsC9xyqbQvMILQ0zHcCiQGEcGUy-AOlvjxB3FwPfYA/edit?gid=0#gid=0' },
    { t: 'Amazon | Walmart | Ebay Sheet', d: 'This escalation sheet is used to track Amazon, Walmart, and eBay inquiries for orders that were placed directly through these marketplaces and requesting proper review and follow-up.', u: 'https://docs.google.com/spreadsheets/d/1_tsC9xyqbQvMILQ0zHcCiQGEcGUy-AOlvjxB3FwPfYA/edit?gid=0#gid=0' },
    { t: 'OHA Refund Pushback Tagging', d: 'This escalation sheet is used for OHA Refund Push Back Tagging on OHA orders where Save and Upgrade offers have already been made and require proper tagging and follow-up.', u: 'https://docs.google.com/spreadsheets/d/10Pas0kcWf7uM5IJInfUGz0Ry8fSlMPdRhN8iw__Zajg/edit?usp=sharing' },
    { t: 'OHA Hearing Specialist Referrals / Consultation Portal', d: 'This escalation sheet is used for OHA Refund Push Back Tagging on OHA orders where Save and Upgrade offers have already been made and require proper tagging and follow-up.', u: 'https://specialist-training-portal.vercel.app/portal' },
    { t: 'NEW Undelivered Message Escalation', d: 'This escalation sheet is used to track and manage email messages that failed to send or were returned as undeliverable, ensuring timely investigation and resolution of delivery issues.', u: 'https://docs.google.com/spreadsheets/d/1qHKkhldX64HF81brktLcfHY6RCIAr7XQwAdvhbjWxU0/edit?gid=925490607#gid=925490607' },
    { t: 'Return Label Request for  Customers without valid email (socmed)', d: 'This escalation sheet is used to document and track return label requests for customers who cannot receive emails, ensuring their return labels are sent through Facebook Messenger when email delivery is not possible. This helps maintain a seamless, reliable, and well-tracked alternative communication method.', u: 'https://docs.google.com/spreadsheets/d/1_IKymCZEXIC9OMNJPvUUkPd5SYakB_z-YozLAXbQmEY/edit?gid=0#gid=0' },
    { t: 'Request Follow-up Escalation Sheet', d: 'Use this tracking sheet to escalate customers who call to follow up on an email response regarding their return request. Logging these cases enables coordination with the Email Team and allows us to request priority handling for customers awaiting a response.', u: 'https://docs.google.com/spreadsheets/d/1g6qqyLzbwPFD482kW_YbYEOacj05eJuVrQS5ddpr338/edit?gid=0#gid=0' },
    { t: 'Shopify CX Details Updating Sheet', d: 'Use this link to escalate customer requests for updating their name, email address, or phone number. Before escalating, make sure the customer’s details have been updated in both Sticky and ShipHero so the information remains consistent across systems.', u: 'https://docs.google.com/spreadsheets/d/10JTg3sfpzXYDfRkm079BU0vUL7bZPcmE6lwY3pp6hJ4/edit?gid=0#gid=0' },
    { t: 'Outbound Sales', d: 'This escalation sheet is used for customers requesting to place an order through phone call', u: 'https://docs.google.com/spreadsheets/d/11R-CosEoediUOVnUIHj2uI_2lKv9syOnNaBtLaIjr9Q/edit?gid=316129417#gid=316129417' }
  ],
  guides: [],
  contacts: []
};

function renderResources() {
  var el = $('resLinks');
  if (!el) return;
  var rows = RESOURCE_DATA.links || [];
  if (!rows.length) { el.innerHTML = '<p class="res-empty">No resources yet.</p>'; return; }
  var html = '<table class="res-table"><thead><tr>' +
    '<th>Title</th><th>Link</th><th>Description</th>' +
    '</tr></thead><tbody>';
  html += rows.map(function (r) {
    return '<tr>' +
      '<td class="res-td-title">' + esc(r.t) + '</td>' +
      '<td class="res-td-link"><a href="' + esc(r.u) + '" target="_blank" rel="noopener">click here</a></td>' +
      '<td class="res-td-desc">' + esc(r.d || '') + '</td>' +
      '</tr>';
  }).join('');
  html += '</tbody></table>';
  el.innerHTML = html;
}

/* ---------------- Cascades & Handling ---------------- */
var CASC_STATE = { cat: 'ALL', brand: 'ALL', detail: null };

// Render rich-text runs [[text, bold, italic], ...] exactly as on the sheet.
function renderRuns(runs, plain) {
  if (runs && runs.length) {
    return runs.map(function (r) {
      var t = esc(r[0]);
      if (r[1] && r[2]) return '<b><i>' + t + '</i></b>';
      if (r[1]) return '<b>' + t + '</b>';
      if (r[2]) return '<i>' + t + '</i>';
      return t;
    }).join('');
  }
  return esc(plain || '');
}

// Pull URLs out of a block of text (used for the Links/Image References area).
function extractUrls(t) {
  var out = [], re = /https?:\/\/[^\s)<>"'\]]+/g, m;
  while ((m = re.exec(t || ''))) out.push(m[0].replace(/[.,;]+$/, ''));
  return out;
}
function isImage(u) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(u) ||
    /drive\.google\.com|docs\.google\.com\/uc|lh3\.googleusercontent\.com|imgur\.com/i.test(u);
}
// Rewrite a URL to one that actually returns image bytes. Google Drive "view"
// / "open" / "uc?export=view" links serve an HTML page (or a redirect), not the
// image, so an <img> on them breaks. The file's raw bytes live on the lh3 host,
// which returns image/png directly - use that as the <img> src.
function toDirectImg(u) {
  u = (u || '').replace(/&amp;/g, '&');
  var m = u.match(/drive\.google\.com\/file\/d\/([^\/?]+)/) || u.match(/drive\.google\.com\/open\?id=([^&]+)/) || u.match(/drive\.google\.com\/uc\?[^&]*id=([^&]+)/);
  if (m) return 'https://lh3.googleusercontent.com/d/' + m[1];
  return u;
}
// If a reference image fails to load (e.g. hotlink-blocked), swap it for a
// working "Click Here" link so the reference is never lost.
function cascImgFallback(img) {
  var a = document.createElement('a');
  a.className = 'casc-open';
  a.href = img.getAttribute('data-href') || '#';
  a.target = '_blank'; a.rel = 'noopener';
  a.innerHTML = 'Click Here &#8599;';
  if (img.parentNode) img.parentNode.replaceChild(a, img);
}
// Open the lightbox with a given image src (used by embedded/inline cascade images).
function openLb(src, isDoc) {
  var lb = document.getElementById('lb'), i = document.getElementById('lbImg'), fr = document.getElementById('lbFrame');
  if (!lb) return;
  if (isDoc && fr) {
    i.style.display = 'none'; fr.style.display = 'block';
    fr.src = src; lb.classList.add('show');
  } else if (i) {
    if (fr) fr.style.display = 'none';
    i.style.display = 'block';
    i.src = src; lb.classList.add('show');
  }
}

// Build the full cascade detail markup (used both on the Cascades page and
// inline on the Overview "Latest Cascades" card). Caller injects it into a
// container and wires the back button / image-lightbox separately.
function cascadeDetailHtml(r) {
  if (!r) return '';
  var m = r.month ? r.month.charAt(0).toUpperCase() + r.month.slice(1) : '';
  var dateTxt = (m && r.dayNum) ? (m + ' ' + r.dayNum) : (r.dateLabel || r.date || '');
  if (r.ts) {
    var d = new Date(r.ts);
    var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    dateTxt = MON[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  }
  var embImgs = (r.cascadeImages || []).filter(function (im) { return im && im.src; });
  function embFor(u) {
    u = (u || '').replace(/&amp;/g, '&');
    for (var k = 0; k < embImgs.length; k++) {
      if (embImgs[k].url && embImgs[k].url.replace(/&amp;/g, '&') === u) return embImgs[k].src;
    }
    return null;
  }
  var embHtml = embImgs.length ? '<div class="casc-imgs">' + embImgs.map(function (im) {
    return '<span class="casc-img" title="Click to enlarge">' +
      '<img src="' + esc(im.src) + '" alt="cascade reference image" loading="lazy">' +
      '<span class="casc-img-zoom">&#128269;</span></span>';
  }).join('') + '</div>' : '';

  var linkRefsText = r.linkRefs || '';
  var bodyUrls = (extractUrls(r.cascade || '')).filter(function (u) {
    return linkRefsText.indexOf(u.replace(/&amp;/g, '&')) < 0;
  });
  var imgs = bodyUrls.filter(isImage);
  var links = bodyUrls.filter(function (u) { return !isImage(u); });

  var imagesHtml = imgs.length ? '<div class="casc-imgs">' + imgs.map(function (u) {
    var direct = toDirectImg(u);
    return '<span class="casc-img" title="Click to enlarge">' +
      '<img src="' + esc(direct) + '" alt="cascade image" loading="lazy" data-href="' + esc(u) + '" onerror="cascImgFallback(this)">' +
      '<span class="casc-img-zoom">&#128269;</span></span>';
  }).join('') + '</div>' : '';

  var refHtml = '';
  var refParts = [];
  if (r.linkRefs && r.linkRefs.trim()) {
    var refText = esc(r.linkRefs).replace(/https?:\/\/[^<>\s"']+/g, function (u) {
      var dataUri = embFor(u);
      if (dataUri) {
        return '<img class="casc-inline-img" src="' + dataUri + '" alt="reference image" loading="lazy" onclick="openLb(this.src)">';
      }
      return '<a class="casc-open" href="' + u + '" target="_blank" rel="noopener">Click Here &#8599;</a>';
    });
    refParts.push('<div class="casc-ref-text">' + refText + '</div>');
  }
  if (links.length) {
    refParts.push(links.map(function (u) {
      return '<a class="casc-open" href="' + esc(u) + '" target="_blank" rel="noopener">Click Here &#8599;</a>';
    }).join(' '));
  }
  if (imgs.length) refParts.push(imagesHtml);
  if (embImgs.length) refParts.push(embHtml);
  if (refParts.length) {
    refHtml = '<section class="casc-refs"><h4>Link / Image References</h4>' + refParts.join('') + '</section>';
  }

  return '<article class="casc-detail">' +
    '<div class="casc-head">' +
      '<span class="pill n casc-cat">' + esc(r.category) + '</span>' +
      (r.brand ? '<span class="casc-brand">' + esc(r.brand) + '</span>' : '') +
      '<span class="casc-date">' + esc(dateTxt) + '</span>' +
    '</div>' +
    '<h3 class="casc-detail-title">' + esc(r.title || '(untitled)') + '</h3>' +
    '<div class="casc-body">' + renderRuns(r.cascadeRuns, r.cascade) + '</div>' +
    refHtml +
  '</article>';
}

function renderCascades() {
  var list = $('cascList');
  var chips = $('cascChips');
  if (!list) return;
  var all = (DATA && DATA.cascades) || [];

  // category chips (incl. All)
  var cats = uniq(all.map(function (r) { return r.category; })).sort();
  if (chips) {
    var chipHtml = '<button class="chip' + (CASC_STATE.cat === 'ALL' ? ' active' : '') + '" data-cat="ALL">All</button>' +
      cats.map(function (c) {
        return '<button class="chip' + (CASC_STATE.cat === c ? ' active' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('');
    chips.innerHTML = chipHtml;
    Array.prototype.forEach.call(chips.querySelectorAll('.chip'), function (b) {
      b.onclick = function () { CASC_STATE.cat = b.getAttribute('data-cat'); CASC_STATE.detail = null; renderCascades(); };
    });
  }

  // brand selector: All Brands / Oricle Hearing Aid / Other Brands
  var brandSel = $('cascBrand');
  if (brandSel) {
    brandSel.value = CASC_STATE.brand;
    brandSel.onchange = function () { CASC_STATE.brand = brandSel.value; CASC_STATE.detail = null; renderCascades(); };
  }

  var isOricle = function (b) { return !!b && /oricle/i.test(b); };

  var rows = all.filter(function (r) {
    if (CASC_STATE.cat !== 'ALL' && r.category !== CASC_STATE.cat) return false;
    if (CASC_STATE.brand === 'ORICLE' && !isOricle(r.brand)) return false;
    if (CASC_STATE.brand === 'OTHER' && isOricle(r.brand)) return false;
    return true;
  });
  if (!rows.length) { list.innerHTML = '<div class="empty"><b>No cascades yet</b>Add a row to the Cascades tab in the team sheet and it will appear here.</div>'; return; }

  // ----- detail view: full cascade on its own page -----
  if (CASC_STATE.detail != null) {
    var r = rows[CASC_STATE.detail];
    if (r) {
      var m = r.month ? r.month.charAt(0).toUpperCase() + r.month.slice(1) : '';
      var dateTxt = (m && r.dayNum) ? (m + ' ' + r.dayNum) : (r.dateLabel || r.date || '');
      // Prefer a fully formatted date (Aug 28, 2026) when a timestamp exists.
      if (r.ts) {
        var d = new Date(r.ts);
        var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        dateTxt = MON[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
      }
      // Embedded images (server-downloaded base64 data-URIs) - always render as
      // the actual picture, clickable to enlarge. Immune to Drive's browser hotlink block.
      var embImgs = (r.cascadeImages || []).filter(function (im) { return im && im.src; });
      function embFor(u) {
        u = (u || '').replace(/&amp;/g, '&');
        for (var k = 0; k < embImgs.length; k++) {
          if (embImgs[k].url && embImgs[k].url.replace(/&amp;/g, '&') === u) return embImgs[k].src;
        }
        return null;
      }
      var embHtml = embImgs.length ? '<div class="casc-imgs">' + embImgs.map(function (im) {
        var src = im.src;
        return '<span class="casc-img" title="Click to enlarge">' +
          '<img src="' + esc(src) + '" alt="cascade reference image" loading="lazy">' +
          '<span class="casc-img-zoom">&#128269;</span></span>';
      }).join('') + '</div>' : '';

      // URLs that live in the cascade BODY (separate from the Link References
      // cell, which is rendered verbatim below). Exclude any URL that also
      // appears in linkRefs so it is never rendered twice.
      var linkRefsText = r.linkRefs || '';
      var bodyUrls = (extractUrls(r.cascade || '')).filter(function (u) {
        return linkRefsText.indexOf(u.replace(/&amp;/g, '&')) < 0;
      });
      var imgs = bodyUrls.filter(isImage);
      var links = bodyUrls.filter(function (u) { return !isImage(u); });

      // Image links from the body -> show the ACTUAL image (clickable to enlarge)
      var imagesHtml = imgs.length ? '<div class="casc-imgs">' + imgs.map(function (u) {
        var direct = toDirectImg(u);
        return '<span class="casc-img" title="Click to enlarge">' +
          '<img src="' + esc(direct) + '" alt="cascade image" loading="lazy" data-href="' + esc(u) + '" onerror="cascImgFallback(this)">' +
          '<span class="casc-img-zoom">&#128269;</span></span>';
      }).join('') + '</div>' : '';

      // Dedicated "Link / Image References" section.
      // Copy the sheet cell's exact text (incl. descriptive labels). Image URLs
      // become the actual inline image (click to enlarge); other URLs become
      // "Click Here" buttons. This fully owns the Link References column, so the
      // URLs are never rendered twice.
      var refHtml = '';
      var refParts = [];
      if (r.linkRefs && r.linkRefs.trim()) {
        // replace each URL: image -> inline <img> (click to enlarge); other -> "Click Here" button
        var refText = esc(r.linkRefs).replace(/https?:\/\/[^<>\s"']+/g, function (u) {
          var dataUri = embFor(u);
          if (dataUri) {
            return '<img class="casc-inline-img" src="' + dataUri + '" alt="reference image" loading="lazy" onclick="openLb(this.src)">';
          }
          return '<a class="casc-open" href="' + u + '" target="_blank" rel="noopener">Click Here &#8599;</a>';
        });
        refParts.push('<div class="casc-ref-text">' + refText + '</div>');
      }
      if (links.length) {  // non-image URLs found only in the body narrative
        refParts.push(links.map(function (u) {
          return '<a class="casc-open" href="' + esc(u) + '" target="_blank" rel="noopener">Click Here &#8599;</a>';
        }).join(' '));
      }
      if (imgs.length) refParts.push(imagesHtml);  // body images row (also enlargeable)
      if (embImgs.length) refParts.push(embHtml);   // embedded reference images (always show)
      if (refParts.length) {
        refHtml = '<section class="casc-refs"><h4>Link / Image References</h4>' + refParts.join('') + '</section>';
      }

      list.innerHTML = '<button class="casc-back" id="cascBack">&larr; Back to all cascades</button>' + cascadeDetailHtml(r);

      var back = $('cascBack');
      if (back) back.onclick = function () { CASC_STATE.detail = null; renderCascades(); };
      // image thumbnails open the lightbox (no new-tab redirect)
      Array.prototype.forEach.call(list.querySelectorAll('.casc-img'), function (span) {
        span.onclick = function (e) {
          e.stopPropagation();
          var img = span.querySelector('img');
          var lb = $('lb'), lbImg = $('lbImg');
          if (lb && lbImg && img) { lbImg.src = img.src; lb.classList.add('show'); }
        };
      });
      return;
    }
  }

  // ----- list view: clickable titles only -----
  list.innerHTML = rows.map(function (r, i) {
    return '<button class="casc-row" data-i="' + i + '">' +
      '<span class="pill n casc-cat">' + esc(r.category) + '</span>' +
      '<span class="casc-row-title">' + esc(r.title || '(untitled)') + '</span>' +
      '<span class="casc-row-arrow">&#8250;</span>' +
    '</button>';
  }).join('');

  Array.prototype.forEach.call(list.querySelectorAll('.casc-row'), function (btn) {
    btn.onclick = function () {
      CASC_STATE.detail = parseInt(btn.getAttribute('data-i'), 10);
      renderCascades();
      window.scrollTo(0, 0);
    };
  });
}

/* ---------------- Products ---------------- */
// Placeholder products - replaced once the product sheet is wired in.
// Each square is clickable and opens a detail view with picture, description,
// Products come from DATA.products (built from the Products sheet). Each row:
//   name, description, inclusion, manual, image (Drive link), imageData
//   (embedded base64), email, hotline, troubleshooting:[{q,a}]
var PRODUCTS = (DATA && DATA.products) || [];

// Convert a product's `manual` HTML (a Drive link) into an inline preview so
// the document appears as an image rather than a bare text link. Reuses the
// Drive /preview iframe (openLb doc mode). Falls back to the raw link.
function manualPreviewHtml(manualHtml) {
  var raw = manualHtml || '';
  var m = raw.match(/href=["']([^"']+)["']/i);
  var url = m ? m[1] : '';
  var label = raw.replace(/<[^>]+>/g, '').trim() || 'Instruction Manual';
  if (!url) return '<p class="prod-pre">' + raw + '</p>';
  var dm = url.match(/drive\.google\.com\/file\/d\/([^\/?]+)/);
  if (dm) {
    var previewUrl = 'https://drive.google.com/file/d/' + dm[1] + '/preview';
    return '<iframe class="prod-manual-frame" src="' + esc(previewUrl) + '" title="' + esc(label) +
      '" loading="lazy"></iframe>' +
      '<p class="prod-pre"><a class="prod-link" href="' + esc(url) + '" target="_blank" rel="noopener" ' +
      'onclick="openLb(' + JSON.stringify(previewUrl) + ',true);return false;">Open full manual ↗</a></p>';
  }
  return '<p class="prod-pre"><a class="prod-link" href="' + esc(url) + '" target="_blank" rel="noopener">' +
    esc(label) + '</a></p>';
}

function renderProducts() {
  var grid = $('prodGrid'), detail = $('prodDetail'), searchWrap = $('prodSearchWrap');
  if (!grid) return;
  PRODUCTS = (DATA && DATA.products) || PRODUCTS;

  // detail view
  if (detail && !detail.hidden && detail.dataset.id) {
    var idx = parseInt(detail.dataset.id, 10);
    var p = PRODUCTS[idx];
    if (p) {
      var imgSrc = p.imageData || p.image || '';
      detail.innerHTML =
        '<button class="casc-back" id="prodBack">&larr; Back to all products</button>' +
        '<article class="prod-card">' +
          '<div class="prod-media">' +
            (imgSrc
              ? '<img src="' + esc(imgSrc) + '" alt="' + esc(p.name) + '" loading="lazy" onclick="openLb(this.src)">'
              : '<div class="prod-photo-ph">Product photo<br>not available</div>') +
          '</div>' +
          '<div class="prod-info">' +
            '<h3 class="prod-name">' + esc(p.name) + '</h3>' +
            (p.description ? '<section class="prod-sec"><h4>Product Description</h4><p class="prod-pre">' + p.description + '</p></section>' : '') +
            (p.inclusion ? '<section class="prod-sec"><h4>Package Inclusion</h4><p class="prod-pre">' + p.inclusion + '</p></section>' : '') +
            (p.manual ? '<section class="prod-sec"><h4>Instruction Manual</h4>' + manualPreviewHtml(p.manual) +
              (p.manualPhotos && p.manualPhotos.length
                ? '<div class="prod-photos">' + p.manualPhotos.map(function (ph) {
                    var url = ph.url || '';
                    return '<div class="prod-photo">' +
                      '<button type="button" class="prod-photo-cta" data-url="' + esc(url) + '" onclick="openLb(this.dataset.url,true)">Click here to view document</button></div>';
                  }).join('') + '</div>'
                : '') + '</section>'
              : '') +
            ((p.email || p.hotline) ? '<section class="prod-sec prod-support"><h4>Support</h4><p class="prod-pre">' +
              (p.email ? 'Email: <a class="prod-link" href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a><br>' : '') +
              (p.hotline ? 'Hotline: <a class="prod-link" href="tel:' + esc(p.hotline.replace(/[^0-9+]/g, '')) + '">' + esc(p.hotline) + '</a>' : '') + '</p></section>' : '') +
          '</div>' +
          (p.troubleshooting && p.troubleshooting.length ? '<div class="prod-ts-col"><section class="prod-sec"><h4>Trouble Shooting &amp; Handling</h4><div class="prod-ts">' +
            p.troubleshooting.map(function (t) {
              return '<details class="prod-ts-item"><summary>' + esc(t.q) + '</summary><span class="prod-ts-a">' + (t.aHtml || esc(t.a)) + '</span></details>';
            }).join('') + '</div></section></div>' : '') +
        '</article>';
      var back = $('prodBack');
      if (back) back.onclick = function () {
        detail.hidden = true; detail.dataset.id = '';
        grid.hidden = false; if (searchWrap) searchWrap.hidden = false; renderProducts();
      };
      return;
    }
  }

  // grid view
  detail.hidden = true;
  grid.hidden = false;
  if (searchWrap) searchWrap.hidden = false;
  if (!PRODUCTS.length) {
    if (searchWrap) searchWrap.innerHTML = '';
    grid.innerHTML = '<div class="empty"><b>No products yet</b>Add a row to the Products sheet and it will appear here.</div>';
    return;
  }

  // Build the search input ONCE so keystrokes don't recreate it and steal focus.
  // It lives in its own wrapper above the grid; only the grid re-renders on input.
  if (searchWrap && !searchWrap.querySelector('#prodSearch')) {
    searchWrap.innerHTML = '<div class="prod-search">' +
      '<input id="prodSearch" type="search" placeholder="Search products..." value="' + esc(window.__prodQuery || '') + '" oninput="window.__prodQuery=this.value;applyProductFilter()">' +
      '<button type="button" class="prod-search-clear" id="prodSearchClear" onclick="window.__prodQuery=\'\';var i=document.getElementById(\'prodSearch\');if(i){i.value=\'\';}applyProductFilter();if(i)i.focus()">Clear</button>' +
      '</div>';
  }
  applyProductFilter();
}

// Re-render only the product squares for the current query. Leaves the search
// input element in place so it never loses focus while typing.
function applyProductFilter() {
  var grid = $('prodGrid'), searchWrap = $('prodSearchWrap');
  if (!grid) return;
  var q = (window.__prodQuery || '').toLowerCase();
  var list = PRODUCTS.filter(function (p) { return !q || (p.name || '').toLowerCase().indexOf(q) >= 0; });
  var clearBtn = searchWrap && searchWrap.querySelector('#prodSearchClear');
  if (clearBtn) clearBtn.style.display = q ? '' : 'none';
  if (!list.length) {
    grid.innerHTML = '<div class="empty"><b>No products match "' + esc(q) + '"</b></div>';
    return;
  }
  grid.innerHTML = list.map(function (p, i) {
    var realIdx = PRODUCTS.indexOf(p);
    var imgSrc = p.imageData || p.image || '';
    return '<button class="prod-square" data-id="' + realIdx + '">' +
      (imgSrc
        ? '<img class="prod-square-img" src="' + esc(imgSrc) + '" alt="' + esc(p.name) + '" loading="lazy">'
        : '<span class="prod-square-ph">&#128247;</span>') +
      '<span class="prod-square-name">' + esc(p.name) + '</span>' +
    '</button>';
  }).join('');

  Array.prototype.forEach.call(grid.querySelectorAll('.prod-square'), function (btn) {
    btn.onclick = function () {
      var id = btn.getAttribute('data-id');
      var d = $('prodDetail');
      if (!d) return;
      d.dataset.id = id;
      d.hidden = false;
      grid.hidden = true;
      if (searchWrap) searchWrap.hidden = true;
      renderProducts();
      window.scrollTo(0, 0);
    };
  });
}

/* Snapshot mode: the data cannot change while the page is open, so there is
 * nothing to poll for. Refresh Data re-reads and re-renders on demand. */
function init() {
  wire();
  setPage('overview');
  fetchData(false).then(function () { if (typeof startAutoPoll === 'function') startAutoPoll(45000); });
}

document.addEventListener('DOMContentLoaded', init);

