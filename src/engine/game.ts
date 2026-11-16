// The game engine: pure, deterministic (seeded), JSON-serialisable state. No I/O, no timers.
// The server calls `advance` when a deadline passes and forwards player actions.
import { BASE_PRICES, CONFIG, contractSchedule, sanitizeSettings, type Good, type Settings } from './config';
import { dealClues, generateEvents } from './events';
import { Rng } from './rng';
import {
  bundleIsEmpty,
  checkTradeBand,
  emptyInventory,
  eventEffectOn,
  footprintOf,
  inventoryValue,
  nextPrice,
  resolveOrders,
  sanitizeOrders,
  totalUnits,
} from './prices';
import {
  GameError,
  type AuctionResult,
  type Bundle,
  type ClaimEval,
  type Contract,
  type Direction,
  type FinalResult,
  type GameState,
  type PlayerRoundResult,
  type PlayerState,
  type RevealStepKind,
  type RoundResult,
  type RoundState,
  type Title,
  type TradeOffer,
} from './types';

export { GameError };

export interface MatchPlayer {
  id: string;
  nickname: string;
  isBot: boolean;
}

export interface MatchOptions {
  seed: number;
  settings: Settings;
  players: MatchPlayer[];
  matchNumber?: number;
}

// ------------------------------------------------------------------ helpers

function withRng<T>(s: GameState, fn: (rng: Rng) => T): T {
  const rng = new Rng(s.rng);
  const out = fn(rng);
  s.rng = rng.state;
  return out;
}

function nid(s: GameState, prefix: string): string {
  s.idCounter += 1;
  return `${prefix}${s.idCounter}`;
}

export function currentRound(s: GameState): RoundState {
  const r = s.rounds[s.round - 1];
  if (!r) throw new GameError('no-round');
  return r;
}

export function getPlayer(s: GameState, id: string): PlayerState {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new GameError('no-player');
  return p;
}

export function humans(s: GameState): PlayerState[] {
  return s.players.filter((p) => !p.isBot);
}

function setDeadline(s: GameState, seconds: number | null, now: number) {
  if (seconds === null) {
    s.deadline = null;
    s.pausedRemainingMs = null;
    return;
  }
  if (s.paused) {
    s.deadline = null;
    s.pausedRemainingMs = seconds * 1000;
  } else {
    s.deadline = now + seconds * 1000;
    s.pausedRemainingMs = null;
  }
}

export function wealth(s: GameState, p: PlayerState, prices = s.prices): number {
  return p.cash + inventoryValue(p.inventory, prices);
}

// ------------------------------------------------------------------ setup

export function createMatch(opts: MatchOptions, now: number): GameState {
  const n = opts.players.length;
  if (n < CONFIG.minPlayers || n > CONFIG.maxPlayers) throw new GameError('player-count');
  const settings = sanitizeSettings(opts.settings);
  const goods = CONFIG.goodsForPlayers(n);
  const prices = { ...BASE_PRICES };
  const s: GameState = {
    version: 1,
    seed: opts.seed >>> 0,
    rng: opts.seed >>> 0,
    matchNumber: opts.matchNumber ?? 1,
    settings,
    goods,
    totalRounds: settings.rounds,
    contractRounds: contractSchedule(settings.rounds),
    round: 0,
    phase: 'info',
    step: 0,
    deadline: null,
    paused: false,
    pausedRemainingMs: null,
    ready: [],
    players: opts.players.map((p, i) => ({
      id: p.id,
      nickname: p.nickname,
      isBot: p.isBot,
      seat: i,
      cash: CONFIG.startCash,
      inventory: emptyInventory(),
    })),
    prices,
    rounds: [],
    final: null,
    idCounter: 0,
  };
  startRound(s, 1, now);
  return s;
}

