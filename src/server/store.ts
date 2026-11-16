// Persistence. Live state stays in memory; the store keeps snapshots (so a restart can resume rooms)
// and the history used for the end-of-game recap. If no DATABASE_URL is set a no-op store is used.
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Settings } from '../engine/config';
import type { GameState, RoundState } from '../engine/types';

export interface PersistedPlayer {
  id: string;
  nickname: string;
  seat: number;
  isBot: boolean;
  tokenHash: string;
  googleSub?: string;
}

export interface PersistedRoom {
  code: string;
  hostId: string | null;
  status: 'lobby' | 'playing';
  settings: Settings;
  players: PersistedPlayer[];
  game: GameState | null;
  matchId: string | null;
  seedCounter: number;
  updatedAt: number;
}

export interface Store {
  readonly enabled: boolean;
  saveRoom(room: PersistedRoom): Promise<void>;
  saveRound(room: PersistedRoom, matchId: string, round: RoundState, game: GameState): Promise<void>;
  saveMatchStart(room: PersistedRoom, matchId: string, game: GameState): Promise<void>;
  saveMatchEnd(matchId: string, game: GameState): Promise<void>;
  loadActive(maxAgeMs: number): Promise<PersistedRoom[]>;
  closeRoom(code: string): Promise<void>;
  close(): Promise<void>;
}

export class NullStore implements Store {
  readonly enabled = false;
  async saveRoom() {}
  async saveRound() {}
  async saveMatchStart() {}
  async saveMatchEnd() {}
  async loadActive() {
    return [];
  }
  async closeRoom() {}
  async close() {}
}

const json = (v: unknown) => v as unknown as Prisma.InputJsonValue;

export class PrismaStore implements Store {
  readonly enabled = true;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private db: PrismaClient) {}

  /** Serialise writes so that snapshots never overtake each other. */
  private enqueue(label: string, fn: () => Promise<unknown>): Promise<void> {
    const run = this.queue.then(fn).then(
      () => undefined,
      (e) => {
        console.error(`[store] ${label} failed:`, e instanceof Error ? e.message : e);
      },
    );
    this.queue = run;
    return run;
  }

  saveRoom(room: PersistedRoom) {
    return this.enqueue('saveRoom', async () => {
      await this.db.room.upsert({
        where: { code: room.code },
        create: { code: room.code, hostId: room.hostId, settings: json(room.settings), status: room.status },
        update: { hostId: room.hostId, settings: json(room.settings), status: room.status },
      });
      const ids = room.players.map((p) => p.id);
      await this.db.player.deleteMany({ where: { roomCode: room.code, id: { notIn: ids } } });
      for (const p of room.players) {
        await this.db.player.upsert({
          where: { id: p.id },
          create: { id: p.id, roomCode: room.code, nickname: p.nickname, seat: p.seat, isBot: p.isBot, tokenHash: p.tokenHash, googleSub: p.googleSub ?? null },
          update: { nickname: p.nickname, seat: p.seat, isBot: p.isBot, googleSub: p.googleSub ?? null },
        });
      }
      const phase = room.game?.phase ?? 'lobby';
      await this.db.roomSnapshot.upsert({
        where: { code: room.code },
        create: { code: room.code, state: json(room), phase, round: room.game?.round ?? 0 },
        update: { state: json(room), phase, round: room.game?.round ?? 0 },
      });
    });
  }

  saveMatchStart(room: PersistedRoom, matchId: string, game: GameState) {
    return this.enqueue('saveMatchStart', async () => {
      await this.db.match.upsert({
        where: { id: matchId },
        create: { id: matchId, roomCode: room.code, number: game.matchNumber, seed: game.seed },
        update: {},
      });
    });
  }

  saveRound(room: PersistedRoom, matchId: string, round: RoundState, game: GameState) {
    return this.enqueue('saveRound', async () => {
      const res = round.result;
      if (!res) return;
      const roundId = `${matchId}-r${round.n}`;
      await this.db.match.upsert({
        where: { id: matchId },
        create: { id: matchId, roomCode: room.code, number: game.matchNumber, seed: game.seed },
        update: {},
      });
      await this.db.round.deleteMany({ where: { id: roundId } });
      await this.db.round.create({
        data: {
          id: roundId,
          matchId,
          number: round.n,
          storm: round.storm,
          events: json(round.events),
          publicNews: json(round.news),
          clues: json(round.clues),
          prices: json(res.startPrices),
          execution: json({ execPrices: res.execPrices, netDemand: res.netDemand, footprints: res.footprints }),
          nextPrices: json(res.nextPrices),
          orders: {
            create: Object.entries(round.orders).map(([playerId, o]) => ({
              id: `${roundId}-o-${playerId}`,
              playerId,
              orders: json({ orders: o.orders, lines: res.players[playerId]?.lines ?? [] }),
              bid: o.bid,
            })),
          },
          trades: {
            create: round.trades.map((t) => ({
              id: `${roundId}-${t.id}`,
              fromPlayer: t.from,
              toPlayer: t.to,
              give: json(t.give),
              receive: json(t.receive),
            })),
          },
          clueSales: {
            create: round.purchases.map((p) => ({ id: `${roundId}-${p.id}`, sellerId: p.sellerId, buyerId: p.buyerId, price: p.price })),
          },
          claims: {
            create: round.claims.map((c) => ({
              id: `${roundId}-${c.id}`,
              playerId: c.playerId,
              good: c.good,
              direction: c.direction,
              evaluation: json(res.claimEvals.find((e) => e.claimId === c.id) ?? {}),
            })),
          },
          ...(res.auction
            ? {
                auction: {
                  create: {
                    id: `${roundId}-auction`,
                    contract: json(res.auction.contract),
                    bids: json(res.auction.bids),
                    winnerId: res.auction.winnerId,
                    outcome: json({ delivered: res.auction.delivered, payout: res.auction.payout, tie: res.auction.tie, winningBid: res.auction.winningBid }),
                  },
                },
              }
            : {}),
        },
      });
    });
  }

  saveMatchEnd(matchId: string, game: GameState) {
    return this.enqueue('saveMatchEnd', async () => {
      await this.db.match.update({
        where: { id: matchId },
        data: { finishedAt: new Date(), results: json(game.final) },
      });
    });
  }

  async loadActive(maxAgeMs: number): Promise<PersistedRoom[]> {
    try {
      const since = new Date(Date.now() - maxAgeMs);
      const snaps = await this.db.roomSnapshot.findMany({ where: { updatedAt: { gte: since }, room: { status: { not: 'closed' } } } });
      return snaps.map((s) => s.state as unknown as PersistedRoom);
    } catch (e) {
      console.error('[store] loadActive failed:', e instanceof Error ? e.message : e);
      return [];
    }
  }

  closeRoom(code: string) {
    return this.enqueue('closeRoom', async () => {
      await this.db.room.updateMany({ where: { code }, data: { status: 'closed' } });
      await this.db.roomSnapshot.deleteMany({ where: { code } });
    });
  }

  async close() {
    await this.queue;
    await this.db.$disconnect();
  }
}

export async function createStore(): Promise<Store> {
  if (!process.env.DATABASE_URL) {
    console.warn('[store] DATABASE_URL not set — running without persistence');
    return new NullStore();
  }
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  try {
    await db.$connect();
    console.log('[store] connected to PostgreSQL');
    return new PrismaStore(db);
  } catch (e) {
    console.error('[store] could not connect, continuing without persistence:', e instanceof Error ? e.message : e);
    await db.$disconnect().catch(() => undefined);
    return new NullStore();
  }
}
