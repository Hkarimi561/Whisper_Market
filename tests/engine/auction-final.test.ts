import { describe, expect, it } from 'vitest';
import { applyAction } from '../../src/engine/actions';
import { CONFIG } from '../../src/engine/config';
import { advance, computeFinal, currentRound, finalStepNames, getPlayer, restartMatch, setOrders } from '../../src/engine/game';
import { inventoryValue } from '../../src/engine/prices';
import { runBotMatch } from '../../src/engine/sim';
import { buildPlayerView, buildPublicView } from '../../src/engine/views';
import { NOW, errCode, goTo, makeGame } from './helpers';

function auctionGame(seed = 21) {
  const s = makeGame(4, seed);
  goTo(s, 3, 'orders');
  const r = currentRound(s);
  expect(r.contractAuction).not.toBeNull();
  return s;
}

describe('sealed auction', () => {
  it('caps bids at the player\'s cash', () => {
    const s = auctionGame();
    expect(errCode(() => setOrders(s, 'p1', { orders: {}, bid: getPlayer(s, 'p1').cash + 1 }, true, NOW))).toBe('bid-too-high');
  });

  it('highest bid wins, only the winner pays, and delivery pays the contract price', () => {
    const s = auctionGame();
    const c = currentRound(s).contractAuction!;
    getPlayer(s, 'p2').inventory[c.good] = c.quantity;
    setOrders(s, 'p1', { orders: {}, bid: 50 }, true, NOW);
    setOrders(s, 'p2', { orders: {}, bid: 120 }, true, NOW);
    const cash1 = getPlayer(s, 'p1').cash;
    const cash2 = getPlayer(s, 'p2').cash;
    advance(s, NOW); // resolve
    const a = currentRound(s).result!.auction!;
    expect(a.winnerId).toBe('p2');
    expect(a.delivered).toBe(true);
    expect(getPlayer(s, 'p1').cash).toBe(cash1);
    expect(getPlayer(s, 'p2').cash).toBe(cash2 - 120 + c.quantity * c.unitPrice);
    expect(getPlayer(s, 'p2').inventory[c.good]).toBe(0);
  });

  it('a failed delivery still costs the bid and pays nothing', () => {
    const s = auctionGame();
    const c = currentRound(s).contractAuction!;
    getPlayer(s, 'p3').inventory[c.good] = c.quantity - 1;
    setOrders(s, 'p3', { orders: {}, bid: 80 }, true, NOW);
    const cash = getPlayer(s, 'p3').cash;
    advance(s, NOW);
    const a = currentRound(s).result!.auction!;
    expect(a.winnerId).toBe('p3');
    expect(a.delivered).toBe(false);
    expect(a.payout).toBe(0);
    expect(getPlayer(s, 'p3').cash).toBe(cash - 80);
    expect(getPlayer(s, 'p3').inventory[c.good]).toBe(c.quantity - 1);
  });

  it('settles ties with a seeded random choice (deterministic, and not always the same player)', () => {
    const winners = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const run = () => {
        const s = auctionGame(seed);
        setOrders(s, 'p1', { orders: {}, bid: 100 }, true, NOW);
        setOrders(s, 'p2', { orders: {}, bid: 100 }, true, NOW);
        advance(s, NOW);
        const a = currentRound(s).result!.auction!;
        expect(a.tie).toBe(true);
        return a.winnerId!;
      };
      const w = run();
      expect(run()).toBe(w);
      winners.add(w);
    }
    expect(winners.size).toBe(2);
  });

  it('with no valid bid nobody wins', () => {
    const s = auctionGame();
    advance(s, NOW);
    expect(currentRound(s).result!.auction!.winnerId).toBeNull();
  });

  it('keeps the winning bid out of the cash available for market buys', () => {
    const s = auctionGame();
    getPlayer(s, 'p1').cash = 400;
    setOrders(s, 'p1', { orders: { wheat: 12 }, bid: 300 }, true, NOW);
    advance(s, NOW);
    expect(getPlayer(s, 'p1').cash).toBeGreaterThanOrEqual(0);
  });
});

describe('storm round', () => {
  it('last round is the storm: 3 events, x1.5 magnitudes', () => {
    const s = makeGame(4, 5);
    goTo(s, 8, 'info');
    const r = currentRound(s);
    expect(r.storm).toBe(true);
    expect(r.events).toHaveLength(3);
    for (const e of r.events) expect(Math.abs(e.effect)).toBeCloseTo(CONFIG.magnitudes[e.magnitude] * 1.5, 5);
    expect(buildPublicView(s, { code: 'X', now: NOW, connected: () => true }).storm).toBe(true);
  });
  it('earlier rounds are not storms', () => {
    const s = makeGame(4, 5);
    goTo(s, 7, 'info');
    expect(currentRound(s).storm).toBe(false);
  });
});

