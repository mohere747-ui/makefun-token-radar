// Token radar model v3 — value fitted on the snapshot's own labelled tokens.
//
// The snapshot contains 144 protocols whose token already trades (mcap_usd > 0). Those are the
// labels: fit log10(mcap) from log10(TVL), 7d change, age, chain breadth and sector, keep only
// terms that improve BOTH a leave-one-out test and a walk-forward test, then apply the fitted
// terms to the 342 protocols with no token. The board is the pre-token ranking; the live ledger
// and the coverage manifest account for all 758 protocols separately.

export interface SnapshotProtocol {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot {
  as_of: string; source: string; floor_usd: number;
  protocols: SnapshotProtocol[]; watchlist: string[];
}
export interface ModelConstants {
  floor_usd_note: string;
  growth_floor: number; growth_cap: number; ridge: number;
  max_value_usd: number;
}
export const MODEL: ModelConstants = {
  floor_usd_note: 'the snapshot floor is a watchlist rule, not a value cut-off',
  growth_floor: -80, growth_cap: 200, ridge: 1e-6, max_value_usd: 100_000_000_000_000,
};
export const MODEL_VERSION = 'radar-3-fitted';
export const CANDIDATE_TERMS = ['growth', 'age', 'chains', 'sector'] as const;
export type Term = typeof CANDIDATE_TERMS[number];
export interface Validation {
  method: string; labelled: number; used: number; kept_terms: Term[]; dropped_terms: Term[];
  baseline_mae_log10: number; loo_mae_log10: number; walk_mae_log10: number;
  final_loo_mae_log10: number; fitted_terms: string[]; intercept: number;
  coef_log_tvl: number; term_coef: number[];
}
export interface Evidence {
  tvl_usd: number; change_7d: number | null; age_days: number | null;
  chains: number; category: string | null; mcap_usd: null;
  features: number[]; predicted_log10_mcap: number;
}
export interface BoardRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: null; listed_at: string | null;
  gecko_id: null; symbol: null; token_status: 'pre-token'; age_days: number | null;
  implied_value_usd: number; rationale: string; evidence: Evidence;
  cost_usd: number; hours: number; cost_per_hour_usd: number;
  farm_steps: string[];
}
export interface RadarRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; age_days: number | null;
  implied_value_usd: number; rationale: string; farm_steps: string[];
  cost_usd: number; hours: number; cost_per_hour_usd: number;
}
export interface LiveRow {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; mcap_usd: number; change_7d: number | null; age_days: number | null;
}
export interface Coverage {
  protocols_total: number; board_count: number; live_count: number; excluded_count: number;
  watchlist_count: number; watchlist_on_board: number;
  board_slugs: string[]; live_slugs: string[]; excluded_slugs: string[]; watchlist: string[];
  excluded_reasons: { slug: string; reason: string }[];
}
export interface RadarData {
  as_of: string; source: string; floor_usd: number;
  model_version: string; model: ModelConstants;
  validation: Validation; coverage: Coverage;
  watchlist_size: number; board_size: number; early_size: number; live_size: number;
  rows: RadarRow[]; live: LiveRow[]; watchlist: string[];
}