function startRound(s: GameState, n: number, now: number) {
  const storm = n === s.totalRounds;
  const ids = s.players.map((p) => p.id);
  const { events, deal, announced } = withRng(s, (rng) => {
    const events = generateEvents(rng, n, storm, s.goods);
    const deal = dealClues(rng, n, events, ids, s.goods);
    let announced: Contract | null = null;
    const sched = s.contractRounds.find((c) => c.announce === n);
    if (sched) {
      const good = rng.pick(s.goods);
      announced = {
        id: `k${n}`,
        good,
        quantity: rng.int(CONFIG.contract.quantityMin, CONFIG.contract.quantityMax),
        unitPrice: Math.round(s.prices[good] * (1 + rng.float(CONFIG.contract.premiumMin, CONFIG.contract.premiumMax))),
        announcedRound: n,
        auctionRound: sched.auction,
      };
    }
    return { events, deal, announced };
  });
  const auctionContract =
    s.rounds.map((r) => r.contractAnnounced).find((c) => c && c.auctionRound === n) ?? null;
  const humansBySeat = humans(s).sort((a, b) => a.seat - b.seat);
  const rot = humansBySeat.length ? (n - 1) % humansBySeat.length : 0;
  const speakerOrder = [...humansBySeat.slice(rot), ...humansBySeat.slice(0, rot)].map((p) => p.id);
  const orders: RoundState['orders'] = {};
  for (const p of s.players) orders[p.id] = { orders: {}, bid: null, sealed: false };
  const round: RoundState = {
    n,
    storm,
    events,
    news: deal.news,
    clues: deal.clues,
    contractAnnounced: announced,
    contractAuction: auctionContract,
    speakerOrder,
    speakerIndex: 0,
    claims: [],
    offers: [],
    trades: [],
    cards: [],
    purchases: [],
    orders,
    result: null,
    revealSteps: [],
  };
  s.rounds.push(round);
  s.round = n;
  s.phase = 'info';
  s.step = 0;
  s.ready = [];
  setDeadline(s, CONFIG.infoSeconds, now);
}

// ------------------------------------------------------------------ phase flow

function enterMarket(s: GameState, now: number) {
  s.phase = 'market';
  s.ready = [];
  setDeadline(s, s.settings.marketSeconds, now);
}

function stepSeconds(s: GameState, kind: RevealStepKind, r: RoundState): number {
  switch (kind.kind) {
    case 'claims':
      return Math.min(16, 4 + 3 * r.claims.length);
    case 'prices':
    case 'event':
      return CONFIG.revealStepSeconds;
    case 'footprints':
      return 7;
    case 'trades':
      return 5;
    case 'auction':
      return 9;
    case 'private':
      return 10;
  }
}

/** Move to the next phase / sub-step. Called by timers, ready checks and the host's skip. */
export function advance(s: GameState, now: number): void {
  switch (s.phase) {
    case 'info': {
      const r = currentRound(s);
      if (r.speakerOrder.length === 0) return enterMarket(s, now);
      s.phase = 'tribune';
      r.speakerIndex = 0;
      s.ready = [];
      setDeadline(s, s.settings.tribuneSeconds, now);
      return;
    }
    case 'tribune': {
      const r = currentRound(s);
      if (r.speakerIndex + 1 < r.speakerOrder.length) {
        r.speakerIndex += 1;
        setDeadline(s, s.settings.tribuneSeconds, now);
        return;
      }
      return enterMarket(s, now);
    }
    case 'market': {
      const r = currentRound(s);
      for (const o of r.offers) if (o.status === 'open') o.status = 'cancelled';
      s.phase = 'orders';
      s.ready = [];
      setDeadline(s, s.settings.orderSeconds, now);
      return;
    }
    case 'orders': {
      resolveRound(s);
      s.phase = 'reveal';
      s.step = 0;
      s.ready = [];
      const r = currentRound(s);
      setDeadline(s, stepSeconds(s, r.revealSteps[0], r), now);
      return;
    }
    case 'reveal': {
      const r = currentRound(s);
      if (s.step + 1 < r.revealSteps.length) {
        s.step += 1;
        setDeadline(s, stepSeconds(s, r.revealSteps[s.step], r), now);
        return;
      }
      if (s.round < s.totalRounds) return startRound(s, s.round + 1, now);
      s.final = computeFinal(s);
      s.phase = 'final';
      s.step = 0;
      setDeadline(s, CONFIG.finalStepSeconds, now);
      return;
    }
    case 'final': {
      const n = s.players.length;
      if (s.step >= n + 2) return;
      s.step += 1;
      if (s.step < n) setDeadline(s, CONFIG.finalStepSeconds, now);
      else if (s.step === n) setDeadline(s, 150, now); // recap: host continues, or auto after 2.5 min
      else if (s.step === n + 1) setDeadline(s, 14, now); // titles
      else setDeadline(s, null, now);
      return;
    }
  }
}

