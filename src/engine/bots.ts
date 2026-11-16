// Bot strategy. A bot only sees what a human player would see (its PlayerView).
import type { Action } from './actions';
import { CONFIG, type Good } from './config';
import { Rng } from './rng';
import { totalUnits } from './prices';
import type { Clue, Direction, Magnitude } from './types';
import type { PlayerView } from './views';

export interface BotMemory {
  key: string;
  done: Set<string>;
  nextAt: number;
}

export function newBotMemory(): BotMemory {
  return { key: '', done: new Set(), nextAt: 0 };
}

const MAG_WEIGHT: Record<Magnitude, number> = { low: 0.5, medium: 0.8, high: 1.1 };
const sign = (d: Direction) => (d === 'up' ? 1 : -1);

function clueScore(c: Clue, score: Partial<Record<Good, number>>, mult: number) {
  if (c.kind !== 'components' || !c.target || !c.direction) return;
  const w = c.magnitude ? MAG_WEIGHT[c.magnitude] : 0.7;
  score[c.target] = (score[c.target] ?? 0) + sign(c.direction) * w * mult;
}

function trustOf(view: PlayerView, playerId: string): number {
  const hist = view.claimHistory.filter((e) => e.playerId === playerId);
  if (!hist.length) return 0.5;
  const good = hist.filter((e) => e.net === 'true' || (e.matched > 0 && e.net !== 'false')).length;
  return (good + 1) / (hist.length + 2);
}

/** Belief score per good: positive = expects price up. */
export function beliefs(view: PlayerView): Partial<Record<Good, number>> {
  const score: Partial<Record<Good, number>> = {};
  if (view.me.clue) clueScore(view.me.clue, score, 1);
  for (const p of view.me.purchases) clueScore(p.clue, score, 1);
  for (const c of view.claims) {
    if (c.playerId === view.me.id) continue;
    score[c.good] = (score[c.good] ?? 0) + sign(c.direction) * 0.45 * trustOf(view, c.playerId);
  }
  return score;
}

/**
 * Returns the next action this bot wants to take right now, or null.
 * `ignoreDelay` is used by simulations so no waiting is needed.
 */
export function botTick(view: PlayerView, mem: BotMemory, rng: Rng, nowMs: number, ignoreDelay = false): Action | null {
  const key = `${view.round}:${view.phase}`;
  if (mem.key !== key) {
    mem.key = key;
    mem.done = new Set();
    mem.nextAt = nowMs + rng.int(700, 3500);
  }
  if (!ignoreDelay && nowMs < mem.nextAt) return null;
  const finish = (a: Action): Action => {
    mem.nextAt = nowMs + rng.int(900, 4000);
    return a;
  };
  const me = view.me;

  if (view.phase === 'market') {
    // 1. claims (from round 1)
    if (!mem.done.has('claim')) {
      mem.done.add('claim');
      const c = me.clue;
      if (c && c.kind === 'components' && c.target && c.direction && rng.chance(0.85)) {
        const lie = rng.chance(0.25);
        const dir: Direction = lie ? (c.direction === 'up' ? 'down' : 'up') : c.direction;
        return finish({ type: 'claim', good: c.target, direction: dir });
      }
      if (rng.chance(0.2)) return finish({ type: 'claim', good: rng.pick(view.goods), direction: rng.chance(0.5) ? 'up' : 'down' });
    }
    // 2. list clue card
    if (view.unlocks.trades && !mem.done.has('list')) {
      mem.done.add('list');
      if (rng.chance(0.5)) return finish({ type: 'listCard', price: rng.int(20, 90) });
    }
    // 3. buy cards sometimes
    if (view.unlocks.trades) {
      const cand = view.cards.find(
        (c) => c.sellerId !== me.id && !me.boughtFrom.includes(c.sellerId) && c.price <= 90 && me.cash > c.price + 400 && !mem.done.has('buy:' + c.sellerId),
      );
      if (cand) {
        mem.done.add('buy:' + cand.sellerId);
        if (rng.chance(0.4)) return finish({ type: 'buyCard', sellerId: cand.sellerId });
      }
    }
    // 4. answer trade offers
    const offer = me.offersIn.find((o) => !mem.done.has('resp:' + o.id));
    if (offer) {
      mem.done.add('resp:' + offer.id);
      return finish({ type: 'respond', offerId: offer.id, accept: rng.chance(0.5) });
    }
    return null;
  }

  if (view.phase === 'orders' && !me.orders.sealed && !mem.done.has('orders')) {
    mem.done.add('orders');
    return finish(planOrders(view, rng));
  }
  return null;
}

export function planOrders(view: PlayerView, rng: Rng): Action {
  const me = view.me;
  const score = beliefs(view);
  const orders: Partial<Record<Good, number>> = {};
  let used = totalUnits(me.inventory);
  let budget = me.cash;
  let bid: number | null = null;

  // contract: bid if we can deliver (hold it already, or can buy the shortfall)
  const c = view.auctionContract;
  if (c) {
    const have = me.inventory[c.good];
    const short = Math.max(0, c.quantity - have);
    const unit = view.prices[c.good];
    const buyCost = short * unit * 1.35;
    const freeCap = CONFIG.warehouseCapacity - used;
    const margin = c.quantity * c.unitPrice - c.quantity * unit;
    if (margin > 40 && short <= freeCap && me.cash > buyCost + 60) {
      const want = Math.floor(margin * rng.float(0.35, 0.7));
      const cap = Math.floor(me.cash - buyCost);
      const b = Math.min(want, cap);
      if (b >= 10) {
        bid = b;
        if (short > 0) {
          orders[c.good] = short;
          used += short;
        }
        budget -= b + buyCost;
      }
    }
  }

  const ranked = (Object.keys(score) as Good[]).sort((a, b) => Math.abs(score[b] ?? 0) - Math.abs(score[a] ?? 0));
  for (const g of ranked) {
    const sc = score[g] ?? 0;
    if (orders[g] !== undefined) continue;
    if (sc >= 0.35) {
      const unit = view.prices[g] * 1.1;
      const wanted = Math.max(1, Math.min(5, Math.round(sc * 3)));
      const q = Math.max(0, Math.min(wanted, Math.floor((budget * 0.5) / unit), CONFIG.warehouseCapacity - used));
      if (q > 0) {
        orders[g] = q;
        used += q;
        budget -= q * unit;
      }
    } else if (sc <= -0.35 && me.inventory[g] > 0) {
      const q = Math.min(me.inventory[g], Math.max(1, Math.round(-sc * 3)));
      orders[g] = -q;
      used -= q;
    }
  }
  return { type: 'orders', orders, bid, seal: true };
}
