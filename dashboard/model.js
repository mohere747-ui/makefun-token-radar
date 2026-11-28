/* Small formatting and filter helpers; classic script, no modules, no dependencies. */
function fmtUSD(value) {
  if (value === null || value === undefined || !isFinite(Number(value))) return '—';
  const n = Number(value);
  const abs = Math.abs(n);
  if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

function fmtPct(value) {
  if (value === null || value === undefined || !isFinite(Number(value))) return '—';
  const n = Number(value);
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}

function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Filter then sort a copy of the board. Every comparison has a slug tie-break. */
function filterSort(rows, options) {
  const o = options || {};
  const sector = o.sector || '';
  const query = String(o.query || '').trim().toLowerCase();
  const watchlistOnly = Boolean(o.watchlistOnly);
  const sort = o.sort || 'implied';
  const bySlug = (a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  const result = (rows || []).filter((row) => {
    if (sector && row.category !== sector) return false;
    if (watchlistOnly && !row.watchlisted) return false;
    if (!query) return true;
    const haystack = [row.name, row.slug, row.category, (row.chains || []).join(' ')].join(' ').toLowerCase();
    return haystack.indexOf(query) !== -1;
  });
  const key = {
    implied: (r) => -r.implied_value_usd,
    tvl: (r) => -r.tvl_usd,
    change: (r) => -(r.change_7d || 0),
    age: (r) => (r.age_days === null ? 1e9 : r.age_days),
    name: (r) => r.name.toLowerCase(),
    rank: (r) => r.rank,
  }[sort] || ((r) => -r.implied_value_usd);
  return result.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? -1 : ka > kb ? 1 : bySlug(a, b);
  });
}
