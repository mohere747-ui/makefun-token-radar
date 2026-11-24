'use strict';
const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const fmtUSD = (n) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
};
const fmtPct = (v) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const watch = new Set(R.watchlist || []);
let tab = 'board';
let selSlug = null;

function init() {
  const m = R.model;
  $('stats').innerHTML = [
    ['as of', R.as_of], ['board rows', R.board_size],
    ['watchlist', R.watchlist_size], ['early finds', R.early_size],
    ['model', R.model_version],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  const sectors = [...new Set(R.rows.map((r) => r.category || 'Uncategorized'))].sort();
  $('sector').innerHTML = `<option value="">All sectors</option>`
    + sectors.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  $('foot').innerHTML =
    `<span>floor: ${fmtUSD(R.floor_usd)} TVL · watchlist is the floor, not the ceiling</span>`
    + `<span>growth weight up ×${m.growth_weight_up}, down ×${m.growth_weight_down} · maturity ${m.maturity_floor}–${(m.maturity_floor + m.maturity_range).toFixed(2)}</span>`
    + `<span>source: ${esc(R.source)}</span>`;
  for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => {
    tab = b.dataset.tab;
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
    render();
  });
  $('q').addEventListener('input', render);
  $('sector').addEventListener('change', render);
  $('sort').addEventListener('change', render);
  $('only-watch').addEventListener('change', render);
  render();
}

function filtered() {
  const q = $('q').value.trim().toLowerCase();
  const sec = $('sector').value;
  const sort = $('sort').value;
  const onlyWatch = $('only-watch').checked;
  let rows = R.rows.slice();
  if (onlyWatch) rows = rows.filter((r) => watch.has(r.slug));
  if (sec) rows = rows.filter((r) => (r.category || 'Uncategorized') === sec);
  if (q) rows = rows.filter((r) => (r.name + ' ' + r.slug + ' ' + r.chains.join(' ')).toLowerCase().includes(q));
  const key = (r) => (r[sort] === null ? -Infinity : r[sort]);
  rows.sort((a, b) => sort === 'rank'
    ? a.rank - b.rank
    : key(b) - key(a) || a.rank - b.rank);
  return rows;
}

function render() {
  if (tab === 'live') return renderLive();
  const rows = filtered();
  $('count').textContent = `${rows.length} of ${R.rows.length} rows`;
  const max = Math.max(...rows.map((r) => r.implied_value_usd), 1);
  const body = $('grid').querySelector('tbody');
  body.innerHTML = rows.map((r) => {
    const pct = r.change_7d;
    const cls = pct === null ? 'flat' : pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
    return `<tr data-slug="${esc(r.slug)}" class="${r.slug === selSlug ? 'sel' : ''}">
      <td class="muted">${r.rank}</td>
      <td><div class="name">${esc(r.name)}</div><div class="slug">${esc(r.slug)}</div></td>
      <td class="sector">${esc(r.category || '—')}</td>
      <td class="chains">${esc(r.chains.slice(0, 3).join(', ') || '—')}</td>
      <td class="r">${fmtUSD(r.tvl_usd)}</td>
      <td class="r ${cls}">${fmtPct(pct)}</td>
      <td class="r">${r.age_days === null ? '—' : `${r.age_days}d`}</td>
      <td class="r"><span class="iv">${fmtUSD(r.implied_value_usd)}</span>
        <span class="bar"><i style="width:${Math.max(2, Math.round(r.implied_value_usd / max * 100))}%"></i></span></td>
    </tr>`;
  }).join('');
  for (const tr of body.querySelectorAll('tr')) tr.addEventListener('click', () => showDetail(tr.dataset.slug));
  if (selSlug) showDetail(selSlug);
}

function showDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  selSlug = slug;
  document.querySelectorAll('#grid tbody tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.slug === slug));
  const liveNote = R.live.find((l) => l.slug === slug)
    ? '<p class="tag">market cap: ' + fmtUSD(R.live.find((l) => l.slug === slug).mcap_usd) + '</p>' : '';
  $('detail').innerHTML = `
    <h2>${esc(r.name)}</h2>
    <div class="meta">#${r.rank} · ${esc(r.slug)} · ${esc(r.category || 'uncategorised')} · ${esc(r.chains.join(', ') || '—')}</div>
    <dl class="model">
      <dt>implied value</dt><dd>${fmtUSD(r.implied_value_usd)}</dd>
      <dt>TVL</dt><dd>${fmtUSD(r.tvl_usd)}</dd>
      <dt>7d change</dt><dd>${fmtPct(r.change_7d)}</dd>
      <dt>age (listed)</dt><dd>${r.age_days === null ? 'unknown' : r.age_days + ' days'}</dd>
      <dt>scale multiple</dt><dd>×${r.scale_multiple}</dd>
      <dt>growth multiple</dt><dd>×${r.growth_multiplier}</dd>
      <dt>maturity multiple</dt><dd>×${r.maturity_multiplier}</dd>
    </dl>
    <p>${esc(r.rationale)}</p>
    ${liveNote}
    <h3>Farm plan</h3>
    <ol class="steps">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
}

function renderLive() {
  $('count').textContent = `${R.live.length} live-token protocols by market cap`;
  $('detail').innerHTML = '<p class="muted">These already trade; their value is the market’s own, not the model’s.</p>';
  const body = $('grid').querySelector('tbody');
  body.innerHTML = R.live.map((l) => `<tr>
    <td class="muted">·</td>
    <td><div class="name">${esc(l.name)}</div><div class="slug">${esc(l.slug)}</div></td>
    <td class="sector">${esc(l.category || '—')}</td>
    <td class="chains">${esc(l.chains.slice(0, 3).join(', ') || '—')}</td>
    <td class="r">${fmtUSD(l.tvl_usd)}</td>
    <td class="r ${l.change_7d === null ? 'flat' : l.change_7d > 0.5 ? 'up' : l.change_7d < -0.5 ? 'down' : 'flat'}">${fmtPct(l.change_7d)}</td>
    <td class="r">listed</td>
    <td class="r iv">${fmtUSD(l.mcap_usd)}</td>
  </tr>`).join('');
  for (const tr of body.querySelectorAll('tr')) tr.style.cursor = 'default';
}

init();
