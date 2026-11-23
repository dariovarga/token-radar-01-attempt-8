// Breakout Radar — a momentum-breakout token launch radar (model v8).
//
// The board ranks pre-token protocols by the implied value of the token they
// may one day issue, under one question: is this protocol breaking out right
// now? A launch is worth most when capital is arriving fast, from a base big
// enough to matter, into a protocol that has run long enough without a token
// to be real but not so long that the window has gone stale.
//
//   implied = base x momentum x runway
//
//   base     = tvl_usd x BASE_MULTIPLE x (tvl_usd / 1e9) ^ SCALE_CURVE
//              The scale curve is mildly concave (exponent -0.08): a $60M
//              protocol is marked up ~27% against a $1B one, a $10B one
//              marked down ~17%. Size still matters — it just does not
//              decide the board on its own.
//   momentum = 1 + GROWTH_WEIGHT x g + BREAKOUT_KICK x max(0, g - KICK_AT)
//              where g is the 7-day TVL change in percent, clamped to
//              [-80, 200]. The kick is the breakout term: growth above 10%
//              in a week earns an extra premium on top of the linear term,
//              so a protocol compounding week over week separates fast from
//              one that is merely large. Negative growth discounts, floored
//              so a cold week never zeroes a real protocol.
//   runway   = a confidence curve over the days the protocol has run with
//              no token: young listings are unproven (0.60 at day 0, rising
//              to 1.00 by day 90), the prime window runs flat at 1.00 to
//              three years, then fades gently to 0.85 — a protocol that has
//              run four-plus years without issuing has had its chances.
//              Unknown age scores 0.80: neither rewarded nor punished.
//
// Bands name the momentum in plain words: BREAKOUT (>= 25% a week),
// HEATING (10–25%), STEADY (0–10%), COOLING (-10–0%), FADING (< -10%).
// No protocol name is ever special-cased: the same function scores every
// row, and the dashboard's sandbox recomputes every row from these same
// constants, so a reader can check the model instead of trusting it.

