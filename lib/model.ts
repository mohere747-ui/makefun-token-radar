// Token launch radar model -- Node 22 standard library only, erasable TypeScript.
// Snapshot shape: 128 labelled tokens and 198 rankable pre-token rows (the board), 40 watchlist slugs.
// The value model is fitted on the labelled tokens; no protocol is named in the fit.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  floor_usd_note: string;
  growth_floor: number;
  growth_cap: number;
  ridge: number;
  max_value_usd: number;
}

export const MODEL: ModelConstants = {
  floor_usd_note: 'the snapshot floor is a watchlist rule, not a value cut-off',
  growth_floor: -80,
  growth_cap: 200,
  ridge: 1e-6,
  max_value_usd: 1e14,
};

export const MODEL_VERSION = 'radar-3-fitted';
export const CANDIDATE_TERMS = ['growth', 'age', 'chains', 'sector'] as const;
export type Term = (typeof CANDIDATE_TERMS)[number];

export interface Validation {
  method: string;
  labelled: number;
  used: number;
  kept_terms: string[];
  dropped_terms: string[];
  baseline_mae_log10: number;
  loo_mae_log10: number;
  walk_mae_log10: number;
  final_loo_mae_log10: number;
  fitted_terms: string[];
  intercept: number;
  coef_log_tvl: number;
  term_coef: number[];
}

export interface Evidence {
  tvl_usd: number;
  change_7d: number | null;
  chains: number;
  sector_prior: number;
  predicted_log10_mcap: number;
  comparable_count: number;
  comparable_median_mcap_usd: number | null;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  implied_value_usd: number;
  rationale: string;
  evidence: Evidence;
  cost_usd: number;
  hours: number;
  cost_per_hour_usd: number;
  farm_steps: string[];
}

export interface RadarRow extends BoardRow {
  watchlisted: boolean;
  age_days: number | null;
}

export interface LiveRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number;
  listed_at: string | null;
  symbol: string | null;
}