export function finalStepNames(s: GameState): { rank: number; recap: number; titles: number; again: number } {
  const n = s.players.length;
  return { rank: n, recap: n, titles: n + 1, again: n + 2 };
}

export function pause(s: GameState, now: number) {
  if (s.paused) return;
  s.paused = true;
  if (s.deadline !== null) {
    s.pausedRemainingMs = Math.max(0, s.deadline - now);
    s.deadline = null;
  }
}

export function resume(s: GameState, now: number) {
  if (!s.paused) return;
  s.paused = false;
  if (s.pausedRemainingMs !== null) {
    s.deadline = now + s.pausedRemainingMs;
    s.pausedRemainingMs = null;
  }
}

/** Mark ready; ends the phase early when all humans are ready. Returns true if the phase advanced. */
export function setReady(s: GameState, pid: string, now: number): boolean {
  getPlayer(s, pid);
  if (s.phase !== 'info' && s.phase !== 'market' && s.phase !== 'orders') throw new GameError('not-ready-phase');
  if (!s.ready.includes(pid)) s.ready.push(pid);
  return maybeAdvanceOnReady(s, now);
}

function maybeAdvanceOnReady(s: GameState, now: number): boolean {
  const hs = humans(s);
  if (hs.length && hs.every((h) => s.ready.includes(h.id)) && !s.paused) {
    advance(s, now);
    return true;
  }
  return false;
}

export function endTurn(s: GameState, pid: string, now: number) {
  if (s.phase !== 'tribune') throw new GameError('not-tribune');
  const r = currentRound(s);
  if (r.speakerOrder[r.speakerIndex] !== pid) throw new GameError('not-your-turn');
  advance(s, now);
}

// ------------------------------------------------------------------ player actions

export function registerClaim(s: GameState, pid: string, good: Good, direction: Direction) {
  getPlayer(s, pid);
  if (s.phase !== 'tribune' && s.phase !== 'market') throw new GameError('claims-closed');
  if (!s.goods.includes(good)) throw new GameError('bad-good');
  if (direction !== 'up' && direction !== 'down') throw new GameError('bad-direction');
  const r = currentRound(s);
  const mine = r.claims.filter((c) => c.playerId === pid);
  if (mine.length >= CONFIG.maxClaimsPerRound) throw new GameError('too-many-claims');
  if (mine.some((c) => c.good === good)) throw new GameError('duplicate-claim');
  r.claims.push({ id: nid(s, 'cl'), playerId: pid, good, direction, phase: s.phase });
}

export function capacityOf(s: GameState): number {
  return s.settings.warehouseCapacity ?? CONFIG.warehouseCapacity;
}

function normBundle(b: unknown, goods: Good[], cap: number): Bundle {
  const out: Bundle = { goods: {}, coins: 0 };
  const src = (b ?? {}) as Partial<Bundle>;
  if (typeof src.coins === 'number' && Number.isFinite(src.coins)) out.coins = Math.max(0, Math.trunc(src.coins));
  for (const g of goods) {
    const q = src.goods?.[g];
    if (typeof q === 'number' && Number.isFinite(q) && Math.trunc(q) > 0) out.goods[g] = Math.min(Math.trunc(q), cap);
  }
  return out;
}

function ensureTradeOpen(s: GameState) {
  if (s.phase !== 'market') throw new GameError('market-closed');
  if (s.round < 2) throw new GameError('locked');
}

function canHold(p: PlayerState, give: Bundle, receive: Bundle, cap: number): boolean {
  return totalUnits(p.inventory) - totalUnits(give.goods) + totalUnits(receive.goods) <= cap;
}

function hasAssets(p: PlayerState, b: Bundle): boolean {
  if (p.cash < b.coins) return false;
  for (const g of Object.keys(b.goods) as Good[]) if ((p.inventory[g] ?? 0) < (b.goods[g] ?? 0)) return false;
  return true;
}