export class SnapshotError extends Error {
  constructor(message: string) { super(message); this.name = 'SnapshotError'; }
}
const DAY = 86_400_000;
function finite(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`), b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY));
}
function clamp(n: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, n)); }
export function sectorPrior(category: string | null): number {
  const c = (category ?? '').toLowerCase();
  if (c.includes('ai') || c.includes('depin')) return 1.12;
  if (c.includes('dex') || c.includes('aggregat') || c.includes('lend') || c.includes('cdp')
    || c.includes('yield') || c.includes('liquid')) return 1.10;
  if (c.includes('prediction') || c.includes('gaming') || c.includes('gambling')) return 1.05;
  if (c.includes('bridge') || c.includes('interop')) return 1.00;
  if (c.includes('stak') || c.includes('restak')) return 0.95;
  if (c.includes('cex') || c.includes('exchange')) return 0.90;
  return 1.00;
}
/** Feature vector: intercept, log10 TVL, plus only the terms that survived both tests. */
function features(p: SnapshotProtocol, asOf: string, terms: readonly Term[]): number[] {
  const x = [1, Math.log10(p.tvl_usd + 1)];
  const age = ageDays(asOf, p.listed_at);
  for (const t of terms) {
    if (t === 'growth') x.push(clamp(finite(p.change_7d, 0), MODEL.growth_floor, MODEL.growth_cap) / 100);
    else if (t === 'age') x.push(Math.log10((age ?? 200) + 30));
    else if (t === 'chains') x.push(clamp(p.chains.length - 1, 0, 4));
    else if (t === 'sector') x.push(Math.log10(sectorPrior(p.category)));
  }
  return x;
}
/** Ridge-regularised least squares via the normal equations, solved by elimination. */
function solve(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    const tmp = a[col]!; a[col] = a[pivot]!; a[pivot] = tmp;
    const d = a[col]![col]!;
    if (Math.abs(d) < 1e-12) continue;
    for (let c = col; c <= n; c++) a[col]![c]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r]![col]!;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) a[r]![c]! -= f * a[col]![c]!;
    }
  }
  return a.map((row) => row[n]!);
}
function fit(rows: SnapshotProtocol[], asOf: string, terms: readonly Term[]): number[] {
  const width = features(rows[0]!, asOf, terms).length;
  const xtx = Array.from({ length: width }, () => new Array<number>(width).fill(0));
  const xty = new Array<number>(width).fill(0);
  for (const p of rows) {
    const x = features(p, asOf, terms), y = Math.log10(p.mcap_usd!);
    for (let i = 0; i < width; i++) {
      xty[i]! += x[i]! * y;
      for (let j = 0; j < width; j++) xtx[i]![j]! += x[i]! * x[j]!;
    }
  }
  for (let i = 0; i < width; i++) xtx[i]![i]! += MODEL.ridge;
  return solve(xtx, xty);
}
function predict(coef: number[], p: SnapshotProtocol, asOf: string, terms: readonly Term[]): number {
  const x = features(p, asOf, terms);
  return coef.reduce((sum, c, i) => sum + c * x[i]!, 0);
}
function mae(rows: SnapshotProtocol[], asOf: string, terms: readonly Term[], train: SnapshotProtocol[]): number {
  if (rows.length === 0) return Infinity;
  const coef = fit(train, asOf, terms);
  return rows.reduce((s, p) => s + Math.abs(predict(coef, p, asOf, terms) - Math.log10(p.mcap_usd!)), 0) / rows.length;
}
/** Two blind checks: leave-one-out, and fit on the older 70% to predict the newest 30%. */
function validate(labeled: SnapshotProtocol[], asOf: string, terms: readonly Term[]) {
  const loo = labeled.reduce((s, p) => s + mae([p], asOf, terms, labeled.filter((q) => q.slug !== p.slug)), 0) / labeled.length;
  const byAge = labeled.slice().sort((a, b) => (ageDays(asOf, b.listed_at) ?? 0) - (ageDays(asOf, a.listed_at) ?? 0));
  const cut = Math.max(20, Math.floor(byAge.length * 0.7));
  const walk = mae(byAge.slice(cut), asOf, terms, byAge.slice(0, cut));
  return { loo, walk };
}
function calibrate(labeled: SnapshotProtocol[], asOf: string) {
  const baseline = validate(labeled, asOf, []);
  let kept: Term[] = [], current = baseline;
  for (const term of CANDIDATE_TERMS) {
    const trial = [...kept, term], v = validate(labeled, asOf, trial);
    if (v.loo < current.loo && v.walk < current.walk) { kept = trial; current = v; }
  }
  const dropped = CANDIDATE_TERMS.filter((t) => !kept.includes(t));
  return { kept, dropped, final: current, baseline, coef: fit(labeled, asOf, kept) };
}
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const DERIVED_CATEGORY = new Set(['bridge', 'canonical bridge', 'liquid staking', 'liquid restaking', 'restaked btc', 'cex']);
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p) || p.tvl_usd <= 0) return false;
  if (p.category !== null && DERIVED_CATEGORY.has(p.category.toLowerCase())) return false;
  if (WRAPPED_WORD.test(p.name) || EXCHANGE_PREFIX.test(p.name) || VERSIONED.test(p.name)) return false;
  return true;
}
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 20_000_000) return 50;
  return 25;
}
function holdDays(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}
function action(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) return `Supply $${capital} USDC to ${p.name}'s money market on ${chain} and borrow nothing in the first epoch.`;
  if (c.includes('dex') || c.includes('yield')) return `Add $${capital} to ${p.name}'s deepest pool on ${chain} and stake the LP receipt.`;
  if (c.includes('bridge')) return `Bridge $${capital} USDC through ${p.name} to ${chain}, then supply it once on the destination.`;
  if (c.includes('stak') || c.includes('restak')) return `Delegate $${capital} of the native staking asset through ${p.name} on ${chain} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} USDC margin on ${p.name}, open one long and one short on different markets.`;
  if (c.includes('prediction')) return `Deposit $${capital} into ${p.name} on ${chain} and take positions in two resolved markets.`;
  if (c.includes('ai') || c.includes('depin')) return `Run one $${capital} paid job through ${p.name} on ${chain} and settle it end to end.`;
  return `Deposit $${capital} USDC into ${p.name} on ${chain} and use its core action once a week.`;
}
function farmSteps(p: SnapshotProtocol, age: number | null): { steps: string[]; capital: number; hours: number; perHour: number } {
  const capital = capitalFor(p), hold = holdDays(age), gas = p.chains.length > 2 ? 18 : 8;
  const hours = hold * 24 + 3;
  const perHour = (capital * 0.02 + gas) / hours;
  const chain = p.chains[0] ?? 'its main chain';
  const steps = [
    `Open a dedicated wallet for ${p.name} on ${chain}; keep its seed offline and fund it with $${capital} plus $${gas} for gas. Cost: $${gas} gas. Time: 10 minutes.`,
    `${action(p, capital, chain)} Cost: $${capital} minimum viable capital plus $${gas} gas (about $${perHour.toFixed(2)}/hour over the hold). Time: 20 minutes.`,
    `Repeat one qualifying action each week for ${hold} days across two snapshots; log every transaction hash. Cost: about $2 a week. Time: ${hold} days.`,
    `Check ${p.name}'s own points or governance page for a retroactive program before adding size; follow only links published there. Cost: $0. Time: 15 minutes.`,
    `Record the exit rule and the dated hashes, then compare the realised $/hour with the $${perHour.toFixed(2)}/hour estimate above. Cost: $0. Time: 5 minutes.`,
  ];
  return { steps, capital, hours, perHour };
}
function fmtUSD(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('no source');
  if (typeof o.floor_usd !== 'number' || !Number.isFinite(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('no floor_usd');
  if (!Array.isArray(o.protocols) || !Array.isArray(o.watchlist)) throw new SnapshotError('no protocols or watchlist');
  const protocols = o.protocols.map((v: unknown, i: number) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`protocol ${i} lacks slug/name/TVL`);
    }
    return {
      slug: p.slug, name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: (o.watchlist as unknown[]).filter((s): s is string => typeof s === 'string') };
}
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const labelled = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  if (labelled.length < 30) throw new SnapshotError('too few labelled tokens to fit a value model');
  const cal = calibrate(labelled, snapshot.as_of);
  const chosen = snapshot.protocols.filter(isRankable);
  const scored = chosen.map((p) => {
    const logValue = predict(cal.coef, p, snapshot.as_of, cal.kept);
    const implied = clamp(Math.round(Math.pow(10, logValue)), 1, model.max_value_usd);
    const age = ageDays(snapshot.as_of, p.listed_at);
    const farm = farmSteps(p, age);
    const evidence: Evidence = {
      tvl_usd: p.tvl_usd, change_7d: p.change_7d, age_days: age, chains: p.chains.length,
      category: p.category, mcap_usd: null,
      features: features(p, snapshot.as_of, cal.kept), predicted_log10_mcap: Math.round(logValue * 1e6) / 1e6,
    };
    const row: BoardRow = {
      rank: 0, slug: p.slug, name: p.name, category: p.category, chains: p.chains,
      tvl_usd: p.tvl_usd, change_7d: p.change_7d, mcap_usd: null, listed_at: p.listed_at,
      gecko_id: null, symbol: null, token_status: 'pre-token', age_days: age,
      implied_value_usd: implied,
      rationale: `${p.name}: TVL ${fmtUSD(p.tvl_usd)}, 7d ${p.change_7d === null ? 'n/a' : p.change_7d.toFixed(1) + '%'}, ${age ?? 'unknown'}d without a token, ${p.chains.length} chain(s), sector ${p.category ?? 'unclassified'}. Fitted log10 value ${evidence.predicted_log10_mcap}; minimum ${fmtUSD(farm.capital)} for ${farm.hours}h (about $${farm.perHour.toFixed(2)}/hour).`,
      evidence, cost_usd: farm.capital, hours: farm.hours,
      cost_per_hour_usd: Math.round(farm.perHour * 100) / 100,
      farm_steps: farm.steps,
    };
    return { row, farm };
  });
  scored.sort((a, b) => b.row.implied_value_usd - a.row.implied_value_usd
    || (a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0));
  const board = scored.map((x, i) => ({ ...x.row, rank: i + 1 }));
  const boardSlugs = new Set(board.map((r) => r.slug));
  const live = labelled.slice().sort((a, b) => b.mcap_usd! - a.mcap_usd!).map((p) => ({
    slug: p.slug, name: p.name, category: p.category, chains: p.chains,
    tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, change_7d: p.change_7d,
    age_days: ageDays(snapshot.as_of, p.listed_at),
  }));
  const liveSlugs = new Set(live.map((r) => r.slug));
  const excluded = snapshot.protocols.filter((p) => !boardSlugs.has(p.slug) && !liveSlugs.has(p.slug));
  const coverage: Coverage = {
    protocols_total: snapshot.protocols.length, board_count: board.length, live_count: live.length,
    excluded_count: excluded.length, watchlist_count: snapshot.watchlist.length,
    watchlist_on_board: snapshot.watchlist.filter((s) => boardSlugs.has(s)).length,
    board_slugs: board.map((r) => r.slug), live_slugs: live.map((r) => r.slug),
    excluded_slugs: excluded.map((p) => p.slug),
    excluded_reasons: excluded.map((p) => ({
      slug: p.slug,
      reason: p.category === 'CEX' ? 'centralised exchange, not a farmable protocol'
        : VERSIONED.test(p.name) ? 'version marker, not a distinct protocol'
        : isPreToken(p) ? 'no TVL or not rankable from the snapshot fields'
        : 'token market cap is zero; no usable label',
    })),
    watchlist: snapshot.watchlist.slice(),
  };
  const validation: Validation = {
    method: 'leave-one-out + walk-forward (older 70% fit, newest 30% predict), log10 MAE',
    labelled: labelled.length, used: labelled.length,
    kept_terms: cal.kept, dropped_terms: cal.dropped,
    baseline_mae_log10: Math.round(cal.baseline.loo * 1e6) / 1e6,
    loo_mae_log10: Math.round(cal.final.loo * 1e6) / 1e6,
    walk_mae_log10: Math.round(cal.final.walk * 1e6) / 1e6,
    final_loo_mae_log10: Math.round(cal.final.loo * 1e6) / 1e6,
    fitted_terms: ['intercept', 'log10_tvl', ...cal.kept.map((t) => `term_${t}`)],
    intercept: Math.round(cal.coef[0]! * 1e6) / 1e6,
    coef_log_tvl: Math.round(cal.coef[1]! * 1e6) / 1e6,
    term_coef: cal.coef.slice(2).map((c) => Math.round(c * 1e6) / 1e6),
  };
  const rows: RadarRow[] = board.map((r, i) => ({
    rank: r.rank, slug: r.slug, name: r.name, category: r.category, chains: r.chains,
    tvl_usd: r.tvl_usd, change_7d: r.change_7d, age_days: r.age_days,
    implied_value_usd: r.implied_value_usd, rationale: r.rationale, farm_steps: r.farm_steps,
    cost_usd: r.cost_usd, hours: r.hours, cost_per_hour_usd: r.cost_per_hour_usd,
  }));
  return {
    board,
    radar: {
      as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd,
      model_version: MODEL_VERSION, model, validation, coverage,
      watchlist_size: snapshot.watchlist.length, board_size: board.length,
      early_size: board.filter((r) => !snapshot.watchlist.includes(r.slug)).length,
      live_size: live.length, rows, live, watchlist: snapshot.watchlist.slice(),
    },
  };
}
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug(s): ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i}`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'all rows share one implied value';
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