export interface Coverage {
  total: number;
  labelled: number;
  pre_token: number;
  rankable: number;
  excluded: number;
  board: number;
  live: number;
  watchlist: number;
  watchlist_missing: number;
  reasons: Record<string, number>;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: ModelConstants;
  validation: Validation;
  coverage: Coverage;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  watchlist: string[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BAD_CATEGORIES = new Set(['bridge', 'canonical bridge', 'liquid staking', 'liquid restaking', 'restaked btc', 'cex']);
const VERSION_NAME = /\s(?:V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
const EXCHANGE_NAME = /^(?:binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)/i;
const DERIVED_NAME = /\b(?:wrapped|staked|staking)\b/i;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function dateOrNull(value: unknown): string | null {
  const s = stringOrNull(value);
  if (s === null || !DATE.test(s)) return null;
  return s;
}

/** Parse a sealed snapshot, coercing protocol fields and rejecting only structural errors. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('invalid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot must be an object');
  const obj = raw as Record<string, unknown>;
  if (dateOrNull(obj.as_of) === null) throw new SnapshotError('as_of must be YYYY-MM-DD');
  if (typeof obj.source !== 'string' || obj.source.length === 0) throw new SnapshotError('source must be a string');
  const floor = numberOrNull(obj.floor_usd);
  if (floor === null || floor <= 0) throw new SnapshotError('floor_usd must be positive');
  if (!Array.isArray(obj.protocols)) throw new SnapshotError('protocols must be an array');
  if (!Array.isArray(obj.watchlist)) throw new SnapshotError('watchlist must be an array');

  const protocols: SnapshotProtocol[] = obj.protocols.map((item: unknown) => {
    const p = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
    const chains = Array.isArray(p.chains) ? p.chains.map((c: unknown) => String(c)) : [];
    return {
      slug: String(p.slug ?? ''),
      name: String(p.name ?? ''),
      category: stringOrNull(p.category),
      chains,
      tvl_usd: Math.max(0, numberOrNull(p.tvl_usd) ?? 0),
      change_7d: numberOrNull(p.change_7d),
      mcap_usd: numberOrNull(p.mcap_usd),
      listed_at: dateOrNull(p.listed_at),
      gecko_id: stringOrNull(p.gecko_id),
      symbol: stringOrNull(p.symbol),
    };
  });
  return {
    as_of: stringOrNull(obj.as_of)!,
    source: obj.source,
    floor_usd: floor,
    protocols,
    watchlist: obj.watchlist.map((s: unknown) => String(s)),
  };
}

/** Whole days between the snapshot date and a listing date; null when the listing is unknown. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null || !DATE.test(listedAt)) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

/** Ordered bucket prior: earlier groups win when a category matches more than one group. */
export function sectorPrior(category: string | null): number {
  const c = (category ?? '').toLowerCase();
  const groups: Array<[readonly string[], number]> = [
    [['ai', 'depin'], 1.12],
    [['dex', 'aggregat', 'lend', 'cdp', 'yield', 'liquid'], 1.1],
    [['prediction', 'gaming', 'gambling'], 1.05],
    [['bridge', 'interop'], 1.0],
    [['stak', 'restak'], 0.95],
    [['cex', 'exchange'], 0.9],
  ];
  for (const [keys, value] of groups) if (keys.some((k) => c.includes(k))) return value;
  return 1.0;
}

/** [intercept, log10(TVL+1)] followed by the requested candidate terms. */
export function features(p: SnapshotProtocol, asOf: string, terms: readonly string[]): number[] {
  const x = [1, Math.log10(p.tvl_usd + 1)];
  for (const term of terms) {
    if (term === 'growth') x.push(clamp(p.change_7d ?? 0, MODEL.growth_floor, MODEL.growth_cap) / 100);
    else if (term === 'age') x.push(Math.log10((ageDays(asOf, p.listed_at) ?? 200) + 30));
    else if (term === 'chains') x.push(clamp(p.chains.length - 1, 0, 4));
    else if (term === 'sector') x.push(Math.log10(sectorPrior(p.category)));
  }
  return x;
}

/** Ridge least squares through normal equations with full Gauss-Jordan elimination. */
export function fit(
  rows: readonly SnapshotProtocol[],
  terms: readonly string[],
  asOfOrModel?: string | ModelConstants,
  maybeModel: ModelConstants = MODEL,
): number[] {
  const asOf = typeof asOfOrModel === 'string' ? asOfOrModel : '';
  const model = asOfOrModel !== undefined && typeof asOfOrModel === 'object' ? asOfOrModel : maybeModel;
  const design = rows.map((p) => features(p, asOf, terms));
  const width = design.length > 0 ? design[0]!.length : terms.length + 2;
  const a: number[][] = Array.from({ length: width }, () => new Array<number>(width).fill(0));
  const b = new Array<number>(width).fill(0);
  for (const [i, x] of design.entries()) {
    const y = Math.log10(rows[i]!.mcap_usd!);
    for (let r = 0; r < width; r++) {
      b[r] += x[r]! * y;
      for (let c = 0; c < width; c++) a[r]![c] += x[r]! * x[c]!;
    }
  }
  for (let r = 0; r < width; r++) a[r]![r]! += model.ridge;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < width; col++) {
    let pivot = col;
    for (let r = col + 1; r < width; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    if (Math.abs(m[col]![col]!) < 1e-14) continue;
    for (let r = 0; r < width; r++) {
      if (r === col) continue;
      const factor = m[r]![col]! / m[col]![col]!;
      for (let k = col; k <= width; k++) m[r]![k] -= factor * m[col]![k]!;
    }
  }
  return m.map((row, i) => row[width]! / row[i]!);
}

/** Dot a fitted coefficient vector with either a feature vector or a protocol. */
export function predict(
  p: SnapshotProtocol | readonly number[],
  asOfOrCoef: string | readonly number[],
  coefOrTerms: readonly number[] | readonly string[] = [],
  termsOrAsOf: readonly string[] | string = [],
): number {
  if (Array.isArray(p) && (p.length === 0 || typeof p[0] === 'number')) {
    const coef = Array.isArray(asOfOrCoef) ? (asOfOrCoef as readonly number[]) : [];
    return p.reduce((sum, value, i) => sum + value * (coef[i] ?? 0), 0);
  }
  const protocol = p as SnapshotProtocol;
  if (typeof asOfOrCoef === 'string') {
    const coef = coefOrTerms as readonly number[];
    const terms = termsOrAsOf as readonly string[];
    return predict(features(protocol, asOfOrCoef, terms), coef);
  }
  const coef = asOfOrCoef as readonly number[];
  const terms = Array.isArray(coefOrTerms) ? (coefOrTerms as readonly string[]) : [];
  const asOf = typeof termsOrAsOf === 'string' ? termsOrAsOf : '';
  return predict(features(protocol, asOf, terms), coef);
}

/** Mean absolute error in log10 market-cap space. */
export function mae(
  rows: readonly SnapshotProtocol[],
  asOfOrCoef: string | readonly number[],
  coefOrTerms: readonly number[] | readonly string[] = [],
  termsOrAsOf: readonly string[] | string = [],
): number {
  if (rows.length === 0) return 0;
  let total = 0;
  for (const p of rows) {
    const estimate = typeof asOfOrCoef === 'string'
      ? predict(p, asOfOrCoef, coefOrTerms as readonly number[], termsOrAsOf as readonly string[])
      : predict(p, asOfOrCoef, coefOrTerms as readonly string[], typeof termsOrAsOf === 'string' ? termsOrAsOf : '');
    total += Math.abs(estimate - Math.log10(p.mcap_usd!));
  }
  return total / rows.length;
}

interface Metrics {
  loo: number;
  walk: number;
  coef: number[];
}

function metrics(rows: readonly SnapshotProtocol[], asOf: string, terms: readonly string[], model: ModelConstants): Metrics {
  let looSum = 0;
  for (let i = 0; i < rows.length; i++) {
    const held = rows[i]!;
    const train = rows.filter((_, j) => j !== i);
    const coef = fit(train, terms, asOf, model);
    looSum += Math.abs(predict(held, asOf, coef, terms) - Math.log10(held.mcap_usd!));
  }
  const indexed = rows.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => {
    // Unknown listing dates are the newest: the walk-forward test predicts them last.
    const ka = a.p.listed_at ?? '9999-99-99';
    const kb = b.p.listed_at ?? '9999-99-99';
    return ka < kb ? -1 : ka > kb ? 1 : a.i - b.i;
  });
  const cut = Math.floor(indexed.length * 0.7);
  const train = indexed.slice(0, cut).map((x) => x.p);
  const held = indexed.slice(cut).map((x) => x.p);
  const coef = fit(train, terms, asOf, model);
  const walk = held.length > 0 ? mae(held, asOf, coef, terms) : 0;
  return { loo: rows.length > 0 ? looSum / rows.length : 0, walk, coef: fit(rows, terms, asOf, model) };
}

/** Full validation report for a chosen term set. */
export function validate(
  rows: readonly SnapshotProtocol[],
  asOf: string,
  terms: readonly string[] = [],
  model: ModelConstants = MODEL,
): Validation {
  const m = metrics(rows, asOf, terms, model);
  return {
    method: 'ridge normal equations; leave-one-out and 70/30 walk-forward log10 MAE',
    labelled: rows.length,
    used: rows.length,
    kept_terms: terms.slice(),
    dropped_terms: [],
    baseline_mae_log10: m.loo,
    loo_mae_log10: m.loo,
    walk_mae_log10: m.walk,
    final_loo_mae_log10: m.loo,
    fitted_terms: terms.slice(),
    intercept: m.coef[0] ?? 0,
    coef_log_tvl: m.coef[1] ?? 0,
    term_coef: m.coef.slice(2),
  };
}

/** Greedy forward selection: a term survives only when BOTH hold-out scores improve. */
export function calibrate(
  rows: readonly SnapshotProtocol[],
  asOf: string,
  model: ModelConstants = MODEL,
): Validation {
  const baseline = metrics(rows, asOf, [], model);
  const kept: string[] = [];
  const dropped: string[] = [];
  let current = baseline;
  for (const term of CANDIDATE_TERMS) {
    const trialTerms = [...kept, term];
    const trial = metrics(rows, asOf, trialTerms, model);
    if (trial.loo < current.loo && trial.walk < current.walk) {
      kept.push(term);
      current = trial;
    } else {
      dropped.push(term);
    }
  }
  const final = metrics(rows, asOf, kept, model);
  return {
    method: 'ridge normal equations; leave-one-out and 70/30 walk-forward log10 MAE',
    labelled: rows.length,
    used: rows.length,
    kept_terms: kept,
    dropped_terms: dropped,
    baseline_mae_log10: baseline.loo,
    loo_mae_log10: final.loo,
    walk_mae_log10: final.walk,
    final_loo_mae_log10: final.loo,
    fitted_terms: kept.slice(),
    intercept: final.coef[0] ?? 0,
    coef_log_tvl: final.coef[1] ?? 0,
    term_coef: final.coef.slice(2),
  };
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A pre-token is rankable when it is a real, single, non-exchange protocol with TVL. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (p.tvl_usd <= 0) return false;
  const category = (p.category ?? '').toLowerCase().trim();
  if (BAD_CATEGORIES.has(category)) return false;
  const name = p.name ?? '';
  if (VERSION_NAME.test(name)) return false;
  if (EXCHANGE_NAME.test(name)) return false;
  if (DERIVED_NAME.test(name)) return false;
  return true;
}

export function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 5e9) return 500;
  if (tvlUsd >= 1e9) return 250;
  if (tvlUsd >= 1e8) return 100;
  if (tvlUsd >= 2e7) return 50;
  return 25;
}

