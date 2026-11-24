// The token radar's model v2: one sealed snapshot in, one ranked board out.
//
// Design rules the model obeys:
//  - every figure comes from the snapshot's own ten fields; no protocol name is special-cased;
//  - value follows TVL with diminishing returns (a $5B protocol is not automatically 10x a $500M one),
//    then growth, maturity, sector and chain breadth adjust it;
//  - the watchlist (40 slugs) is the floor, never the ceiling: below-floor pre-token protocols fill the
//    board so a reader sees what the market has not priced yet;
//  - live-token protocols are kept apart and shown as the market's own values, never mixed into the board.

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
  base_multiple: number;
  growth_weight_up: number;
  growth_weight_down: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight_up: 0.9,
  growth_weight_down: 1.25,
  growth_floor: -80,
  growth_cap: 200,
  maturity_floor: 0.7,
  maturity_range: 0.45,
  maturity_days: 1095,
  unknown_age_days: 200,
};

export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 300;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

export interface FarmStep { text: string; cost: string; time: string }

export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  rationale: string;
  model: {
    base_multiple: number;
    scale_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    sector_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null; listed_at: string | null;
  age_days: number | null; implied_value_usd: number; rationale: string; farm_steps: string[];
  growth_multiplier: number; maturity_multiplier: number; scale_multiple: number;
}

export interface LiveRow {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; mcap_usd: number | null; change_7d: number | null;
}

export interface RadarData {
  as_of: string; source: string; floor_usd: number;
  model: ModelConstants; model_version: string;
  watchlist_size: number; board_size: number; early_size: number; live_size: number;
  rows: RadarRow[]; live: LiveRow[]; watchlist: string[];
}