export function proposeTrade(s: GameState, from: string, to: string, give: unknown, receive: unknown): TradeOffer {
  ensureTradeOpen(s);
  const a = getPlayer(s, from);
  const b = getPlayer(s, to);
  if (a.id === b.id) throw new GameError('self-trade');
  const g = normBundle(give, s.goods, capacityOf(s));
  const rcv = normBundle(receive, s.goods, capacityOf(s));
  if (bundleIsEmpty(g) || bundleIsEmpty(rcv)) throw new GameError('empty-offer');
  const band = checkTradeBand(g, rcv, s.prices);
  if (!band.ok) throw new GameError(band.reason === 'band' ? 'trade-band' : 'bad-offer');
  if (!hasAssets(a, g)) throw new GameError('not-enough-assets');
  const r = currentRound(s);
  if (r.offers.filter((o) => o.from === from && o.status === 'open').length >= 6) throw new GameError('too-many-offers');
  const offer: TradeOffer = { id: nid(s, 'of'), from, to, give: g, receive: rcv, status: 'open' };
  r.offers.push(offer);
  return offer;
}

export function respondTrade(s: GameState, pid: string, offerId: string, accept: boolean) {
  ensureTradeOpen(s);
  const r = currentRound(s);
  const offer = r.offers.find((o) => o.id === offerId);
  if (!offer || offer.status !== 'open') throw new GameError('no-offer');
  if (offer.to !== pid) throw new GameError('not-your-offer');
  if (!accept) {
    offer.status = 'declined';
    return;
  }
  const a = getPlayer(s, offer.from);
  const b = getPlayer(s, offer.to);
  // validate everything first → atomic
  if (!hasAssets(a, offer.give) || !hasAssets(b, offer.receive)) {
    offer.status = 'cancelled';
    throw new GameError('not-enough-assets');
  }
  if (!canHold(a, offer.give, offer.receive, capacityOf(s)) || !canHold(b, offer.receive, offer.give, capacityOf(s))) throw new GameError('warehouse-full');
  if (!checkTradeBand(offer.give, offer.receive, s.prices).ok) throw new GameError('trade-band');
  a.cash += offer.receive.coins - offer.give.coins;
  b.cash += offer.give.coins - offer.receive.coins;
  for (const g of s.goods) {
    const out = offer.give.goods[g] ?? 0;
    const inn = offer.receive.goods[g] ?? 0;
    a.inventory[g] += inn - out;
    b.inventory[g] += out - inn;
  }
  offer.status = 'accepted';
  r.trades.push({ id: nid(s, 'tr'), from: a.id, to: b.id, give: offer.give, receive: offer.receive });
}

export function cancelTrade(s: GameState, pid: string, offerId: string) {
  const r = currentRound(s);
  const offer = r.offers.find((o) => o.id === offerId);
  if (!offer || offer.status !== 'open') throw new GameError('no-offer');
  if (offer.from !== pid) throw new GameError('not-your-offer');
  offer.status = 'cancelled';
}

export function listClueCard(s: GameState, pid: string, price: number) {
  ensureTradeOpen(s);
  getPlayer(s, pid);
  const r = currentRound(s);
  if (typeof price !== 'number' || !Number.isFinite(price)) throw new GameError('bad-price');
  const p = Math.trunc(price);
  if (p < 1 || p > CONFIG.clueCardMaxPrice) throw new GameError('bad-price');
  const clue = r.clues[pid];
  const existing = r.cards.find((c) => c.sellerId === pid);
  if (existing) {
    existing.price = p;
    return;
  }
  r.cards.push({ sellerId: pid, price: p, clueId: clue.id, buyers: [] });
}

export function unlistClueCard(s: GameState, pid: string) {
  ensureTradeOpen(s);
  const r = currentRound(s);
  r.cards = r.cards.filter((c) => c.sellerId !== pid || c.buyers.length > 0);
  // a card that has sold stays listed, but can no longer be repriced upwards by accident
}

