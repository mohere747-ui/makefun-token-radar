/* Offline dashboard: renders window.RADAR.rows with working controls and a model-check panel. */
(function () {
  'use strict';
  var radar = window.RADAR;
  var body = document.getElementById('board-body');
  var detail = document.getElementById('detail');
  var sortEl = document.getElementById('sort');
  var sectorEl = document.getElementById('sector');
  var watchEl = document.getElementById('watchlist');
  var searchEl = document.getElementById('search');
  var countEl = document.getElementById('count');
  var footerEl = document.getElementById('board-footer');
  var selected = null;

  if (!radar || !Array.isArray(radar.rows)) {
    body.innerHTML = '<tr><td colspan="8">No radar data found. Run the entrypoint to emit data.js.</td></tr>';
    return;
  }

  document.getElementById('subtitle').textContent =
    'as of ' + radar.as_of + ' · ' + radar.rows.length + ' ranked pre-token rows · ' +
    radar.live_size + ' live tokens set aside';
  document.getElementById('model-badge').textContent = radar.model_version;
  document.getElementById('asof-badge').textContent = radar.coverage.total + ' protocols in coverage';

  var sectors = [];
  radar.rows.forEach(function (row) {
    var s = row.category || 'Unclassified';
    if (sectors.indexOf(s) === -1) sectors.push(s);
  });
  sectors.sort();
  sectors.forEach(function (s) {
    var option = document.createElement('option');
    option.value = s === 'Unclassified' ? '' : s;
    option.textContent = s + ' ▾';
    sectorEl.appendChild(option);
  });

  var v = radar.validation;
  footerEl.textContent =
    radar.rows.length + ' rows · ' + radar.model_version +
    ' · LOO ' + v.loo_mae_log10.toFixed(6) +
    ' · WF ' + v.walk_mae_log10.toFixed(6) +
    ' · baseline ' + v.baseline_mae_log10.toFixed(6) +
    ' · coverage ' + radar.coverage.labelled + ' labelled / ' +
    radar.coverage.excluded + ' excluded';

  function minCapital(tvl) {
    if (tvl >= 5e9) return 500;
    if (tvl >= 1e9) return 250;
    if (tvl >= 1e8) return 100;
    if (tvl >= 2e7) return 50;
    return 25;
  }

  function cellClass(value) {
    return value === null || value === undefined ? '' : value > 0 ? 'up' : value < 0 ? 'down' : '';
  }

  function renderBoard() {
    var rows = filterSort(radar.rows, {
      sector: sectorEl.value,
      query: searchEl.value,
      sort: sortEl.value,
      watchlistOnly: watchEl.checked,
    });
    countEl.textContent = rows.length + ' of ' + radar.rows.length + ' rows';
    if (rows.length === 0) {
      body.innerHTML = '<tr><td colspan="8">No matching protocol.</td></tr>';
    } else {
      body.innerHTML = rows.map(function (r) {
        var change = r.change_7d;
        return '<tr tabindex="0" data-slug="' + esc(r.slug) + '"' +
          (r.watchlisted ? ' class="watch"' : '') +
          (r.slug === selected ? ' class="selected"' : '') + '>' +
          '<td class="num">' + r.rank + '</td>' +
          '<td><span class="name">' + esc(r.name) + '</span><br><span class="slug">' + esc(r.slug) + '</span></td>' +
          '<td>' + esc(r.category || '—') + '</td>' +
          '<td>' + esc((r.chains || []).join(', ')) + '</td>' +
          '<td class="num">' + esc(fmtUSD(r.tvl_usd)) + '</td>' +
          '<td class="num ' + cellClass(change) + '">' + esc(fmtPct(change)) + '</td>' +
          '<td class="num">' + (r.age_days === null ? '—' : r.age_days + 'd') + '</td>' +
          '<td class="num value">' + esc(fmtUSD(r.implied_value_usd)) + '</td></tr>';
      }).join('');
    }
    if (rows.length > 0 && rows.some(function (r) { return r.slug === selected; })) {
      renderDetail(rows.filter(function (r) { return r.slug === selected; })[0]);
    } else if (rows.length > 0) {
      selected = rows[0].slug;
      renderDetail(rows[0]);
    } else {
      detail.innerHTML = '<h2>No selection</h2><p class="note">Adjust the filters to see a protocol.</p>';
    }
  }

  function chip(label, value) {
    return '<div class="chip"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
  }

  function pair(label, value) {
    return '<div><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
  }

  function renderDetail(r) {
    var e = r.evidence;
    var hold = Math.round((r.hours - 3) / 24);
    var chips = [
      chip('Implied value', fmtUSD(r.implied_value_usd)),
      chip('TVL', fmtUSD(r.tvl_usd)),
      chip('7d change', fmtPct(r.change_7d)),
      chip('Age', r.age_days === null ? 'unknown' : r.age_days + ' days'),
      chip('Min capital', '$' + minCapital(r.tvl_usd)),
      chip('Hold', hold + ' days'),
      chip('Cost / hour', '$' + Number(r.cost_per_hour_usd).toFixed(2)),
      chip('Fitted log10', Number(e.predicted_log10_mcap).toFixed(4)),
    ].join('');
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    detail.innerHTML =
      '<h2><span class="rank">#' + r.rank + '</span>' + esc(r.slug) + '</h2>' +
      '<p class="note">' + esc(r.name) + ' · ' + esc(r.category || 'unclassified') +
      ' · ' + esc((r.chains || []).join(', ')) + '</p>' +
      '<div class="chips">' + chips + '</div>' +
      '<h3>Why this value</h3><p>' + esc(r.rationale) + '</p>' +
      '<p class="note">' + esc(fmtUSD(e.tvl_usd)) + ' TVL · ' +
      esc(e.sector_prior.toFixed(2)) + 'x sector prior · ' + e.comparable_count +
      ' comparable labelled tokens · median ' + esc(fmtUSD(e.comparable_median_mcap_usd)) + '</p>' +
      '<h3>Model check</h3><div class="panel">' +
      pair('Method', v.method) +
      pair('Labelled / used', v.labelled + ' / ' + v.used) +
      pair('Kept terms', v.kept_terms.join(', ') || 'none') +
      pair('Dropped terms', v.dropped_terms.join(', ') || 'none') +
      pair('Hold-out LOO MAE', v.loo_mae_log10.toFixed(6)) +
      pair('Walk-forward MAE', v.walk_mae_log10.toFixed(6)) +
      pair('Baseline LOO MAE', v.baseline_mae_log10.toFixed(6)) +
      pair('Intercept / logTVl', v.intercept.toFixed(6) + ' / ' + v.coef_log_tvl.toFixed(6)) +
      '</div>' +
      '<h3>Farm plan · ' + esc(fmtUSD(r.cost_usd)) + ' all-in over ' + r.hours + ' hours</h3>' +
      '<ol class="steps">' + steps + '</ol>';
  }

  sortEl.addEventListener('change', renderBoard);
  sectorEl.addEventListener('change', renderBoard);
  watchEl.addEventListener('change', renderBoard);
  searchEl.addEventListener('input', renderBoard);
  body.addEventListener('click', function (event) {
    var row = event.target.closest('tr[data-slug]');
    if (row) { selected = row.getAttribute('data-slug'); renderBoard(); }
  });
  body.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    var row = event.target.closest('tr[data-slug]');
    if (row) { selected = row.getAttribute('data-slug'); renderBoard(); }
  });
  renderBoard();
}());
