// Builds what each client may see. The server is authoritative; the views are the only data clients get.
// Private information (clues, wealth, orders) only appears in a player's own view. The TV view is public only.
import type { Good, Settings } from './config';
import { cluePreview, type CluePreview } from './describe';
import { finalStepNames, wealth } from './game';
import type {
  AuctionResult,
  Claim,
  ClaimEval,
  Clue,
  Contract,
  ExecutedTrade,
  FinalRank,
  Footprint,
  GameEvent,
  GameState,
  Phase,
  PlayerOrders,
  PlayerRoundResult,
  Purchase,
  PublicNews,
  RevealStepKind,
  Title,
  TradeOffer,
} from './types';

export interface PublicPlayer {
  id: string;
  nickname: string;
  isBot: boolean;
  seat: number;
  connected: boolean;
  /** tapped ready / sealed orders this phase */
  ready: boolean;
}

export interface PublicCard {
  sellerId: string;
  price: number;
  preview: CluePreview;
  isCount: boolean;
  soldCount: number;
}

export interface RevealView {
  steps: RevealStepKind[];
  kind: RevealStepKind['kind'];
  stepIndex: number;
  startPrices: Record<Good, number>;
  execPrices: Record<Good, number>;
  netDemand: Record<Good, number>;
  /** events revealed so far (in order) */
  events: GameEvent[];
  eventsTotal: number;
  nextPrices: Record<Good, number> | null;
  claimEvals: ClaimEval[] | null;
  footprints: Record<string, Record<Good, Footprint>> | null;
  trades: { from: string; to: string; goods: Good[] }[] | null;
  auction: AuctionResult | null;
  contractCurrent: Contract | null;
}

export interface RecapRound {
  n: number;
  storm: boolean;
  events: GameEvent[];
  news: PublicNews;
  clues: { playerId: string; clue: Clue }[];
  claims: ClaimEval[];
  sales: { buyerId: string; sellerId: string; price: number }[];
  trades: ExecutedTrade[];
  auction: AuctionResult | null;
}

export interface FinalView {
  stage: 'rank' | 'recap' | 'titles' | 'again';
  step: number;
  total: number;
  ranking: FinalRank[];
  titles: Title[] | null;
  recap: RecapRound[] | null;
}

export interface PublicView {
  code: string;
  phase: Phase;
  round: number;
  totalRounds: number;
  step: number;
  deadline: number | null;
  pausedRemainingMs: number | null;
  paused: boolean;
  serverNow: number;
  settings: Settings;
  goods: Good[];
  prices: Record<Good, number>;
  storm: boolean;
  news: PublicNews | null;
  announcedContract: Contract | null;
  auctionContract: Contract | null;
  unlocks: { trades: boolean; auction: boolean };
  speaker: { order: string[]; index: number; currentId: string | null } | null;
  claims: Claim[];
  claimHistory: (ClaimEval & { round: number })[];
  cards: PublicCard[];
  players: PublicPlayer[];
  reveal: RevealView | null;
  final: FinalView | null;
  matchNumber: number;
}

export interface MyView {
  id: string;
  cash: number;
  inventory: Record<Good, number>;
  wealth: number;
  clue: Clue | null;
  purchases: (Purchase & { sellerName: string })[];
  orders: PlayerOrders;
  ready: boolean;
  offersIn: TradeOffer[];
  offersOut: TradeOffer[];
  myCard: { price: number; soldCount: number } | null;
  boughtFrom: string[];
  claimsLeft: number;
  privateResult: PlayerRoundResult | null;
  /** deeper history for the player's own notebook */
  clueHistory: { round: number; clue: Clue; own: boolean }[];
}

export interface PlayerView extends PublicView {
  me: MyView;
}

export interface ViewOptions {
  code: string;
  now: number;
  connected: (id: string) => boolean;
}

export function buildPublicView(s: GameState, opts: ViewOptions): PublicView {
  const r = s.rounds[s.round - 1];
  const inReveal = s.phase === 'reveal' && !!r?.result;
  const showPrices = inReveal ? r.result!.startPrices : s.prices;
  const sealedOrReady = (id: string) =>
    s.phase === 'orders' ? !!r?.orders[id]?.sealed : s.ready.includes(id);

  const claimHistory: PublicView['claimHistory'] = [];
  for (const rr of s.rounds) {
    const done = rr.n < s.round || s.phase === 'final';
    if (done && rr.result) for (const e of rr.result.claimEvals) claimHistory.push({ ...e, round: rr.n });
  }

  const view: PublicView = {
    code: opts.code,
    phase: s.phase,
    round: s.round,
    totalRounds: s.totalRounds,
    step: s.step,
    deadline: s.deadline,
    pausedRemainingMs: s.pausedRemainingMs,
    paused: s.paused,
    serverNow: opts.now,
    settings: s.settings,
    goods: s.goods,
    prices: showPrices,
    storm: !!r?.storm,
    news: r && s.phase !== 'final' ? r.news : null,
    announcedContract: r?.contractAnnounced ?? null,
    auctionContract: r?.contractAuction ?? null,
    unlocks: { trades: s.round >= 2, auction: !!r?.contractAuction },
    speaker:
      r && s.phase === 'tribune'
        ? { order: r.speakerOrder, index: r.speakerIndex, currentId: r.speakerOrder[r.speakerIndex] ?? null }
        : r
          ? { order: r.speakerOrder, index: -1, currentId: null }
          : null,
    claims: r ? r.claims : [],
    claimHistory,
    cards:
      r && s.phase === 'market'
        ? r.cards.map((c) => {
            const clue = r.clues[c.sellerId];
            return {
              sellerId: c.sellerId,
              price: c.price,
              preview: cluePreview(clue),
              isCount: clue.kind === 'count',
              soldCount: c.buyers.length,
            };
          })
        : [],
    players: s.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      isBot: p.isBot,
      seat: p.seat,
      connected: p.isBot || opts.connected(p.id),
      ready: sealedOrReady(p.id),
    })),
    reveal: inReveal ? buildReveal(s) : null,
    final: s.phase === 'final' ? buildFinal(s) : null,
    matchNumber: s.matchNumber,
  };
  return view;
}