export function buyClueCard(s: GameState, buyerId: string, sellerId: string) {
  ensureTradeOpen(s);
  const buyer = getPlayer(s, buyerId);
  const seller = getPlayer(s, sellerId);
  if (buyer.id === seller.id) throw new GameError('own-card');
  const r = currentRound(s);
  const card = r.cards.find((c) => c.sellerId === sellerId);
  if (!card) throw new GameError('no-card');
  if (card.buyers.includes(buyerId)) throw new GameError('already-bought');
  if (buyer.cash < card.price) throw new GameError('not-enough-cash');
  buyer.cash -= card.price;
  seller.cash += card.price;
  card.buyers.push(buyerId);
  // The buyer always receives the seller's TRUE clue.
  r.purchases.push({ id: nid(s, 'pu'), buyerId, sellerId, price: card.price, clue: { ...r.clues[sellerId] } });
}

export function setOrders(
  s: GameState,
  pid: string,
  input: { orders?: Partial<Record<Good, number>>; bid?: number | null },
  seal: boolean,
  now: number,
) {
  if (s.phase !== 'orders') throw new GameError('orders-closed');
  const p = getPlayer(s, pid);
  const r = currentRound(s);
  const po = r.orders[pid];
  if (po.sealed) throw new GameError('sealed');
  po.orders = sanitizeOrders(input.orders, p.inventory, s.goods, capacityOf(s));
  if (r.contractAuction) {
    const raw = input.bid;
    if (raw === null || raw === undefined || raw === 0) po.bid = null;
    else {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new GameError('bad-bid');
      const bid = Math.trunc(raw);
      if (bid < 1) throw new GameError('bad-bid');
      if (bid > p.cash) throw new GameError('bid-too-high');
      po.bid = bid;
    }
  } else po.bid = null;
  if (seal) {
    po.sealed = true;
    if (!s.ready.includes(pid)) s.ready.push(pid);
    maybeAdvanceOnReady(s, now);
  }
}

/** A human leaves/is kicked mid-game: a bot takes the seat so the game stays consistent. */
export function convertToBot(s: GameState, pid: string) {
  const p = getPlayer(s, pid);
  p.isBot = true;
  const r = s.rounds[s.round - 1];
  if (r) {
    const wasIdx = r.speakerOrder.indexOf(pid);
    if (wasIdx >= 0 && s.phase !== 'tribune') r.speakerOrder.splice(wasIdx, 1);
  }
}

// ------------------------------------------------------------------ resolution

function pickWinner(s: GameState, r: RoundState): { winnerId: string | null; amount: number; tie: boolean; bids: { playerId: string; amount: number }[] } {
  const bids = s.players
    .map((p) => ({ playerId: p.id, amount: r.orders[p.id]?.bid ?? 0, cash: p.cash }))
    .filter((b) => b.amount >= 1 && b.amount <= b.cash)
    .map((b) => ({ playerId: b.playerId, amount: b.amount }))
    .sort((a, b) => b.amount - a.amount);
  if (!bids.length) return { winnerId: null, amount: 0, tie: false, bids };
  const top = bids.filter((b) => b.amount === bids[0].amount);
  const winner = top.length === 1 ? top[0] : withRng(s, (rng) => rng.pick(top));
  return { winnerId: winner.playerId, amount: winner.amount, tie: top.length > 1, bids };
}