/** A new listing needs a longer observation window than a mature one. */
export function holdDays(p: SnapshotProtocol | number | null, asOf = ''): number {
  if (p === null || p === undefined) return 30;
  const age = typeof p === 'number' ? p : ageDays(asOf, p.listed_at);
  if (age === null || !Number.isFinite(age)) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function categoryGroup(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) return 'lend';
  if (c.includes('dex') || c.includes('yield') || c.includes('farm') || c.includes('aggregat')) return 'dex';
  if (c.includes('bridge') || c.includes('interop')) return 'bridge';
  if (c.includes('stak') || c.includes('restak')) return 'stake';
  if (c.includes('perp') || c.includes('derivative') || c.includes('option') || c.includes('basis')) return 'perp';
  if (c.includes('prediction') || c.includes('gaming') || c.includes('gambl')) return 'prediction';
  if (c.includes('ai') || c.includes('depin')) return 'ai';
  return 'default';
}

/** One concrete, category-specific action; every sentence names the budget. */
export function action(p: SnapshotProtocol, capital: number, chain: string): string {
  const where = chain || 'its home chain';
  switch (categoryGroup(p.category)) {
    case 'lend':
      return `Deposit $${capital} USDC into the ${where} money market and borrow against it only with a health factor above 2.`;
    case 'dex':
      return `Provide $${capital} USDC as one-sided liquidity in the ${where} pool and claim the emissions weekly.`;
    case 'bridge':
      return `Bridge $${capital} USDC into ${where} over the canonical route and park it in the destination money market.`;
    case 'stake':
      return `Stake $${capital} USDC-derived collateral on ${where} and restake only the liquid receipt token.`;
    case 'perp':
      return `Post $${capital} USDC as margin for a size-neutral perpetual basis trade on ${where} and fund weekly.`;
    case 'prediction':
      return `Split $${capital} USDC into small uncorrelated ${where} prediction positions and settle before each market expires.`;
    case 'ai':
      return `Commit $${capital} USDC to ${where} compute or data rewards and withdraw when the epoch closes.`;
    default:
      return `Deposit $${capital} USDC into the ${where} vault, claim rewards weekly, and keep the principal withdrawable.`;
  }
}