function buildReveal(s: GameState): RevealView {
  const r = s.rounds[s.round - 1];
  const res = r.result!;
  const steps = r.revealSteps;
  const at = (kind: RevealStepKind['kind']) => steps.findIndex((x) => x.kind === kind);
  const reached = (kind: RevealStepKind['kind']) => {
    const i = at(kind);
    return i >= 0 && s.step >= i;
  };
  const eventSteps = steps.filter((x) => x.kind === 'event').length;
  const shown = steps.slice(0, s.step + 1).filter((x) => x.kind === 'event').length;
  const cur = steps[s.step];
  return {
    steps,
    kind: cur.kind,
    stepIndex: s.step,
    startPrices: res.startPrices,
    execPrices: res.execPrices,
    netDemand: res.netDemand,
    events: r.events.slice(0, shown),
    eventsTotal: eventSteps,
    nextPrices: shown >= eventSteps && eventSteps > 0 ? res.nextPrices : null,
    claimEvals: reached('claims') ? res.claimEvals : null,
    footprints: reached('footprints') ? res.footprints : null,
    trades: reached('trades') ? r.trades.map((t) => ({ from: t.from, to: t.to, goods: [...new Set([...Object.keys(t.give.goods), ...Object.keys(t.receive.goods)])] as Good[] })) : null,
    auction: reached('auction') ? res.auction : null,
    contractCurrent: r.contractAuction,
  };
}

function buildFinal(s: GameState): FinalView {
  const f = s.final!;
  const n = s.players.length;
  const names = finalStepNames(s);
  const stage: FinalView['stage'] = s.step < n ? 'rank' : s.step === names.recap ? 'recap' : s.step === names.titles ? 'titles' : 'again';
  const ranking = s.step < n ? f.ranking.filter((x) => x.rank >= n - s.step) : f.ranking;
  return {
    stage,
    step: s.step,
    total: n,
    ranking,
    titles: s.step >= names.titles ? f.titles : null,
    recap: s.step >= names.recap ? buildRecap(s) : null,
  };
}

function buildRecap(s: GameState): RecapRound[] {
  return s.rounds.map((r) => ({
    n: r.n,
    storm: r.storm,
    events: r.events,
    news: r.news,
    clues: s.players.map((p) => ({ playerId: p.id, clue: r.clues[p.id] })),
    claims: r.result?.claimEvals ?? [],
    sales: r.purchases.map((p) => ({ buyerId: p.buyerId, sellerId: p.sellerId, price: p.price })),
    trades: r.trades,
    auction: r.result?.auction ?? null,
  }));
}

export function buildPlayerView(s: GameState, pid: string, opts: ViewOptions): PlayerView {
  const base = buildPublicView(s, opts);
  const p = s.players.find((x) => x.id === pid);
  if (!p) throw new Error('unknown player');
  const r = s.rounds[s.round - 1];
  const res = r?.result ?? null;
  const privIdx = r ? r.revealSteps.findIndex((x) => x.kind === 'private') : -1;
  const hideOutcome = s.phase === 'reveal' && res && privIdx >= 0 && s.step < privIdx;
  const my = res?.players[pid];
  const cash = hideOutcome && my ? my.cashBefore : p.cash;
  const inventory = hideOutcome && my ? my.inventoryBefore : p.inventory;
  const prices = base.prices;
  const names = new Map(s.players.map((x) => [x.id, x.nickname]));
  const mine = r?.cards.find((c) => c.sellerId === pid) ?? null;
  const clueHistory: MyView['clueHistory'] = [];
  for (const rr of s.rounds) {
    const own = rr.clues[pid];
    if (own && rr.n < s.round) clueHistory.push({ round: rr.n, clue: own, own: true });
    for (const pu of rr.purchases) if (pu.buyerId === pid && rr.n < s.round) clueHistory.push({ round: rr.n, clue: pu.clue, own: false });
  }
  const me: MyView = {
    id: pid,
    cash,
    inventory: { ...inventory },
    wealth: hideOutcome && my ? my.wealthBefore : wealth(s, { ...p, cash, inventory }, prices),
    clue: r && s.phase !== 'final' ? r.clues[pid] : null,
    purchases: r ? r.purchases.filter((x) => x.buyerId === pid).map((x) => ({ ...x, sellerName: names.get(x.sellerId) ?? '' })) : [],
    orders: r ? r.orders[pid] : { orders: {}, bid: null, sealed: false },
    ready: base.players.find((x) => x.id === pid)?.ready ?? false,
    offersIn: r && s.phase === 'market' ? r.offers.filter((o) => o.to === pid && o.status === 'open') : [],
    offersOut: r && s.phase === 'market' ? r.offers.filter((o) => o.from === pid && o.status === 'open') : [],
    myCard: mine ? { price: mine.price, soldCount: mine.buyers.length } : null,
    boughtFrom: r ? r.purchases.filter((x) => x.buyerId === pid).map((x) => x.sellerId) : [],
    claimsLeft: r ? Math.max(0, 2 - r.claims.filter((c) => c.playerId === pid).length) : 0,
    privateResult: s.phase === 'reveal' && res && privIdx >= 0 && s.step >= privIdx ? my ?? null : null,
    clueHistory,
  };
  return { ...base, me };
}