function resolveRound(s: GameState) {
  const r = currentRound(s);
  const goods = s.goods;
  const startPrices = { ...s.prices };
  const cashBefore: Record<string, number> = {};
  const invBefore: Record<string, Record<Good, number>> = {};
  const wealthBefore: Record<string, number> = {};
  for (const p of s.players) {
    cashBefore[p.id] = p.cash;
    invBefore[p.id] = { ...p.inventory };
    wealthBefore[p.id] = wealth(s, p, startPrices);
  }

  // auction winner (only the winner's bid is reserved from spendable cash)
  let auction: AuctionResult | null = null;
  const reserve: Record<string, number> = {};
  let winnerInfo: ReturnType<typeof pickWinner> | null = null;
  if (r.contractAuction) {
    winnerInfo = pickWinner(s, r);
    if (winnerInfo.winnerId) reserve[winnerInfo.winnerId] = winnerInfo.amount;
  }

  const out = resolveOrders(
    s.players.map((p) => ({ id: p.id, cash: p.cash, inventory: p.inventory })),
    r.orders,
    startPrices,
    goods,
    reserve,
    capacityOf(s),
  );

  const lines: Record<string, PlayerRoundResult['lines']> = {};
  const footprints: RoundResult['footprints'] = {};
  for (const p of s.players) {
    lines[p.id] = [];
    footprints[p.id] = { wheat: 'none', fuel: 'none', iron: 'none', medicine: 'none', chips: 'none' };
    for (const g of goods) {
      const ex = out.executed[p.id][g] ?? 0;
      const req = out.requested[p.id][g] ?? 0;
      const raw = r.orders[p.id]?.orders[g] ?? 0;
      if (ex === 0 && req === 0 && raw === 0) continue;
      lines[p.id].push({ good: g, requested: raw, executed: ex, unitPrice: out.execPrices[g] });
      p.cash -= ex * out.execPrices[g];
      p.inventory[g] += ex;
      footprints[p.id][g] = footprintOf(ex);
    }
  }

  // auction settlement
  const auctionDelta: Record<string, number> = {};
  if (r.contractAuction && winnerInfo) {
    const c = r.contractAuction;
    let delivered = false;
    let payout = 0;
    if (winnerInfo.winnerId) {
      const w = getPlayer(s, winnerInfo.winnerId);
      w.cash -= winnerInfo.amount; // the bid is paid regardless of delivery
      if (w.inventory[c.good] >= c.quantity) {
        w.inventory[c.good] -= c.quantity;
        payout = c.quantity * c.unitPrice;
        w.cash += payout;
        delivered = true;
      }
      auctionDelta[w.id] = payout - winnerInfo.amount;
    }
    auction = {
      contract: c,
      bids: winnerInfo.bids,
      winnerId: winnerInfo.winnerId,
      winningBid: winnerInfo.amount,
      tie: winnerInfo.tie,
      delivered,
      payout,
    };
  }

  // next prices
  const nextPrices = { ...s.prices };
  for (const g of goods) nextPrices[g] = nextPrice(g, startPrices[g], out.execPrices[g], eventEffectOn(r.events, g));

  // claim evaluation
  const claimEvals: ClaimEval[] = r.claims.map((c) => {
    const evs = r.events.filter((e) => e.target === c.good);
    const matched = evs.filter((e) => e.direction === c.direction).length;
    const contradicted = evs.length - matched;
    const net: ClaimEval['net'] = !evs.length
      ? 'noEvent'
      : matched && contradicted
        ? (evs.reduce((sum, e) => sum + e.effect, 0) * (c.direction === 'up' ? 1 : -1) > 0 ? 'true' : evs.reduce((sum, e) => sum + e.effect, 0) === 0 ? 'mixed' : 'false')
        : matched
          ? 'true'
          : 'false';
    const fp = footprints[c.playerId][c.good];
    return {
      claimId: c.id,
      playerId: c.playerId,
      good: c.good,
      direction: c.direction,
      matched,
      contradicted,
      net,
      footprint: fp,
      footprintConflict: (c.direction === 'up' && fp === 'sell') || (c.direction === 'down' && fp === 'buy'),
    };
  });

  s.prices = nextPrices;
  const players: RoundResult['players'] = {};
  for (const p of s.players) {
    players[p.id] = {
      lines: lines[p.id],
      cashBefore: cashBefore[p.id],
      cashAfter: p.cash,
      inventoryBefore: invBefore[p.id],
      inventoryAfter: { ...p.inventory },
      wealthBefore: wealthBefore[p.id],
      wealthAfter: wealth(s, p, nextPrices),
      auctionDelta: auctionDelta[p.id] ?? 0,
    };
  }
  r.result = {
    startPrices,
    netDemand: out.netDemand,
    execPrices: out.execPrices,
    nextPrices,
    footprints,
    claimEvals,
    auction,
    players,
  };
  const steps: RevealStepKind[] = [{ kind: 'prices' }];
  r.events.forEach((_, index) => steps.push({ kind: 'event', index }));
  if (r.claims.length) steps.push({ kind: 'claims' });
  steps.push({ kind: 'footprints' });
  if (r.trades.length) steps.push({ kind: 'trades' });
  if (r.contractAuction) steps.push({ kind: 'auction' });
  steps.push({ kind: 'private' });
  r.revealSteps = steps;
}