export class SnapshotError extends Error {
  constructor(message: string) { super(message); this.name = 'SnapshotError'; }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Diminishing returns on TVL: the marginal dollar of TVL is worth less the larger the protocol. */
export function scaleMultiple(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 0.36;
  if (tvlUsd >= 1_000_000_000) return 0.45;
  if (tvlUsd >= 500_000_000) return 0.55;
  if (tvlUsd >= 100_000_000) return 0.68;
  if (tvlUsd >= 50_000_000) return 0.85;
  return 1.0;
}

/** Sector prior from the snapshot's own category string; no name is read here. */
export function sectorMultiplier(category: string | null): number {
  const c = (category ?? '').toLowerCase();
  if (c.includes('ai') || c.includes('depin')) return 1.12;
  if (c.includes('dex') || c.includes('aggregat') || c.includes('lend') || c.includes('cdp')
    || c.includes('yield') || c.includes('liquid')) return 1.1;
  if (c.includes('prediction') || c.includes('gaming') || c.includes('gambling')) return 1.05;
  if (c.includes('bridge') || c.includes('interop')) return 1.0;
  if (c.includes('stak') || c.includes('restak')) return 0.95;
  if (c.includes('cex') || c.includes('exchange')) return 0.9;
  return 1.0;
}

export interface Score {
  implied: number; growthPct: number; growthMult: number; maturityMult: number;
  scaleMult: number; sectorMult: number; chainMult: number; age: number | null; base: number;
}

export function score(protocol: SnapshotProtocol, asOf: string, model: ModelConstants = MODEL): Score {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const weight = growthPct >= 0 ? model.growth_weight_up : model.growth_weight_down;
  const growthMult = 1 + (growthPct / 100) * weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor
    + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const scaleMult = scaleMultiple(protocol.tvl_usd);
  const sectorMult = sectorMultiplier(protocol.category);
  const chainMult = 1 + Math.min(Math.max(protocol.chains.length - 1, 0), 4) * 0.015;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * scaleMult * growthMult * maturityMult * sectorMult * chainMult));
  return { implied, growthPct, growthMult, maturityMult, scaleMult, sectorMult, chainMult, age, base };
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function chainsText(p: SnapshotProtocol): string {
  if (p.chains.length === 0) return 'its main chain';
  if (p.chains.length <= 3) return p.chains.join(', ');
  return `${p.chains.slice(0, 3).join(', ')} and ${p.chains.length - 3} more`;
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 20_000_000) return 50;
  return 25;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC into ${n}'s money market on ${chain}, borrow nothing at first, and leave the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('farm')) return `Add $${capital} to ${n}'s deepest pool on ${chain}, stake the LP receipt, and do not compound for the first two weeks.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${n}, then supply it in the destination pool so the bridge leg and the pool leg both count.`;
  if (c.includes('stak') || c.includes('restak')) return `Delegate $${capital} of the chain's staking asset through ${n} on ${chain} and keep the liquid receipt in the same wallet.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} of USDC as margin on ${n}, open one small long and one small short on different markets, and hold both for a week.`;
  if (c.includes('prediction')) return `Deposit $${capital} into ${n} on ${chain}, take positions in two resolved markets, and claim both outcomes.`;
  if (c.includes('curat') || c.includes('alloc')) return `Allocate $${capital} to a ${n} vault on ${chain}, keep the vault shares, and reinvest once after the first epoch.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${n} on ${chain} and route one recurring payment through it.`;
  if (c.includes('rwa')) return `Subscribe $${capital} to ${n}'s yield tranche on ${chain} and hold the receipt until the next epoch.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${n} on ${chain}, then use one covered market so the policy is exercised.`;
  if (c.includes('ai') || c.includes('depin')) return `Run one $${capital} job on ${n} on ${chain}: rent capacity or stake the work token, and settle it end to end.`;
  return `Deposit $${capital} of USDC into ${n} on ${chain}, use its core action once a week, and keep the position open.`;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    { text: `Open a fresh wallet that holds only this farm's funds, keep its seed phrase offline, and fund it with $${capital} plus about $20 for gas.`, cost: 'under $3 of gas to set up', time: '10 minutes' },
    { text: action, cost: `$${capital} of capital and $${capital >= 250 ? 10 : 5} of gas`, time: '15–30 minutes' },
    { text: `Perform one qualifying action every week (deposit, swap, borrow, vote or claim) so the wallet appears in consecutive snapshots, not just one.`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position at least ${hold} days across two or more snapshots, and write each transaction hash in a log.`, cost: `the $${capital} stays deployed`, time: `${hold} days` },
    { text: `Check ${p.name}'s own governance or points page for a retroactive program before you add size, and follow only links published there.`, cost: 'no fee to read; never pay to claim', time: '15 minutes' },
    { text: `Diversify across the chains ${chainsText(p)} names: repeat the same action on two of them instead of doubling on one.`, cost: `$${Math.max(25, Math.round(capital / 2))} more capital`, time: 'one more session' },
    { text: `Set an exit rule before you start (for example withdraw after two flat weeks) and record the date, so the farm ends by decision rather than by drift.`, cost: 'nothing', time: '5 minutes' },
  ];
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, s: score(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((x, i) => ({
    rank: i + 1,
    slug: x.p.slug,
    name: x.p.name,
    category: x.p.category,
    chains: x.p.chains,
    tvl_usd: x.p.tvl_usd,
    change_7d: x.p.change_7d,
    mcap_usd: x.p.mcap_usd,
    listed_at: x.p.listed_at,
    gecko_id: x.p.gecko_id,
    symbol: x.p.symbol,
    token_status: 'pre-token',
    age_days: x.s.age,
    implied_value_usd: x.s.implied,
    rationale: `${x.p.name}: TVL $${Math.round(x.p.tvl_usd / 1e6)}M at scale ×${round4(x.s.scaleMult)}, 7d ${x.s.growthPct}% (×${round4(x.s.growthMult)}), age ${x.s.age ?? 'n/a'}d (×${round4(x.s.maturityMult)}), sector ×${round4(x.s.sectorMult)}.`,
    model: {
      base_multiple: model.base_multiple,
      scale_multiple: round4(x.s.scaleMult),
      growth_pct: x.s.growthPct,
      growth_multiplier: round4(x.s.growthMult),
      maturity_multiplier: round4(x.s.maturityMult),
      sector_multiplier: round4(x.s.sectorMult),
      chain_multiplier: round4(x.s.chainMult),
      age_days: x.s.age,
    },
    farm_steps: farmSteps(x.p, x.s.age).map(stepText),
  }));
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank, slug: row.slug, name: row.name, category: row.category, chains: row.chains,
    tvl_usd: row.tvl_usd, change_7d: row.change_7d, mcap_usd: row.mcap_usd, listed_at: row.listed_at,
    age_days: row.age_days, implied_value_usd: row.implied_value_usd, rationale: row.rationale,
    farm_steps: row.farm_steps,
    growth_multiplier: row.model.growth_multiplier, maturity_multiplier: row.model.maturity_multiplier,
    scale_multiple: row.model.scale_multiple,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd,
    model, model_version: MODEL_VERSION, watchlist_size: snapshot.watchlist.length,
    board_size: board.length, early_size: early, live_size: live.length,
    rows: board.map(radarRow), live, watchlist: snapshot.watchlist.slice(),
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
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
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
