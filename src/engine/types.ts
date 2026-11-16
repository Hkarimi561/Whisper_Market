import type { Good, Settings } from './config';

export type Direction = 'up' | 'down';
export type Magnitude = 'low' | 'medium' | 'high';
export type Component = 'target' | 'direction' | 'magnitude';

export type Phase = 'info' | 'tribune' | 'market' | 'orders' | 'reveal' | 'final';

export interface GameEvent {
  id: string;
  templateId: string;
  text: string;
  target: Good;
  direction: Direction;
  magnitude: Magnitude;
  /** signed price effect on the next price, e.g. +0.2 or -0.15 (storm ×1.5 already applied) */
  effect: number;
  /** false for the single "hidden" event of the round: nobody holds a clue for it */
  clued: boolean;
}

export interface Clue {
  id: string;
  kind: 'components' | 'count';
  /** components clue: event it comes from, with exactly two of the three fields present */
  eventId?: string;
  target?: Good;
  direction?: Direction;
  magnitude?: Magnitude;
  /** count clue: "count events affect countGood" */
  countGood?: Good;
  count?: number;
}

export interface PublicNews {
  eventId: string;
  component: Component;
  target?: Good;
  direction?: Direction;
  magnitude?: Magnitude;
}

export type Bundle = { goods: Partial<Record<Good, number>>; coins: number };

export interface TradeOffer {
  id: string;
  from: string;
  to: string;
  /** what `from` gives */
  give: Bundle;
  /** what `from` receives */
  receive: Bundle;
  status: 'open' | 'accepted' | 'declined' | 'cancelled';
}

export interface ExecutedTrade {
  id: string;
  from: string;
  to: string;
  give: Bundle;
  receive: Bundle;
}

export interface ClueCard {
  sellerId: string;
  price: number;
  clueId: string;
  buyers: string[];
}

export interface Purchase {
  id: string;
  buyerId: string;
  sellerId: string;
  price: number;
  clue: Clue;
}

export interface Claim {
  id: string;
  playerId: string;
  good: Good;
  direction: Direction;
  phase: 'tribune' | 'market';
}

export interface PlayerOrders {
  /** signed per good: +n buy, −n sell */
  orders: Partial<Record<Good, number>>;
  bid: number | null;
  sealed: boolean;
}

export interface Contract {
  id: string;
  good: Good;
  quantity: number;
  /** price per unit paid on delivery */
  unitPrice: number;
  announcedRound: number;
  auctionRound: number;
}

export type Footprint = 'buy' | 'sell' | 'none';

export interface ClaimEval {
  claimId: string;
  playerId: string;
  good: Good;
  direction: Direction;
  matched: number;
  contradicted: number;
  net: 'true' | 'false' | 'mixed' | 'noEvent';
  footprint: Footprint;
  /** claimed ↑ but sold, or claimed ↓ but bought */
  footprintConflict: boolean;
}

export interface OrderLine {
  good: Good;
  requested: number; // signed
  executed: number; // signed
  unitPrice: number;
}

export interface AuctionResult {
  contract: Contract;
  bids: { playerId: string; amount: number }[];
  winnerId: string | null;
  winningBid: number;
  tie: boolean;
  delivered: boolean;
  payout: number;
}

export interface PlayerRoundResult {
  lines: OrderLine[];
  cashBefore: number;
  cashAfter: number;
  inventoryBefore: Record<Good, number>;
  inventoryAfter: Record<Good, number>;
  wealthBefore: number;
  wealthAfter: number;
  auctionDelta: number;
}

export interface RoundResult {
  startPrices: Record<Good, number>;
  netDemand: Record<Good, number>;
  execPrices: Record<Good, number>;
  nextPrices: Record<Good, number>;
  footprints: Record<string, Record<Good, Footprint>>;
  claimEvals: ClaimEval[];
  auction: AuctionResult | null;
  players: Record<string, PlayerRoundResult>;
}

export type RevealStepKind =
  | { kind: 'prices' }
  | { kind: 'event'; index: number }
  | { kind: 'claims' }
  | { kind: 'footprints' }
  | { kind: 'trades' }
  | { kind: 'auction' }
  | { kind: 'private' };

export interface RoundState {
  n: number;
  storm: boolean;
  events: GameEvent[];
  news: PublicNews;
  clues: Record<string, Clue>;
  contractAnnounced: Contract | null;
  contractAuction: Contract | null;
  speakerOrder: string[];
  speakerIndex: number;
  claims: Claim[];
  offers: TradeOffer[];
  trades: ExecutedTrade[];
  cards: ClueCard[];
  purchases: Purchase[];
  orders: Record<string, PlayerOrders>;
  result: RoundResult | null;
  revealSteps: RevealStepKind[];
}

export interface PlayerState {
  id: string;
  nickname: string;
  isBot: boolean;
  seat: number;
  cash: number;
  inventory: Record<Good, number>;
}

export type TitleId = 'honest' | 'bluffMaster' | 'infoBroker' | 'loneWolf' | 'contractHunter' | 'stormMan';

export interface Title {
  id: TitleId;
  playerId: string;
  value: number;
}

export interface FinalRank {
  playerId: string;
  cash: number;
  inventoryValue: number;
  total: number;
  rank: number;
}

export interface FinalResult {
  ranking: FinalRank[];
  titles: Title[];
  finalPrices: Record<Good, number>;
}

export interface GameState {
  version: 1;
  seed: number;
  rng: number;
  matchNumber: number;
  settings: Settings;
  goods: Good[];
  totalRounds: number;
  contractRounds: { announce: number; auction: number }[];
  round: number;
  phase: Phase;
  /** reveal sub-step, or final sub-step */
  step: number;
  deadline: number | null;
  paused: boolean;
  pausedRemainingMs: number | null;
  /** player ids who tapped ready in this phase */
  ready: string[];
  players: PlayerState[];
  prices: Record<Good, number>;
  rounds: RoundState[];
  final: FinalResult | null;
  idCounter: number;
}

export class GameError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}