/** Five costed, timed steps with one consistent capital / gas / hourly budget. */
export function farmSteps(p: SnapshotProtocol, capital: number, hold: number, chain?: string): string[] {
  const where = chain && chain.length > 0 ? chain : (p.chains[0] ?? 'its home chain');
  const gas = p.chains.length > 2 ? 18 : 8;
  const hours = hold * 24 + 3;
  const perHour = (capital * 0.02 + gas) / hours;
  const weeks = Math.round(hold / 7);
  const money = action(p, capital, where);
  return [
    `1. Fund the wallet on ${where}: send $${capital} USDC plus $${gas} in native gas; allow 1 hour.`,
    `2. ${money} Budget: $${capital} USDC principal (recoverable) plus $${gas} native gas, about $${perHour.toFixed(2)}/hour; allow 2 hours.`,
    `3. Claim rewards weekly for ${weeks} weeks (${hold} days elapsed) and spend about $2 per week from the gas budget; allow 1 hour each time.`,
    `4. Check retroactive rewards at the end of week ${weeks}: spend about $2 in gas and 1 hour to verify the eligibility snapshot against the position hashes.`,
    `5. Exit and record the rule: redeem the $${capital} USDC principal, spend about $2 in gas, and log the exit condition plus transaction hashes; allow 1 hour.`,
  ];
}

