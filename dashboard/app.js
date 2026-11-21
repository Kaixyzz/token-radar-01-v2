// Firstlight Radar — the page: filter, sort, and a detail view per protocol.
// Reads window.FIRSTLIGHT (written by main.ts into data.js). No network.
(function () {
  'use strict';
  var D = window.FIRSTLIGHT;
  var rows = D.rows;
  var meta = D.meta;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtUSD(v) {
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + v;
  }
  function fmtPct(v) {
    if (v === null || v === undefined) return '<span class="muted">—</span>';
    var cls = v >= 0 ? 'pos' : 'neg';
    return '<span class="' + cls + '">' + (v >= 0 ? '+' : '') + v.toFixed(1) + '%</span>';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unreported';
    if (days < 30) return days + ' days';
    if (days < 365) return Math.round(days / 30) + ' months';
    return (days / 365).toFixed(1) + ' years';
  }

  // ---- header, stats, model note
  document.getElementById('meta').innerHTML =
    '<b>Snapshot</b> ' + esc(meta.as_of) + '<br><b>Floor</b> ' + fmtUSD(meta.floor_usd);
  var stats = [
    [meta.protocols_scanned, 'protocols scanned'],
    [meta.watchlist_size, 'on the watchlist'],
    [meta.board_rows, 'rows on the board'],
    [meta.pre_token_rows, 'record no token'],
    [meta.live_rows, 'token live, for contrast'],
  ];
  document.getElementById('stats').innerHTML = stats.map(function (s) {
    return '<div class="stat"><div class="n">' + s[0] + '</div><div class="l">' + esc(s[1]) + '</div></div>';
  }).join('');
  document.getElementById('model').innerHTML =
    '<h2>How the value is worked out</h2>' +
    '<p><code>implied = TVL x 0.22 x growth x seasoning x breadth</code> — growth from the 7-day TVL change, ' +
    'clamped to -40%…+80%; seasoning from how long the protocol has run, capped at two years; breadth from the ' +
    'number of chains, capped at six. The same formula scores every protocol; no name is hardcoded.</p>' +
    '<p>Only launch candidates are ranked, by the same rule the snapshot’s own watchlist uses: no exchange, ' +
    'no bridge, no liquid-staking or restaking product, no wrapped or staked product of a token that already ' +
    'trades, and no versioned copy. Protocols that record a token are shown at a steep post-launch discount, below the lowest pre-token row: ' +
    'a launch that already happened cannot outrank one that has not. “Records no token” means the record carries ' +
    'neither a CoinGecko id nor a symbol — a record, not proof the protocol has none.</p>';

  // ---- filter controls
  var qEl = document.getElementById('q');
  var catEl = document.getElementById('cat');
  var chainEl = document.getElementById('chain');
  var statusEl = document.getElementById('status');
  var watchEl = document.getElementById('watch');
  var sortEl = document.getElementById('sort');
  var tbody = document.getElementById('rows');
  var countEl = document.getElementById('count');
  var detailEl = document.getElementById('detail');

  function fillSelect(el, values) {
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      el.appendChild(o);
    });
  }
  var cats = {};
  var chains = {};
  rows.forEach(function (r) {
    if (r.category) cats[r.category] = true;
    r.chains.forEach(function (c) { chains[c] = true; });
  });
  fillSelect(catEl, Object.keys(cats).sort());
  fillSelect(chainEl, Object.keys(chains).sort());

  function current() {
    var q = qEl.value.trim().toLowerCase();
    return rows.filter(function (r) {
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0 && (r.category || '').toLowerCase().indexOf(q) < 0)) return false;
      if (catEl.value && r.category !== catEl.value) return false;
      if (chainEl.value && r.chains.indexOf(chainEl.value) < 0) return false;
      if (statusEl.value && r.token_status !== statusEl.value) return false;
      if (watchEl.checked && !r.watchlist) return false;
      return true;
    });
  }

  function render() {
    var list = current();
    var sort = sortEl.value;
    if (sort === 'tvl') list.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (sort === 'growth') list.sort(function (a, b) { return (b.change_7d === null ? -1e9 : b.change_7d) - (a.change_7d === null ? -1e9 : a.change_7d); });
    else if (sort === 'name') list.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    else list.sort(function (a, b) { return a.rank - b.rank; });
    countEl.textContent = 'Showing ' + list.length + ' of ' + rows.length + ' protocols';
    tbody.innerHTML = list.map(function (r) {
      var status = r.token_status === 'pre-token'
        ? '<span class="badge pre">Pre-token</span>'
        : '<span class="badge live">Token live</span>';
      var watch = r.watchlist ? '<span class="badge watch">Watchlist</span>' : '';
      var chainTxt = r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '');
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(chainTxt) + '</td>' +
        '<td class="num">' + fmtUSD(r.tvl_usd) + '</td>' +
        '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num"><span class="val">' + fmtUSD(r.implied_value_usd) + '</span></td>' +
        '<td>' + status + watch + '</td></tr>';
    }).join('');
  }

  function openDetail(slug) {
    var r = bySlug[slug];
    if (!r) return;
    var b = r.breakdown;
    var status = r.token_status === 'pre-token' ? 'Records no token' : 'Token already trades';
    detailEl.hidden = false;
    detailEl.innerHTML =
      '<h2>' + esc(r.name) + ' <span class="slug">#' + r.rank + ' · ' + esc(r.slug) + '</span></h2>' +
      '<p>' + esc(status) + (r.watchlist ? ' · On the watchlist' : '') + '</p>' +
      '<div class="facts">' +
      '<span>TVL <b>' + fmtUSD(r.tvl_usd) + '</b></span>' +
      '<span>7-day <b>' + (r.change_7d === null ? 'unreported' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</b></span>' +
      '<span>Running <b>' + fmtAge(r.age_days) + '</b></span>' +
      '<span>Chains <b>' + esc(r.chains.join(', ')) + '</b></span>' +
      '<span>Category <b>' + esc(r.category || '—') + '</b></span>' +
      '</div>' +
      '<h3>Implied value — ' + fmtUSD(r.implied_value_usd) + '</h3>' +
      '<p>Base ' + fmtUSD(b.base_usd) + ' (TVL x 0.22) &nbsp;·&nbsp; growth x' + b.growth_factor +
      ' &nbsp;·&nbsp; seasoning x' + b.seasoning_factor + ' &nbsp;·&nbsp; breadth x' + b.breadth_factor + '</p>' +
      '<h3>How to farm it</h3>' +
      '<ol>' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    var trs = tbody.querySelectorAll('tr');
    for (var i = 0; i < trs.length; i++) trs[i].classList.toggle('sel', trs[i].getAttribute('data-slug') === slug);
    if (location.hash !== '#detail/' + slug) history.replaceState(null, '', '#detail/' + slug);
    detailEl.scrollIntoView({ block: 'nearest' });
  }

  tbody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  [qEl, catEl, chainEl, statusEl, watchEl, sortEl].forEach(function (el) {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  render();

  // Deep links for the screenshots: #detail/<slug> and #filter/<text>.
  function applyHash() {
    var hash = location.hash || '';
    if (hash.indexOf('#detail/') === 0) {
      openDetail(decodeURIComponent(hash.slice(8)));
    } else if (hash.indexOf('#filter/') === 0) {
      qEl.value = decodeURIComponent(hash.slice(8));
      render();
    }
  }
  window.addEventListener('hashchange', applyHash);
  applyHash();
})();