describe('final scoring, titles and restart', () => {
  const sim = runBotMatch({ seed: 2024, bots: 5 });
  const s = sim.state;

  it('ranks by cash + inventory valued at the final prices', () => {
    const f = s.final!;
    expect(f.ranking).toHaveLength(5);
    for (const row of f.ranking) {
      const p = getPlayer(s, row.playerId);
      expect(row.total).toBe(p.cash + inventoryValue(p.inventory, f.finalPrices));
    }
    for (let i = 1; i < f.ranking.length; i++) expect(f.ranking[i - 1].total).toBeGreaterThanOrEqual(f.ranking[i].total);
    expect(f.ranking.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('gives each title to at most one player and always crowns the storm man and lone wolf', () => {
    const ids = s.final!.titles.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('stormMan');
    expect(ids).toContain('loneWolf');
    expect(computeFinal(s).titles.length).toBe(s.final!.titles.length);
  });

  it('titles follow behaviour: honest = most matched claims, broker = most clue income', () => {
    const matched: Record<string, number> = {};
    const income: Record<string, number> = {};
    for (const r of s.rounds) {
      for (const e of r.result!.claimEvals) if (e.matched > 0) matched[e.playerId] = (matched[e.playerId] ?? 0) + 1;
      for (const p of r.purchases) income[p.sellerId] = (income[p.sellerId] ?? 0) + p.price;
    }
    const honest = s.final!.titles.find((t) => t.id === 'honest');
    if (honest) expect(matched[honest.playerId]).toBe(Math.max(...Object.values(matched)));
    const broker = s.final!.titles.find((t) => t.id === 'infoBroker');
    if (broker) expect(income[broker.playerId]).toBe(Math.max(...Object.values(income)));
  });

  it('reveals the final ranking from last place to first and gates the recap', () => {
    const g = makeGame(4, 3);
    goTo(g, 8, 'reveal');
    goTo(g, 8, 'final');
    const n = g.players.length;
    const v0 = buildPlayerView(g, 'p1', { code: 'X', now: NOW, connected: () => true });
    expect(v0.final!.ranking.map((r) => r.rank)).toEqual([4]);
    expect(v0.final!.recap).toBeNull();
    goTo(g, 8, 'final', n - 1);
    expect(buildPlayerView(g, 'p1', { code: 'X', now: NOW, connected: () => true }).final!.ranking).toHaveLength(4);
    goTo(g, 8, 'final', finalStepNames(g).recap);
    const v = buildPlayerView(g, 'p1', { code: 'X', now: NOW, connected: () => true });
    expect(v.final!.recap).toHaveLength(8);
    expect(v.final!.titles).toBeNull();
    goTo(g, 8, 'final', finalStepNames(g).titles);
    expect(buildPlayerView(g, 'p1', { code: 'X', now: NOW, connected: () => true }).final!.titles).not.toBeNull();
  });

  it('restarts with the same players and settings but a new seed and fresh state', () => {
    const r = restartMatch(s, 777, NOW);
    expect(r.matchNumber).toBe(2);
    expect(r.players.map((p) => p.id)).toEqual(s.players.map((p) => p.id));
    expect(r.settings).toEqual(s.settings);
    expect(r.round).toBe(1);
    expect(r.phase).toBe('info');
    for (const p of r.players) expect(p.cash).toBe(CONFIG.startCash);
    expect(r.seed).toBe(777);
  });
});

describe('privacy of views', () => {
  it('the public (TV) view never contains private clues, wealth or orders', () => {
    const s = makeGame(4, 33);
    goTo(s, 2, 'market');
    applyAction(s, 'p1', { type: 'listCard', price: 40 }, NOW);
    const json = JSON.stringify(buildPublicView(s, { code: 'X', now: NOW, connected: () => true }));
    expect(json).not.toContain('"cash"');
    expect(json).not.toContain('"inventory"');
    expect(json).not.toContain('"clues"');
    expect(json).not.toContain('wealth');
  });
  it('a player view only holds their own clue before the reveal', () => {
    const s = makeGame(4, 33);
    const v = buildPlayerView(s, 'p2', { code: 'X', now: NOW, connected: () => true });
    expect(v.me.clue).toEqual(currentRound(s).clues.p2);
    expect(JSON.stringify(v)).not.toContain(currentRound(s).clues.p1.id + '"');
  });
  it('events stay hidden until the reveal reaches them', () => {
    const s = makeGame(4, 33);
    goTo(s, 1, 'reveal');
    const v = buildPlayerView(s, 'p1', { code: 'X', now: NOW, connected: () => true });
    expect(v.reveal!.events).toHaveLength(0);
    expect(v.me.privateResult).toBeNull();
  });
});