function shortUSD(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function exclusionReason(p: SnapshotProtocol, labelled: ReadonlySet<string>): string | null {
  if (labelled.has(p.slug)) return 'labelled';
  if (!isPreToken(p)) return 'already_priced';
  if (p.tvl_usd <= 0) return 'zero_tvl';
  const category = (p.category ?? '').toLowerCase().trim();
  if (BAD_CATEGORIES.has(category)) return 'excluded_category';
  if (VERSION_NAME.test(p.name)) return 'versioned_name';
  if (EXCHANGE_NAME.test(p.name)) return 'exchange_name';
  if (DERIVED_NAME.test(p.name)) return 'wrapped_or_staked';
  return null;
}

/** Rank all pre-tokens with the fitted value, keep live tokens separate, account for every input row. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const asOf = snapshot.as_of;
  const labelled = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .slice()
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const watchset = new Set(snapshot.watchlist);
  const validation = calibrate(labelled, asOf, model);
  const terms = validation.fitted_terms;
  const coef = fit(labelled, terms, asOf, model);

  const scored = snapshot.protocols
    .filter((p) => isPreToken(p) && isRankable(p))
    .map((p) => ({ p, value: Math.pow(10, predict(p, asOf, coef, terms)) }))
    .sort((a, b) => b.value - a.value || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const rows: RadarRow[] = scored.map(({ p, value }, i) => {
    const prior = sectorPrior(p.category);
    const sameSector = labelled.filter((q) => sectorPrior(q.category) === prior).map((q) => q.mcap_usd!);
    const implied = Math.round(clamp(value, 0, model.max_value_usd));
    const capital = capitalFor(p.tvl_usd);
    const hold = holdDays(p, asOf);
    const chain = p.chains[0] ?? 'its home chain';
    const hours = hold * 24 + 3;
    const cost = capital * 0.02 + (p.chains.length > 2 ? 18 : 8);
    const predicted = predict(p, asOf, coef, terms);
    return {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains.slice(),
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      implied_value_usd: implied,
      rationale:
        `Fitted on ${labelled.length} labelled tokens: ${shortUSD(p.tvl_usd)} TVL in ${p.category ?? 'unclassified'} ` +
        `(${prior.toFixed(2)}x sector prior, ${p.chains.length} chain${p.chains.length === 1 ? '' : 's'}, ` +
        `${(p.change_7d ?? 0).toFixed(2)}% 7d) maps to ${shortUSD(implied)} of implied value.`,
      evidence: {
        tvl_usd: p.tvl_usd,
        change_7d: p.change_7d,
        chains: p.chains.length,
        sector_prior: prior,
        predicted_log10_mcap: predicted,
        comparable_count: sameSector.length,
        comparable_median_mcap_usd: median(sameSector),
      },
      cost_usd: Math.round(cost * 100) / 100,
      hours,
      cost_per_hour_usd: Math.round((cost / hours) * 100) / 100,
      farm_steps: farmSteps(p, capital, hold, chain),
      watchlisted: watchset.has(p.slug),
      age_days: ageDays(asOf, p.listed_at),
    };
  });

  const live: LiveRow[] = labelled.map((p, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains.slice(),
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd!,
    listed_at: p.listed_at,
    symbol: p.symbol,
  }));

  const labelledSet = new Set(labelled.map((p) => p.slug));
  const reasons: Record<string, number> = {};
  let preToken = 0;
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) preToken++;
    const reason = exclusionReason(p, labelledSet);
    if (reason !== null) reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  const boardSlugs = new Set(rows.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((slug) => !boardSlugs.has(slug));
  const coverage: Coverage = {
    total: snapshot.protocols.length,
    labelled: labelled.length,
    pre_token: preToken,
    rankable: rows.length,
    excluded: snapshot.protocols.length - rows.length - live.length,
    board: rows.length,
    live: live.length,
    watchlist: snapshot.watchlist.length,
    watchlist_missing: missing.length,
    reasons,
  };

  const board: BoardRow[] = rows.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains.slice(),
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    implied_value_usd: r.implied_value_usd,
    rationale: r.rationale,
    evidence: { ...r.evidence },
    cost_usd: r.cost_usd,
    hours: r.hours,
    cost_per_hour_usd: r.cost_per_hour_usd,
    farm_steps: r.farm_steps.slice(),
  }));
  return {
    board,
    radar: {
      as_of: asOf,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      model_version: MODEL_VERSION,
      model: { ...model },
      validation,
      coverage,
      watchlist_size: snapshot.watchlist.length,
      board_size: rows.length,
      early_size: rows.length,
      live_size: live.length,
      rows,
      live,
      watchlist: snapshot.watchlist.slice(),
    },
  };
}

/** A short description of anything that would make the gate reject a written board. */
export function boardIssue(board: readonly BoardRow[], snapshot: Snapshot): string | null {
  if (board.length === 0) return 'empty board';
  const slugs = new Set<string>();
  for (const [i, row] of board.entries()) {
    if (row.rank !== i + 1) return `bad rank at row ${i + 1}`;
    if (slugs.has(row.slug)) return `duplicate slug ${row.slug}`;
    slugs.add(row.slug);
    if (!Number.isFinite(row.implied_value_usd) || row.implied_value_usd < 0) return `bad value for ${row.slug}`;
    if (!Number.isFinite(row.cost_per_hour_usd) || row.cost_per_hour_usd < 0) return `bad hourly cost for ${row.slug}`;
    if (row.farm_steps.length !== 5) return `bad farm plan for ${row.slug}`;
  }
  const missing = snapshot.watchlist.filter((slug) => !slugs.has(slug));
  if (missing.length > 0) return `watchlist missing: ${missing.slice(0, 3).join(', ')}`;
  return null;
}

/** A complete, self-contained data script for the offline dashboard. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar).replace(/</g, '\\u003c')};\n`;
}
