// Pure price / order math.
import { BASE_PRICES, CONFIG, type Good } from './config';
import type { Bundle, Clue, Footprint, GameEvent, PlayerOrders } from './types';

export type PriceMap = Record<Good, number>;
export type Inventory = Record<Good, number>;

export function emptyInventory(): Inventory {
  return { wheat: 0, fuel: 0, iron: 0, medicine: 0, chips: 0 };
}

export function totalUnits(inv: Partial<Record<Good, number>>): number {
  let n = 0;
  for (const v of Object.values(inv)) n += v ?? 0;
  return n;
}

export function executionPrice(current: number, netDemand: number): number {
  const raw = current * (1 + CONFIG.demandImpact * netDemand);
  const lo = current * CONFIG.executionClamp.min;
  const hi = current * CONFIG.executionClamp.max;
  return Math.max(1, Math.round(Math.min(hi, Math.max(lo, raw))));
}

export function priceFloor(good: Good): number {
  return Math.ceil(BASE_PRICES[good] * CONFIG.priceFloor);
}

export function nextPrice(good: Good, current: number, exec: number, eventEffectSum: number): number {
  const raw = current * (1 + eventEffectSum) + CONFIG.carryOver * (exec - current);
  return Math.max(priceFloor(good), Math.round(raw));
}

export function eventEffectOn(events: GameEvent[], good: Good): number {
  return events.filter((e) => e.target === good).reduce((s, e) => s + e.effect, 0);
}

export function inventoryValue(inv: Inventory, prices: PriceMap): number {
  let v = 0;
  for (const g of Object.keys(inv) as Good[]) v += (inv[g] ?? 0) * (prices[g] ?? 0);
  return v;
}

export interface OrderPlayer {
  id: string;
  cash: number;
  inventory: Inventory;
}

export interface OrderOutcome {
  /** signed executed quantity per player and good */
  executed: Record<string, Partial<Record<Good, number>>>;
  requested: Record<string, Partial<Record<Good, number>>>;
  netDemandRequested: Record<Good, number>;
  netDemand: Record<Good, number>;
  execPrices: PriceMap;
}

/** Normalise raw orders: integers, known goods, sells capped to holdings, no both-ways per good. */
export function sanitizeOrders(
  raw: Partial<Record<Good, number>> | undefined,
  inventory: Inventory,
  goods: Good[],
): Partial<Record<Good, number>> {
  const out: Partial<Record<Good, number>> = {};
  if (!raw) return out;
  for (const g of goods) {
    let q = raw[g];
    if (typeof q !== 'number' || !Number.isFinite(q)) continue;
    q = Math.trunc(q);
    if (q > 0) out[g] = Math.min(q, CONFIG.warehouseCapacity);
    else if (q < 0) {
      const sell = Math.min(-q, inventory[g] ?? 0);
      if (sell > 0) out[g] = -sell;
    }
  }
  return out;
}

/**
 * Resolve all market orders of a round.
 *  1. sells are capped by holdings; pass-1 price uses the requested net demand
 *  2. buys are scaled down (cash after reserve, warehouse space) at pass-1 prices, goods in fixed order
 *  3. the final execution price uses the net demand that actually happens (≤ pass-1 price on the buy side),
 *     so every scaled buy stays affordable.
 * `reserve[playerId]` is cash that cannot be spent on goods (the winning auction bid).
 */