// ------------------------------------------------------------------ final

function pickBest(s: GameState, values: Record<string, number>, mode: 'max' | 'min'): { id: string; value: number } | null {
  const ids = Object.keys(values);
  if (!ids.length) return null;
  const best = mode === 'max' ? Math.max(...ids.map((i) => values[i])) : Math.min(...ids.map((i) => values[i]));
  const tied = ids.filter((i) => values[i] === best);
  const id = tied.length === 1 ? tied[0] : withRng(s, (rng) => rng.pick(tied));
  return { id, value: best };
}

export function computeFinal(s: GameState): FinalResult {
  const finalPrices = { ...s.prices };
  const ranked = s.players
    .map((p) => {
      const inv = inventoryValue(p.inventory, finalPrices);
      return { playerId: p.id, cash: p.cash, inventoryValue: inv, total: p.cash + inv, seat: p.seat };
    })
    .sort((a, b) => b.total - a.total || b.cash - a.cash || a.seat - b.seat)
    .map((x, i) => ({ playerId: x.playerId, cash: x.cash, inventoryValue: x.inventoryValue, total: x.total, rank: i + 1 }));

  const ids = s.players.map((p) => p.id);
  const zero = () => Object.fromEntries(ids.map((i) => [i, 0])) as Record<string, number>;
  const honest = zero();
  const bluff = zero();
  const broker = zero();
  const lone = zero();
  const hunter = zero();
  const hunterAny = new Set<string>();
  for (const r of s.rounds) {
    for (const e of r.result?.claimEvals ?? []) {
      if (e.matched > 0) honest[e.playerId] += 1;
      if (e.footprintConflict) bluff[e.playerId] += 1;
    }
    for (const pu of r.purchases) {
      broker[pu.sellerId] += pu.price;
      lone[pu.sellerId] += 1;
      lone[pu.buyerId] += 1;
    }
    for (const t of r.trades) {
      lone[t.from] += 1;
      lone[t.to] += 1;
    }
    const a = r.result?.auction;
    if (a?.winnerId) {
      hunter[a.winnerId] += a.payout - a.winningBid;
      hunterAny.add(a.winnerId);
    }
  }
  const last = s.rounds[s.rounds.length - 1];
  const storm = zero();
  if (last?.result) for (const id of ids) storm[id] = last.result.players[id].wealthAfter - last.result.players[id].wealthBefore;

  const titles: Title[] = [];
  const push = (id: Title['id'], best: { id: string; value: number } | null, min?: number) => {
    if (best && (min === undefined || best.value > min)) titles.push({ id, playerId: best.id, value: best.value });
  };
  push('honest', pickBest(s, honest, 'max'), 0);
  push('bluffMaster', pickBest(s, bluff, 'max'), 0);
  push('infoBroker', pickBest(s, broker, 'max'), 0);
  push('loneWolf', pickBest(s, lone, 'min'));
  push(
    'contractHunter',
    pickBest(s, Object.fromEntries([...hunterAny].map((i) => [i, hunter[i]])), 'max'),
    0,
  );
  push('stormMan', pickBest(s, storm, 'max'));
  return { ranking: ranked, titles, finalPrices };
}

/** Restart in the same room: same players and settings, new seed. */
export function restartMatch(s: GameState, newSeed: number, now: number): GameState {
  return createMatch(
    {
      seed: newSeed,
      settings: s.settings,
      players: s.players.map((p) => ({ id: p.id, nickname: p.nickname, isBot: p.isBot })),
      matchNumber: s.matchNumber + 1,
    },
    now,
  );
}

/** Sum of all coins and goods — used by conservation tests. */
export function totals(s: GameState): { cash: number; goods: Record<Good, number> } {
  const goods = emptyInventory();
  let cash = 0;
  for (const p of s.players) {
    cash += p.cash;
    for (const g of s.goods) goods[g] += p.inventory[g];
  }
  return { cash, goods };
}
