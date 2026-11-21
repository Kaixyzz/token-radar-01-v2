// Firstlight Radar — the launch-value model for token-radar-01.
//
// The board answers one question: if a protocol's record stayed as it is, what
// would its token launch be worth, and what should a reader do to farm it?
// The value is built only from the snapshot's own figures — TVL, seven-day
// growth, how long the protocol has run, and how many chains it reaches.
// No list of names is hardcoded anywhere; the same formula scores all 758.
//
//   implied = tvl_usd x 0.22 x growth x seasoning x breadth
//     growth    = 1 + clamp(change_7d, -40, +80) / 100   (no 7-day figure: 1.00)
//     seasoning = 0.85 + 0.30 x min(age_days, 730) / 730  (no listing date: 365 days)
//     breadth   = 1 + 0.03 x min(chains - 1, 5)
//
// A protocol that records a token gets its raw value cut by a post-launch
// discount and then scaled so every live row sits below the lowest pre-token
// row: on a launch radar a launch that already happened cannot outrank one
// that has not. Live rows are kept on the board, clearly marked, for contrast.
//
// Not every pre-token protocol is a launch candidate. The board ranks only
// launch candidates, by the same rule the snapshot's own watchlist uses: no
// centralised exchange, no bridge, no liquid-staking or restaking product,
// no wrapped or staked product of a token that already trades, no name that
// begins with an exchange's name, and no versioned copy (a name ending in
// V2, v2, 2.0 or the like). A wrapped or staked product is not a token that
// does not exist yet, and an exchange's own product is not a protocol still
// waiting on a launch of its own. The watchlist's 40 all pass this rule, so
// coverage is untouched.
//
// "Records no token" means the record carries neither a CoinGecko id nor a
// symbol. That is a record, not proof the protocol has none.

export interface Protocol {
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
  protocols: Protocol[];
  watchlist: string[];
}

export interface Breakdown {
  base_usd: number;
  growth_factor: number;
  seasoning_factor: number;
  breadth_factor: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  token_status: 'pre-token' | 'token-live';
  watchlist: boolean;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  breakdown: Breakdown;
  farm_steps: string[];
}

export interface RadarMeta {
  title: string;
  as_of: string;
  floor_usd: number;
  protocols_scanned: number;
  watchlist_size: number;
  board_rows: number;
  pre_token_rows: number;
  live_rows: number;
  model: string;
}

export interface Radar {
  meta: RadarMeta;
  rows: BoardRow[];
}

const BASE_MULTIPLE = 0.22;
const LIVE_DISCOUNT = 0.1;
const LIVE_CEILING = 0.9;
const LIVE_ROWS = 20;
const DAY_MS = 86_400_000;

/** Categories that are not a launch of their own (the watchlist's own rule). */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;

/**
 * A launch candidate: not an exchange, a bridge, a staking product or a
 * wrapped/staked product of a token that already trades, and not a versioned
 * copy. The snapshot's watchlist is built from this same rule.
 */
export function isLaunchCandidate(p: Protocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  return true;
}

/** The snapshot as the kit ships it, checked just enough to fail loudly. */
export function parseSnapshot(text: string): Snapshot {
  const data = JSON.parse(text) as Snapshot;
  if (!data || typeof data !== 'object') throw new Error('snapshot: not an object');
  if (typeof data.as_of !== 'string' || typeof data.floor_usd !== 'number') {
    throw new Error('snapshot: missing as_of or floor_usd');
  }
  if (!Array.isArray(data.protocols) || !Array.isArray(data.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  for (const p of data.protocols) {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Array.isArray(p.chains)) {
      throw new Error('snapshot: a protocol is missing slug, name, tvl_usd or chains');
    }
  }
  return data;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function parseDay(s: string): number {
  const parts = s.split('-').map((v) => Number(v));
  return Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!);
}

/** Whole days from the listing day to the snapshot day; null when unreported. */
function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const days = Math.round((parseDay(asOf) - parseDay(listedAt)) / DAY_MS);
  return days < 0 ? 0 : days;
}

/** True when the record names a token (a CoinGecko id or a symbol). */
export function recordsToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

function growthFactor(change7d: number | null): number {
  if (change7d === null) return 1;
  return Math.round((1 + clamp(change7d, -40, 80) / 100) * 10_000) / 10_000;
}