export function resolveOrders(
  players: OrderPlayer[],
  orders: Record<string, PlayerOrders | undefined>,
  prices: PriceMap,
  goods: Good[],
  reserve: Record<string, number> = {},
): OrderOutcome {
  const requested: OrderOutcome['requested'] = {};
  const netReq = {} as Record<Good, number>;
  for (const g of goods) netReq[g] = 0;
  for (const p of players) {
    const o = sanitizeOrders(orders[p.id]?.orders, p.inventory, goods);
    requested[p.id] = o;
    for (const g of goods) netReq[g] += o[g] ?? 0;
  }
  const p1 = {} as PriceMap;
  for (const g of goods) p1[g] = executionPrice(prices[g], netReq[g]);

  const executed: OrderOutcome['executed'] = {};
  const net = {} as Record<Good, number>;
  for (const g of goods) net[g] = 0;
  for (const p of players) {
    const req = requested[p.id];
    const ex: Partial<Record<Good, number>> = {};
    let sells = 0;
    for (const g of goods) if ((req[g] ?? 0) < 0) sells += -(req[g] as number);
    let freeCap = CONFIG.warehouseCapacity - (totalUnits(p.inventory) - sells);
    let cash = p.cash - (reserve[p.id] ?? 0);
    for (const g of goods) {
      const q = req[g] ?? 0;
      if (q < 0) ex[g] = q;
      else if (q > 0) {
        const afford = Math.floor(Math.max(0, cash) / p1[g]);
        const n = Math.max(0, Math.min(q, afford, freeCap));
        if (n > 0) {
          ex[g] = n;
          cash -= n * p1[g];
          freeCap -= n;
        }
      }
      net[g] += ex[g] ?? 0;
    }
    executed[p.id] = ex;
  }
  const execPrices = {} as PriceMap;
  for (const g of goods) execPrices[g] = executionPrice(prices[g], net[g]);
  return { executed, requested, netDemandRequested: netReq, netDemand: net, execPrices };
}

export function footprintOf(executed: number | undefined): Footprint {
  if (!executed) return 'none';
  return executed > 0 ? 'buy' : 'sell';
}

/** Min/max execution price a single order could face, for the UI hint (is purely informational). */
export function estimateRange(current: number, qty: number, otherDemandSpread = 6): { low: number; high: number } {
  const lo = executionPrice(current, qty - otherDemandSpread);
  const hi = executionPrice(current, qty + otherDemandSpread);
  return { low: Math.min(lo, hi), high: Math.max(lo, hi) };
}

// ---------- direct trades ----------

export function goodsValue(goods: Bundle['goods'], prices: PriceMap): number {
  let v = 0;
  for (const g of Object.keys(goods) as Good[]) v += (goods[g] ?? 0) * (prices[g] ?? 0);
  return v;
}

export interface BandCheck {
  ok: boolean;
  reason?: string;
  /** for pure goods↔coins trades: allowed coin range for the goods in the offer */
  coinRange?: { min: number; max: number };
}

/**
 * Anti wealth-transfer band.
 *  - pure goods ↔ coins: implied price per unit must be within ±50% of the market price
 *    (i.e. coins ∈ [0.5, 1.5] × market value of the goods)
 *  - anything else (goods ↔ goods, mixed): the market values of the two sides may differ by at most 50%
 */
export function checkTradeBand(give: Bundle, receive: Bundle, prices: PriceMap): BandCheck {
  const vGive = goodsValue(give.goods, prices);
  const vRecv = goodsValue(receive.goods, prices);
  const band = CONFIG.tradeBand;
  if (vGive <= 0 && vRecv <= 0) return { ok: false, reason: 'no-goods' };
  const pureSell = vGive > 0 && vRecv === 0 && give.coins === 0 && receive.coins > 0;
  const pureBuy = vRecv > 0 && vGive === 0 && receive.coins === 0 && give.coins > 0;
  if (pureSell || pureBuy) {
    const v = pureSell ? vGive : vRecv;
    const coins = pureSell ? receive.coins : give.coins;
    const min = Math.ceil(v * (1 - band));
    const max = Math.floor(v * (1 + band));
    return coins >= min && coins <= max ? { ok: true, coinRange: { min, max } } : { ok: false, reason: 'band', coinRange: { min, max } };
  }
  const a = vGive + give.coins;
  const b = vRecv + receive.coins;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (lo <= 0) return { ok: false, reason: 'one-sided' };
  return hi <= lo * (1 + band) ? { ok: true } : { ok: false, reason: 'band' };
}

export function bundleIsEmpty(b: Bundle): boolean {
  return b.coins <= 0 && totalUnits(b.goods) <= 0;
}

export function clueIsCount(c: Clue): boolean {
  return c.kind === 'count';
}
