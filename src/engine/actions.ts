// The complete set of player actions, shared by clients, bots and the server.
import { z } from 'zod';
import { GOODS, type Good } from './config';
import {
  GameError,
  buyClueCard,
  cancelTrade,
  endTurn,
  listClueCard,
  proposeTrade,
  registerClaim,
  respondTrade,
  setOrders,
  setReady,
  unlistClueCard,
} from './game';
import type { GameState } from './types';

const goodSchema = z.enum(GOODS as unknown as [Good, ...Good[]]);
const goodsMap = z.record(goodSchema, z.number().int().min(0).max(50)).default({});
const bundleSchema = z.object({ goods: goodsMap, coins: z.number().int().min(0).max(100000).default(0) });

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('endTurn') }),
  z.object({ type: z.literal('claim'), good: goodSchema, direction: z.enum(['up', 'down']) }),
  z.object({ type: z.literal('propose'), to: z.string().max(64), give: bundleSchema, receive: bundleSchema }),
  z.object({ type: z.literal('respond'), offerId: z.string().max(32), accept: z.boolean() }),
  z.object({ type: z.literal('cancelOffer'), offerId: z.string().max(32) }),
  z.object({ type: z.literal('listCard'), price: z.number().int().min(1).max(10000) }),
  z.object({ type: z.literal('unlistCard') }),
  z.object({ type: z.literal('buyCard'), sellerId: z.string().max(64) }),
  z.object({
    type: z.literal('orders'),
    orders: z.record(goodSchema, z.number().int().min(-50).max(50)).default({}),
    bid: z.number().int().min(0).max(1_000_000).nullable().default(null),
    seal: z.boolean().default(false),
  }),
]);

export type Action = z.infer<typeof actionSchema>;

/** Apply a player action to the game state. Throws GameError on rule violations. */
export function applyAction(s: GameState, pid: string, a: Action, now: number): void {
  switch (a.type) {
    case 'ready':
      setReady(s, pid, now);
      return;
    case 'endTurn':
      endTurn(s, pid, now);
      return;
    case 'claim':
      registerClaim(s, pid, a.good, a.direction);
      return;
    case 'propose':
      proposeTrade(s, pid, a.to, a.give, a.receive);
      return;
    case 'respond':
      respondTrade(s, pid, a.offerId, a.accept);
      return;
    case 'cancelOffer':
      cancelTrade(s, pid, a.offerId);
      return;
    case 'listCard':
      listClueCard(s, pid, a.price);
      return;
    case 'unlistCard':
      unlistClueCard(s, pid);
      return;
    case 'buyCard':
      buyClueCard(s, pid, a.sellerId);
      return;
    case 'orders':
      setOrders(s, pid, { orders: a.orders, bid: a.bid }, a.seal, now);
      return;
    default:
      throw new GameError('unknown-action');
  }
}