/** One protocol of the sealed snapshot: exactly its ten fields. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox varies them. */
export interface ModelConstants {
  base_multiple: number;
  scale_curve: number;
  scale_anchor_usd: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  breakout_kick: number;
  breakout_at: number;
  momentum_floor: number;
  runway_young_days: number;
  runway_young_floor: number;
  runway_prime_days: number;
  runway_old_floor: number;
  runway_old_span_days: number;
  unknown_age_runway: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.22,
  scale_curve: -0.08,
  scale_anchor_usd: 1_000_000_000,
  growth_weight: 0.008,
  growth_floor: -80,
  growth_cap: 200,
  breakout_kick: 0.009,
  breakout_at: 10,
  momentum_floor: 0.2,
  runway_young_days: 90,
  runway_young_floor: 0.6,
  runway_prime_days: 1095,
  runway_old_floor: 0.85,
  runway_old_span_days: 7300,
  unknown_age_runway: 0.8,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'momentum-breakout-8';

/** How many pre-token protocols below the watchlist floor the breakout radar carries. */
export const EARLY_ROWS = 200;

/** How many live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
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
  band: string;
  implied_value_usd: number;
  model: {
    base_usd: number;
    growth_pct: number;
    momentum_multiplier: number;
    breakout_kick: number;
    runway_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the farm plan beside it. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  band: string;
  implied_value_usd: number;
  base_usd: number;
  momentum_multiplier: number;
  breakout_kick: number;
  runway_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  breakout_size: number;
  watchlist: string[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The momentum band a weekly change falls in. */
export function momentumBand(growthPct: number): string {
  if (growthPct >= 25) return 'BREAKOUT';
  if (growthPct >= 10) return 'HEATING';
  if (growthPct >= 0) return 'STEADY';
  if (growthPct >= -10) return 'COOLING';
  return 'FADING';
}

/** The runway multiplier for an age in days (null: unknown age). */
export function runwayMultiplier(age: number | null, model: ModelConstants): number {
  if (age === null) return model.unknown_age_runway;
  if (age < model.runway_young_days) {
    return model.runway_young_floor + (1 - model.runway_young_floor) * (age / model.runway_young_days);
  }
  if (age <= model.runway_prime_days) return 1;
  const past = age - model.runway_prime_days;
  return Math.max(model.runway_old_floor, 1 - (1 - model.runway_old_floor) * (past / model.runway_old_span_days));
}

/** The full breakdown of one protocol's implied value under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; base: number; growthPct: number; momentum: number; kick: number; runway: number; age: number | null; band: string } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const kick = Math.max(0, growthPct - model.breakout_at) * model.breakout_kick;
  const momentum = Math.max(model.momentum_floor, 1 + model.growth_weight * growthPct + kick);
  const runway = runwayMultiplier(age, model);
  const scale = Math.pow(protocol.tvl_usd / model.scale_anchor_usd, model.scale_curve);
  const base = protocol.tvl_usd * model.base_multiple * scale;
  const implied = Math.max(1, Math.round(base * momentum * runway));
  return { implied, base: Math.round(base), growthPct, momentum, kick, runway, age, band: momentumBand(growthPct) };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked, whatever its momentum.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The breakout radar: rankable pre-token protocols below the floor, scored
  // by implied value and taken strongest first — a small protocol compounding
  // week over week can outrank a large flat one. Never a replacement for a
  // watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, score: impliedValue(p, snapshot.as_of, model).implied }))
    .sort((a, b) => b.score - a.score || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    band: s.v.band,
    implied_value_usd: s.v.implied,
    model: {
      base_usd: s.v.base,
      growth_pct: s.v.growthPct,
      momentum_multiplier: round4(s.v.momentum),
      breakout_kick: round4(s.v.kick),
      runway_multiplier: round4(s.v.runway),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age, s.v.band).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and re-check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC on ${name} (${chain}) and leave the supply position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and leave the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC into ${chain} through ${name}, then put the bridged funds to work in its app.`;
  if (c.includes('stak') || c.includes('restak')) return `Stake $${capital} of the chain asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one position in a ${name} market.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy live.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and leave the position open.`;
}

/** The momentum line: what the band means for how to farm it this week. */
function momentumLine(band: string, capital: number): string {
  if (band === 'BREAKOUT') return `Capital is arriving fast: open the $${capital} position this week, while the 7-day growth is still compounding, and add only while the weekly change stays above 10%.`;
  if (band === 'HEATING') return `Growth is warming up: open the $${capital} position now and check the weekly change each Monday before adding more.`;
  if (band === 'STEADY') return `Growth is flat: open the $${capital} position, but add more only if the weekly change turns positive for two weeks running.`;
  if (band === 'COOLING') return `TVL is cooling: open a smaller first position, half the usual size, and wait for the weekly change to turn before adding the rest.`;
  return `TVL is falling: do not chase it — open a minimum-size test position only, and add nothing until the weekly change is positive again.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age, momentum band), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, band: string): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Set up a fresh wallet holding only the funds you plan to farm, and store its seed phrase offline where nobody else can reach it.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: momentumLine(band, capital),
      cost: 'no extra capital beyond the position',
      time: '10 minutes a week to check',
    },
    {
      text: `Do one qualifying action each week — a deposit, a borrow, a swap or a vote — so the wallet shows steady use.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days so the activity lands in more than one snapshot of the protocol.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes — never from a link in a chat or a search ad.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    band: row.band,
    implied_value_usd: row.implied_value_usd,
    base_usd: row.model.base_usd,
    momentum_multiplier: row.model.momentum_multiplier,
    breakout_kick: row.model.breakout_kick,
    runway_multiplier: row.model.runway_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const breakout = board.filter((r) => r.band === 'BREAKOUT' || r.band === 'HEATING').length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    breakout_size: breakout,
    watchlist: snapshot.watchlist,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
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
      slug: p.slug,
      name: p.name,
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
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
