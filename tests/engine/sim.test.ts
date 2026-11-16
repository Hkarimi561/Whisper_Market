import { describe, expect, it } from 'vitest';
import { runBotMatch } from '../../src/engine/sim';

describe('bot simulation', () => {
  it('4 bots play a full 8-round game with a fixed seed: no errors, conservation holds', () => {
    const res = runBotMatch({ seed: 12345, bots: 4 });
    expect(res.errors).toEqual([]);
    expect(res.state.phase).toBe('final');
    expect(res.state.rounds).toHaveLength(8);
    expect(res.state.final!.ranking).toHaveLength(4);
    expect(res.actionsApplied).toBeGreaterThan(20);
    expect(res.conservationChecks).toBeGreaterThan(0);
    for (const p of res.state.players) {
      expect(p.cash).toBeGreaterThanOrEqual(0);
      const units = Object.values(p.inventory).reduce((a, b) => a + b, 0);
      expect(units).toBeLessThanOrEqual(12);
      for (const v of Object.values(p.inventory)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('is fully deterministic for the same seed', () => {
    const a = runBotMatch({ seed: 777, bots: 4 });
    const b = runBotMatch({ seed: 777, bots: 4 });
    expect(JSON.stringify(a.state.final)).toBe(JSON.stringify(b.state.final));
  });

  it('works for every table size and round count without errors', () => {
    for (let n = 3; n <= 6; n++) {
      for (const rounds of [6, 8, 10]) {
        const res = runBotMatch({ seed: n * 100 + rounds, bots: n, settings: { rounds } });
        expect(res.errors).toEqual([]);
        expect(res.state.rounds).toHaveLength(rounds);
      }
    }
  });

  it('exercises auctions, clue sales and trades across many seeds', () => {
    let auctions = 0;
    let sales = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const res = runBotMatch({ seed, bots: 5 });
      expect(res.errors).toEqual([]);
      for (const r of res.state.rounds) {
        if (r.result?.auction?.winnerId) auctions++;
        sales += r.purchases.length;
      }
    }
    expect(auctions).toBeGreaterThan(0);
    expect(sales).toBeGreaterThan(0);
  });
});