function seasoningFactor(age: number | null): number {
  const days = age === null ? 365 : age;
  return Math.round((0.85 + (0.3 * Math.min(days, 730)) / 730) * 10_000) / 10_000;
}

function breadthFactor(chains: string[]): number {
  return Math.round((1 + 0.03 * Math.min(Math.max(chains.length - 1, 0), 5)) * 10_000) / 10_000;
}

interface Scored {
  p: Protocol;
  raw: number;
  breakdown: Breakdown;
  age: number | null;
}

function score(p: Protocol, asOf: string): Scored {
  const base = p.tvl_usd * BASE_MULTIPLE;
  const growth = growthFactor(p.change_7d);
  const age = ageDays(p.listed_at, asOf);
  const seasoning = seasoningFactor(age);
  const breadth = breadthFactor(p.chains);
  return {
    p,
    raw: base * growth * seasoning * breadth,
    breakdown: {
      base_usd: Math.round(base),
      growth_factor: growth,
      seasoning_factor: seasoning,
      breadth_factor: breadth,
    },
    age,
  };
}

function chain0(p: Protocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category-specific step: what the protocol is actually for, in one move. */
function categoryStep(p: Protocol): string {
  const chain = chain0(p);
  const name = p.name;
  switch (p.category) {
    case 'Dexs':
      return `On ${name}, swap a small amount — $50–$200 — between two assets on ${chain}, then add the same pair to a liquidity pool if one is open; each swap takes about 5 minutes and costs a few dollars in gas.`;
    case 'Lending':
      return `Supply $100–$300 of a major asset to ${name} on ${chain} as collateral, then borrow a small amount — under 40% of the collateral — to show both sides of the market; setup takes about 15 minutes.`;
    case 'Yield':
    case 'Yield Aggregator':
      return `Deposit $100–$300 into a ${name} vault or yield strategy on ${chain} and leave it compounding; the deposit takes about 10 minutes and a few dollars in gas.`;
    case 'Derivatives':
      return `Open a small $50–$150 position on a ${name} market on ${chain} with low leverage — 2x or less — and set a stop so the position closes on your terms; allow 15 minutes to place it.`;
    case 'RWA':
      return `Buy or mint $100–$250 of ${name}'s tokenised real-world asset on ${chain} and hold it in your wallet for at least 3–4 weeks; the purchase takes about 10 minutes plus gas.`;
    case 'Bridge':
    case 'Cross Chain Bridge':
    case 'Canonical Bridge':
      return `Bridge $50–$200 of a major asset into or out of ${chain} through ${name}, then bridge a smaller amount back a few days later; each crossing takes 5–20 minutes and costs a few dollars.`;
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Restaking':
    case 'Restaked BTC':
    case 'Staking Pool':
      return `Stake $100–$300 of the supported asset through ${name} on ${chain} and keep the liquid receipt in your wallet; staking takes about 10 minutes and a few dollars in gas.`;
    case 'CDP':
    case 'CDP Manager':
      return `Lock $150–$300 of collateral in ${name} on ${chain} and mint a modest amount of its stable asset — under 40% of the collateral value — then repay a little each week; setup takes about 15 minutes.`;
    case 'Leveraged Farming':
      return `Open a $100–$200 leveraged farming position on ${name} at 2x or less on ${chain}, check it weekly, and close it before the position ages past 6–8 weeks; setup takes about 15 minutes.`;
    case 'CEX':
      return `If you do not have one, open an account on ${name}, finish whatever verification it asks for, then trade $100–$250 of spot volume in ${chain} pairs across 2–3 weeks; the first trade takes about 15 minutes plus the exchange's fees.`;
    case 'Risk Curators':
      return `Deposit $100–$250 into a curated vault on ${name} on ${chain} and leave it allocated for 3–4 weeks; the deposit takes about 10 minutes and a few dollars in gas.`;
    case 'Onchain Capital Allocator':
      return `Allocate $100–$300 through ${name} on ${chain} into one of its strategies and keep the position open for at least a month; setup takes about 15 minutes plus gas.`;
    case 'Basis Trading':
      return `Open a $100–$200 basis position through ${name} on ${chain}, keep it delta-neutral, and hold it for 2–4 weeks while funding accrues; setup takes about 15 minutes.`;
    case 'Chain':
      return `Bridge $50–$150 of a major asset onto the ${name} chain and use one of its native apps for a week — a swap or a deposit — so the address is active on the chain; the first steps take about 20 minutes.`;
    case 'Payments':
      return `Pay or receive $50–$150 through ${name} on ${chain} for a real purchase or transfer, then repeat once a week for a month; each payment takes a few minutes plus network fees.`;
    case 'Prediction Market':
      return `Place $20–$100 across two or three markets on ${name} on ${chain} and let them resolve over 1–3 weeks; each position takes about 5 minutes to open.`;
    case 'Insurance':
      return `Buy $50–$150 of cover from ${name} on ${chain} for a protocol you already use, and keep it active for at least a month; the purchase takes about 10 minutes plus gas.`;
    case 'Options Vault':
      return `Deposit $100–$200 into an options vault on ${name} on ${chain} and leave it through one full weekly cycle; the deposit takes about 10 minutes plus gas.`;
    case 'Farm':
      return `Deposit $100–$250 into a farm on ${name} on ${chain} and harvest or compound the rewards weekly for a month; setup takes about 10 minutes plus gas.`;
    case 'Indexes':
      return `Buy $100–$250 of the ${name} index on ${chain} and hold it for at least a month; the purchase takes about 10 minutes plus gas.`;
    case 'Privacy':
      return `Make a $50–$150 private transfer or deposit through ${name} on ${chain}, then a second one a week later; each takes a few minutes plus gas.`;
    case 'Liquidity Manager':
      return `Deposit $100–$300 into a managed liquidity position on ${name} on ${chain} and leave it rebalancing for 3–4 weeks; setup takes about 10 minutes plus gas.`;
    case 'Interest Rate Derivatives':
      return `Open a $100–$200 fixed-rate position on ${name} on ${chain} for a 1–3 month term and hold it to maturity; setup takes about 15 minutes.`;
    case 'Collateral Markets':
      return `Supply $100–$300 of collateral to a market on ${name} on ${chain} and borrow under 40% against it; setup takes about 15 minutes.`;
    default:
      return `Use ${name}'s core feature on ${chain} with $100–$250 — the main action the protocol is built for — and complete it end to end at least once; the first run takes about 15 minutes plus a few dollars in gas.`;
  }
}

/** Five concrete steps: setup, the core move, a weekly habit, a second feature, the watch. */
export function farmSteps(p: Protocol, live: boolean): string[] {
  const chain = chain0(p);
  return [
    `Create or open a self-custody wallet that supports ${chain}, then fund it with enough of the native token for gas — about $10–$30 — plus $100–$500 you plan to put to work; the setup takes about 20–30 minutes.`,
    categoryStep(p),
    `Return at least once a week for 4–8 weeks and repeat the core action with a small amount each time — $25–$100 per visit, about 10 minutes — so your address builds a steady history instead of one single spike.`,
    `Try a second feature of ${p.name} beyond the first one — a different pool, vault or market on ${chain} — with $50–$200, and leave it running for at least 2–4 weeks so the position seasons.`,
    live
      ? `Because ${p.name} already records a token, treat this as a live position rather than a launch farm: size it at $50–$200, review it monthly, and do not chase a second launch the record does not promise; the review takes about 10 minutes a month.`
      : `Follow ${p.name}'s official announcements for any token or points update, and never sign a transaction you cannot read; checking takes 5 minutes a week, and only ever use the protocol's own interface.`,
  ];
}

function toRow(s: Scored, value: number, live: boolean, onWatchlist: boolean): BoardRow {
  const p = s.p;
  return {
    slug: p.slug,
    name: p.name,
    rank: 0,
    implied_value_usd: value,
    token_status: live ? 'token-live' : 'pre-token',
    watchlist: onWatchlist,
    category: p.category,
    chains: [...p.chains],
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    age_days: s.age,
    breakdown: s.breakdown,
    farm_steps: farmSteps(p, live),
  };
}

function byValueDesc(a: Scored, b: Scored): number {
  if (b.raw !== a.raw) return b.raw - a.raw;
  return a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0;
}

function byTvlDesc(a: Scored, b: Scored): number {
  if (b.p.tvl_usd !== a.p.tvl_usd) return b.p.tvl_usd - a.p.tvl_usd;
  return a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0;
}

/**
 * The board: every protocol that records no token, ranked by implied value,
 * then the largest token-live protocols for contrast, scaled below the
 * pre-token floor. Ranks are 1..N, values strictly decrease with rank.
 */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const asOf = snapshot.as_of;
  const watch = new Set(snapshot.watchlist);
  const pre = snapshot.protocols.filter((p) => !recordsToken(p) && isLaunchCandidate(p)).map((p) => score(p, asOf));
  const live = snapshot.protocols.filter((p) => recordsToken(p) && isLaunchCandidate(p)).map((p) => score(p, asOf));
  pre.sort(byValueDesc);
  live.sort(byTvlDesc);

  const preRows: BoardRow[] = [];
  let prev = Number.POSITIVE_INFINITY;
  for (const s of pre) {
    let v = Math.max(1, Math.round(s.raw));
    if (v >= prev) v = prev - 1;
    if (v < 1) v = 1;
    prev = v;
    preRows.push(toRow(s, v, false, watch.has(s.p.slug)));
  }
  const floor = prev;

  const topLive = live.slice(0, LIVE_ROWS);
  const maxLiveRaw = topLive.reduce((m, s) => Math.max(m, s.raw * LIVE_DISCOUNT), 0);
  const scale = maxLiveRaw > 0 ? (LIVE_CEILING * floor) / maxLiveRaw : 0;
  const liveRows: BoardRow[] = [];
  prev = floor;
  for (const s of topLive) {
    let v = Math.max(1, Math.round(s.raw * LIVE_DISCOUNT * scale));
    if (v >= prev) v = prev - 1;
    if (v < 1) v = 1;
    prev = v;
    liveRows.push(toRow(s, v, true, false));
  }

  const board = [...preRows, ...liveRows];
  board.forEach((row, i) => {
    row.rank = i + 1;
  });
  const radar: Radar = {
    meta: {
      title: 'Firstlight Radar',
      as_of: snapshot.as_of,
      floor_usd: snapshot.floor_usd,
      protocols_scanned: snapshot.protocols.length,
      watchlist_size: snapshot.watchlist.length,
      board_rows: board.length,
      pre_token_rows: preRows.length,
      live_rows: liveRows.length,
      model: 'implied = tvl_usd x 0.22 x growth x seasoning x breadth; live rows at a post-launch discount below the pre-token floor',
    },
    rows: board,
  };
  return { board, radar };
}

