/* Breakout Radar — board rendering, filters, detail view, model sandbox. No network. */
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) { document.body.innerHTML = '<p style="padding:40px">Breakout Radar: data.js did not load.</p>'; return; }

  var $ = function (id) { return document.getElementById(id); };
  var rowsEl = $('rows'), mainEl = document.querySelector('main');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(g) {
    if (g == null) return '—';
    return (g >= 0 ? '+' : '') + g.toFixed(1) + '%';
  }
  function ageFmt(d) {
    if (d == null) return '—';
    if (d < 365) return d + 'd';
    return (d / 365).toFixed(1) + 'y';
  }

  /* Header counts and model strip. */
  $('asof').textContent = R.as_of;
  $('c-board').textContent = R.board_size;
  $('c-watch').textContent = R.watchlist_size;
  $('c-break').textContent = R.breakout_size;
  $('c-live').textContent = R.live_size;
  var M = R.model;
  $('model-consts').textContent =
    'base = TVL × ' + M.base_multiple + ' × (TVL / $1B)^' + M.scale_curve +
    '  ·  momentum = 1 + ' + M.growth_weight + ' × 7d% + ' + M.breakout_kick +
    ' × max(0, 7d% − ' + M.breakout_at + ')  ·  runway: unproven under ' + M.runway_young_days +
    'd, prime to ' + M.runway_prime_days + 'd, then fades to ' + M.runway_old_floor +
    '. Model ' + R.model_version + '.';
  $('source').textContent = 'Source: ' + R.source + ' · watchlist floor $' +
    (R.floor_usd / 1e6).toFixed(0) + 'M TVL · ' + R.rows.length + ' ranked rows, ' +
    R.live.length + ' live-token protocols shown apart.';

  /* Category options. */
  var cats = {};
  R.rows.forEach(function (r) { if (r.category) cats[r.category] = 1; });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    $('cat').appendChild(o);
  });

  var state = { tab: 'board', q: '', cat: '', band: '', watch: false, sort: 'implied', detail: null };
  var watchSet = {};
  (R.watchlist || []).forEach(function (s) { watchSet[s] = 1; });

  function filtered() {
    var list = state.tab === 'live' ? R.live.slice() : R.rows.slice();
    if (state.tab === 'board') {
      if (state.q) {
        var q = state.q.toLowerCase();
        list = list.filter(function (r) {
          return r.name.toLowerCase().indexOf(q) >= 0 || r.slug.toLowerCase().indexOf(q) >= 0;
        });
      }
      if (state.cat) list = list.filter(function (r) { return r.category === state.cat; });
      if (state.band) list = list.filter(function (r) { return r.band === state.band; });
      if (state.watch) list = list.filter(function (r) { return watchSet[r.slug]; });
      var s = state.sort;
      list.sort(function (a, b) {
        if (s === 'tvl') return b.tvl_usd - a.tvl_usd;
        if (s === 'growth') return (b.change_7d == null ? -1e9 : b.change_7d) - (a.change_7d == null ? -1e9 : a.change_7d);
        if (s === 'age') return (b.age_days == null ? -1 : b.age_days) - (a.age_days == null ? -1 : a.age_days);
        if (s === 'rank') return a.rank - b.rank;
        return b.implied_value_usd - a.implied_value_usd;
      });
    }
    return list;
  }

  function rowHtml(r) {
    var g = r.change_7d;
    var gCls = g == null ? '' : (g >= 0 ? 'pos' : 'neg');
    return '<td>' + r.rank + '</td>' +
      '<td><span class="nm">' + esc(r.name) + '</span> <span class="slug">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || '—') + '</td>' +
      '<td>' + esc((r.chains || []).slice(0, 2).join(', ') || '—') + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td class="num ' + gCls + '">' + pct(g) + '</td>' +
      '<td><span class="badge ' + esc(r.band) + '">' + esc(r.band) + '</span></td>' +
      '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
      '<td class="num">' + ageFmt(r.age_days) + '</td>';
  }
  function liveHtml(r) {
    var g = r.change_7d;
    var gCls = g == null ? '' : (g >= 0 ? 'pos' : 'neg');
    return '<td>—</td>' +
      '<td><span class="nm">' + esc(r.name) + '</span> <span class="slug">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || '—') + '</td>' +
      '<td>' + esc((r.chains || []).slice(0, 2).join(', ') || '—') + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td class="num ' + gCls + '">' + pct(g) + '</td>' +
      '<td><span class="badge LIVE">LIVE</span></td>' +
      '<td class="num"><b>' + money(r.mcap_usd) + '</b></td>' +
      '<td class="num">—</td>';
  }

  function render() {
    var list = filtered();
    var html = list.map(function (r) {
      var cls = state.detail === r.slug ? ' class="sel"' : '';
      var inner = state.tab === 'live' ? liveHtml(r) : rowHtml(r);
      return '<tr data-slug="' + esc(r.slug) + '"' + cls + '>' + inner + '</tr>';
    }).join('');
    rowsEl.innerHTML = html;
    $('empty').hidden = list.length > 0;
    $('shown').textContent = list.length + (state.tab === 'live' ? ' live-token protocols' : ' of ' + R.rows.length + ' ranked');
    document.querySelectorAll('#board thead th')[7].textContent =
      state.tab === 'live' ? 'Market cap' : 'Implied value';
    $('controls').style.display = state.tab === 'live' ? 'none' : 'flex';
    $('tab-board').classList.toggle('active', state.tab === 'board');
    $('tab-live').classList.toggle('active', state.tab === 'live');
  }

  /* Detail view. */
  function bandText(r) {
    var map = {
      BREAKOUT: 'Breaking out: TVL is compounding at 25%+ a week. The radar ranks it first because capital is arriving faster here than anywhere else on the board.',
      HEATING: 'Heating up: TVL is growing 10–25% a week. Momentum is building but the breakout is not confirmed yet.',
      STEADY: 'Steady: TVL is flat to mildly up this week. The value here is size and runway, not speed.',
      COOLING: 'Cooling: TVL slipped this week. The protocol may still be worth farming, but the momentum case is off.',
      FADING: 'Fading: TVL is falling more than 10% a week. Farm a test position at most, and only if the trend turns.'
    };
    return map[r.band] || '';
  }
  function splitStep(s) {
    var m = s.match(/^(.*?) Cost: (.*?)\. Time: (.*?)\.?$/);
    if (!m) return { text: s, meta: '' };
    return { text: m[1], meta: 'Cost: ' + m[2] + ' · Time: ' + m[3] };
  }
  function showDetail(slug) {
    var r = null;
    R.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    var d = $('detail');
    if (!r) { d.hidden = true; mainEl.classList.add('nodetail'); state.detail = null; return; }
    state.detail = slug;
    $('d-name').textContent = '#' + r.rank + ' ' + r.name;
    $('d-sub').textContent = r.slug + ' · ' + (r.category || 'uncategorised') + ' · ' +
      (r.chains || []).join(', ') + ' · listed ' + (r.listed_at || 'unknown') +
      ' · records no token';
    var stats = [
      [moneyFull(r.implied_value_usd), 'implied value'],
      [money(r.tvl_usd), 'TVL'],
      [pct(r.change_7d), 'TVL change, 7d'],
      [ageFmt(r.age_days), 'running, no token']
    ];
    $('d-stats').innerHTML = stats.map(function (s) {
      return '<div><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>';
    }).join('');
    var bars = [
      ['Base (TVL)', r.base_usd, Math.max.apply(null, R.rows.map(function (x) { return x.base_usd; })), money(r.base_usd), ''],
      ['Momentum ×', r.momentum_multiplier, 5, r.momentum_multiplier.toFixed(2) + '×', 'cool'],
      ['Runway ×', r.runway_multiplier, 1, r.runway_multiplier.toFixed(2) + '×', 'cool']
    ];
    $('d-break').innerHTML = bars.map(function (b) {
      var w = Math.max(2, Math.min(100, (b[1] / b[2]) * 100));
      return '<div class="row"><span>' + esc(b[0]) + '</span><span class="bar"><i class="' +
        b[4] + '" style="width:' + w.toFixed(0) + '%"></i></span><b>' + esc(b[3]) + '</b></div>';
    }).join('') +
      '<p class="fine">Breakout kick +' + r.breakout_kick.toFixed(2) +
      ' on growth above ' + M.breakout_at + '%. Implied = base × momentum × runway = ' +
      moneyFull(r.implied_value_usd) + '.</p>';
    $('d-band').innerHTML = '<span class="badge ' + esc(r.band) + '">' + esc(r.band) +
      '</span> ' + esc(bandText(r));
    $('d-steps').innerHTML = r.farm_steps.map(function (s) {
      var p = splitStep(s);
      return '<li>' + esc(p.text) + (p.meta ? '<span class="meta">' + esc(p.meta) + '</span>' : '') + '</li>';
    }).join('');
    d.hidden = false;
    mainEl.classList.remove('nodetail');
    render();
  }

  /* Controls. */
  $('q').addEventListener('input', function (e) { state.q = e.target.value; syncHash(); render(); });
  $('cat').addEventListener('change', function (e) { state.cat = e.target.value; syncHash(); render(); });
  $('band').addEventListener('change', function (e) { state.band = e.target.value; syncHash(); render(); });
  $('watch-only').addEventListener('change', function (e) { state.watch = e.target.checked; syncHash(); render(); });
  $('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
  $('tab-board').addEventListener('click', function () { state.tab = 'board'; state.detail = null; $('detail').hidden = true; mainEl.classList.add('nodetail'); syncHash(); render(); });
  $('tab-live').addEventListener('click', function () { state.tab = 'live'; state.detail = null; $('detail').hidden = true; mainEl.classList.add('nodetail'); syncHash(); render(); });
  $('detail-close').addEventListener('click', function () { state.detail = null; $('detail').hidden = true; mainEl.classList.add('nodetail'); syncHash(); render(); });
  rowsEl.addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (!tr) return;
    if (state.tab === 'live') return;
    showDetail(tr.getAttribute('data-slug'));
    syncHash();
    render();
  });
  document.querySelectorAll('#board thead th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      var map = { rank: 'rank', name: 'rank', category: 'rank', chains: 'rank', tvl: 'tvl', growth: 'growth', band: 'growth', implied: 'implied', age: 'age' };
      state.sort = map[k] || 'implied';
      $('sort').value = state.sort;
      render();
    });
  });

  /* Hash deep links: #detail=<slug>, #band=X, #q=text, #tab=live, #watch=1. */
  function syncHash() {
    var parts = [];
    if (state.tab === 'live') parts.push('tab=live');
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.band) parts.push('band=' + state.band);
    if (state.watch) parts.push('watch=1');
    if (state.detail) parts.push('detail=' + state.detail);
    var h = parts.length ? '#' + parts.join('&') : '';
    try { history.replaceState(null, '', h || location.pathname); } catch (e) { /* file: URLs */ }
  }
  function readHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (kv) {
      var p = kv.split('=');
      var k = p[0], v = decodeURIComponent(p[1] || '');
      if (k === 'tab' && v === 'live') state.tab = 'live';
      if (k === 'q') { state.q = v; $('q').value = v; }
      if (k === 'band') { state.band = v; $('band').value = v; }
      if (k === 'watch' && v === '1') { state.watch = true; $('watch-only').checked = true; }
      if (k === 'detail') state.detail = v;
    });
  }

  /* Model sandbox: the same formula, recomputed in the browser. */
  function runway(age) {
    if (age == null) return M.unknown_age_runway;
    if (age < M.runway_young_days) return M.runway_young_floor + (1 - M.runway_young_floor) * (age / M.runway_young_days);
    if (age <= M.runway_prime_days) return 1;
    return Math.max(M.runway_old_floor, 1 - (1 - M.runway_old_floor) * ((age - M.runway_prime_days) / M.runway_old_span_days));
  }
  function recompute(gw, bk, bm) {
    return R.rows.map(function (r) {
      var g = Math.min(M.growth_cap, Math.max(M.growth_floor, r.change_7d == null ? 0 : r.change_7d));
      var kick = Math.max(0, g - M.breakout_at) * bk;
      var mom = Math.max(M.momentum_floor, 1 + gw * g + kick);
      var base = r.tvl_usd * bm * Math.pow(r.tvl_usd / M.scale_anchor_usd, M.scale_curve);
      return { slug: r.slug, name: r.name, implied: Math.max(1, Math.round(base * mom * runway(r.age_days))), old: r.rank };
    }).sort(function (a, b) { return b.implied - a.implied; });
  }
  function sandbox() {
    var gw = parseFloat($('s-gw').value), bk = parseFloat($('s-bk').value), bm = parseFloat($('s-bm').value);
    $('v-gw').textContent = gw.toFixed(3);
    $('v-bk').textContent = bk.toFixed(3);
    $('v-bm').textContent = bm.toFixed(2);
    var list = recompute(gw, bk, bm);
    var moved = list.filter(function (x, i) { return (i + 1) !== x.old; }).length;
    var top = list.slice(0, 3).map(function (x, i) { return (i + 1) + '. ' + x.name + ' ' + money(x.implied); }).join(' · ');
    $('sandbox-out').textContent = 'Top 3 under your model: ' + top + '. ' + moved +
      ' of ' + list.length + ' rows change rank. Submitted model: growth weight ' +
      M.growth_weight + ', kick ' + M.breakout_kick + ', base ' + M.base_multiple + '.';
  }
  ['s-gw', 's-bk', 's-bm'].forEach(function (id) { $(id).addEventListener('input', sandbox); });

  readHash();
  render();
  if (state.detail) showDetail(state.detail);
  sandbox();
})();