/** The gate's own shape, checked before anything is written. Null means valid. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, not 100 to 4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const row of board) {
    if (!slugs.has(row.slug)) return `board names ${row.slug}, which the snapshot does not list`;
    if (seen.has(row.slug)) return `board names ${row.slug} twice`;
    seen.add(row.slug);
  }
  const ranks = [...board.map((r) => r.rank)].sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `ranks are not exactly 1 to ${board.length}`;
  }
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  let allEqual = true;
  for (let i = 0; i < byRank.length; i++) {
    const v = byRank[i]!.implied_value_usd;
    if (!Number.isInteger(v) || v <= 0) return `row ${byRank[i]!.slug} has implied value ${v}, not a positive whole number`;
    if (i > 0) {
      if (v > byRank[i - 1]!.implied_value_usd) return `implied value rises from rank ${i} to rank ${i + 1}`;
      if (v !== byRank[i - 1]!.implied_value_usd) allEqual = false;
    }
  }
  if (allEqual) return 'every implied value is the same: the board ranks nothing';
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol ${slug} is missing from the board`;
  }
  for (const row of board) {
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps.length} farm steps, not 3 to 12`;
    }
    for (const step of row.farm_steps) {
      const n = step.trim().length;
      if (n < 20 || n > 600) return `row ${row.slug} has a farm step of ${n} characters, not 20 to 600`;
    }
  }
  return null;
}

/** The dashboard's data, as one script the page reads: window.FIRSTLIGHT. */
export function dataScript(radar: Radar): string {
  return `window.FIRSTLIGHT = ${JSON.stringify(radar)};\n`;
}
