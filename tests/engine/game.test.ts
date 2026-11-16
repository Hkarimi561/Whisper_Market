import { describe, expect, it } from 'vitest';
import { applyAction } from '../../src/engine/actions';
import { advance, currentRound, getPlayer, listClueCard, buyClueCard, proposeTrade, registerClaim, respondTrade, setOrders, totals } from '../../src/engine/game';
import { buildPlayerView, buildPublicView } from '../../src/engine/views';
import { NOW, errCode, goTo, makeGame } from './helpers';

const viewOpts = { code: 'ABCD', now: NOW, connected: () => true };

describe('phase flow and unlocks', () => {
  it('runs info → tribune → market → orders → reveal → next round', () => {
    const s = makeGame(4, 3);
    expect(s.phase).toBe('info');
    advance(s, NOW);
    expect(s.phase).toBe('tribune');
    for (let i = 0; i < 4; i++) advance(s, NOW); // four speakers
    expect(s.phase).toBe('market');
    advance(s, NOW);
    expect(s.phase).toBe('orders');
    advance(s, NOW);
    expect(s.phase).toBe('reveal');
    goTo(s, 2, 'info');
    expect(s.round).toBe(2);
  });

  it('rotates the speaking order: last round\'s first speaker goes last', () => {
    const s = makeGame(4, 5);
    const r1 = currentRound(s).speakerOrder;
    goTo(s, 2, 'info');
    const r2 = currentRound(s).speakerOrder;
    expect(r2[r2.length - 1]).toBe(r1[0]);
    expect(r2[0]).toBe(r1[1]);
  });

  it('bots are skipped in the tribune', () => {
    const s = makeGame(4, 5, {}, true);
    expect(currentRound(s).speakerOrder).toEqual([]);
    advance(s, NOW);
    expect(s.phase).toBe('market');
  });

  it('trades, clue cards and auctions unlock gradually', () => {
    const s = makeGame(4, 9);
    goTo(s, 1, 'market');
    expect(errCode(() => proposeTrade(s, 'p1', 'p2', { goods: { iron: 1 }, coins: 0 }, { goods: {}, coins: 100 }))).toBe('locked');
    expect(errCode(() => listClueCard(s, 'p1', 50))).toBe('locked');
    expect(currentRound(s).contractAnnounced).toBeNull();
    goTo(s, 2, 'info');
    expect(currentRound(s).contractAnnounced).not.toBeNull();
    expect(currentRound(s).contractAuction).toBeNull();
    goTo(s, 3, 'info');
    expect(currentRound(s).contractAuction).not.toBeNull();
    goTo(s, 5, 'info');
    expect(currentRound(s).contractAnnounced).not.toBeNull();
    goTo(s, 6, 'info');
    expect(currentRound(s).contractAuction).not.toBeNull();
  });

  it('ready tap by every human ends the phase early', () => {
    const s = makeGame(3, 2);
    applyAction(s, 'p1', { type: 'ready' }, NOW);
    applyAction(s, 'p2', { type: 'ready' }, NOW);
    expect(s.phase).toBe('info');
    applyAction(s, 'p3', { type: 'ready' }, NOW);
    expect(s.phase).toBe('tribune');
  });

  it('is deterministic given a seed', () => {
    const a = makeGame(4, 42);
    const b = makeGame(4, 42);
    goTo(a, 4, 'market');
    goTo(b, 4, 'market');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('claims and footprints', () => {
  it('allows at most 2 claims per round, one per good', () => {
    const s = makeGame(4, 7);
    goTo(s, 1, 'market');
    registerClaim(s, 'p1', 'iron', 'up');
    expect(errCode(() => registerClaim(s, 'p1', 'iron', 'down'))).toBe('duplicate-claim');
    registerClaim(s, 'p1', 'wheat', 'down');
    expect(errCode(() => registerClaim(s, 'p1', 'fuel', 'up'))).toBe('too-many-claims');
  });

  it('evaluates claims against events and footprints', () => {
    const s = makeGame(4, 7);
    goTo(s, 1, 'market');
    const r = currentRound(s);
    // force a known event set
    r.events = [
      { id: 'x1', templateId: 't', text: 't', target: 'iron', direction: 'up', magnitude: 'medium', effect: 0.2, clued: true },
      { id: 'x2', templateId: 't', text: 't', target: 'wheat', direction: 'down', magnitude: 'low', effect: -0.1, clued: false },
    ];
    registerClaim(s, 'p1', 'iron', 'up'); // true
    registerClaim(s, 'p2', 'iron', 'down'); // false
    registerClaim(s, 'p3', 'fuel', 'up'); // no event
    registerClaim(s, 'p4', 'wheat', 'up'); // false, and p4 will sell -> consistent; p4 buys wheat? no
    advance(s, NOW); // orders
    setOrders(s, 'p2', { orders: { iron: 2 } }, true, NOW); // p2 claimed down but buys -> conflict
    advance(s, NOW); // reveal
    const ev = currentRound(s).result!.claimEvals;
    const by = (p: string) => ev.find((e) => e.playerId === p)!;
    expect(by('p1').net).toBe('true');
    expect(by('p2').net).toBe('false');
    expect(by('p2').footprint).toBe('buy');
    expect(by('p2').footprintConflict).toBe(true);
    expect(by('p3').net).toBe('noEvent');
    expect(by('p4').net).toBe('false');
    const fp = currentRound(s).result!.footprints;
    expect(fp.p2.iron).toBe('buy');
    expect(fp.p1.iron).toBe('none');
  });

  it('mixed events on the same good are reported honestly', () => {
    const s = makeGame(4, 7);
    goTo(s, 1, 'market');
    const r = currentRound(s);
    r.events = [
      { id: 'x1', templateId: 't', text: 't', target: 'iron', direction: 'up', magnitude: 'high', effect: 0.3, clued: true },
      { id: 'x2', templateId: 't', text: 't', target: 'iron', direction: 'down', magnitude: 'low', effect: -0.1, clued: false },
    ];
    registerClaim(s, 'p1', 'iron', 'up');
    advance(s, NOW);
    advance(s, NOW);
    const e = currentRound(s).result!.claimEvals[0];
    expect(e.matched).toBe(1);
    expect(e.contradicted).toBe(1);
    expect(e.net).toBe('true');
  });
});

describe('direct trades', () => {
  const setup = () => {
    const s = makeGame(4, 11);
    goTo(s, 2, 'market');
    getPlayer(s, 'p1').inventory.iron = 3;
    getPlayer(s, 'p2').cash = 1000;
    return s;
  };

  it('executes atomically on acceptance and conserves cash and goods', () => {
    const s = setup();
    const before = totals(s);
    const price = s.prices.iron;
    const offer = proposeTrade(s, 'p1', 'p2', { goods: { iron: 2 }, coins: 0 }, { goods: {}, coins: price * 2 });
    respondTrade(s, 'p2', offer.id, true);
    expect(getPlayer(s, 'p1').inventory.iron).toBe(1);
    expect(getPlayer(s, 'p2').inventory.iron).toBe(2);
    expect(getPlayer(s, 'p1').cash).toBe(1000 + price * 2);
    const after = totals(s);
    expect(after.cash).toBe(before.cash);
    expect(after.goods).toEqual(before.goods);
    expect(currentRound(s).trades).toHaveLength(1);
  });

  it('rejects prices outside the ±50% band', () => {
    const s = setup();
    const price = s.prices.iron;
    expect(errCode(() => proposeTrade(s, 'p1', 'p2', { goods: { iron: 1 }, coins: 0 }, { goods: {}, coins: Math.floor(price * 1.6) }))).toBe('trade-band');
    expect(errCode(() => proposeTrade(s, 'p1', 'p2', { goods: { iron: 1 }, coins: 0 }, { goods: {}, coins: Math.floor(price * 0.4) }))).toBe('trade-band');
  });

  it('fails without changing anything when an asset is missing or the warehouse is full', () => {
    const s = setup();
    const price = s.prices.iron;
    const offer = proposeTrade(s, 'p1', 'p2', { goods: { iron: 2 }, coins: 0 }, { goods: {}, coins: price * 2 });
    getPlayer(s, 'p2').cash = 5;
    const snapshot = JSON.stringify(s.players);
    expect(errCode(() => respondTrade(s, 'p2', offer.id, true))).toBe('not-enough-assets');
    expect(JSON.stringify(s.players)).toBe(snapshot);

    getPlayer(s, 'p2').cash = 1000;
    getPlayer(s, 'p2').inventory.wheat = 12;
    getPlayer(s, 'p1').inventory.iron = 3;
    const o2 = proposeTrade(s, 'p1', 'p2', { goods: { iron: 2 }, coins: 0 }, { goods: {}, coins: price * 2 });
    const snap2 = JSON.stringify(s.players);
    expect(errCode(() => respondTrade(s, 'p2', o2.id, true))).toBe('warehouse-full');
    expect(JSON.stringify(s.players)).toBe(snap2);
  });

  it('only the addressed player may answer, and trades never move execution prices', () => {
    const s = setup();
    const price = s.prices.iron;
    const offer = proposeTrade(s, 'p1', 'p2', { goods: { iron: 1 }, coins: 0 }, { goods: {}, coins: price });
    expect(errCode(() => respondTrade(s, 'p3', offer.id, true))).toBe('not-your-offer');
    respondTrade(s, 'p2', offer.id, true);
    advance(s, NOW);
    advance(s, NOW);
    expect(currentRound(s).result!.netDemand.iron).toBe(0);
    expect(currentRound(s).result!.execPrices.iron).toBe(price);
  });

  it('public reveal shows participants and goods but not amounts', () => {
    const s = setup();
    const price = s.prices.iron;
    const offer = proposeTrade(s, 'p1', 'p2', { goods: { iron: 1 }, coins: 0 }, { goods: {}, coins: price });
    respondTrade(s, 'p2', offer.id, true);
    advance(s, NOW);
    advance(s, NOW);
    const r = currentRound(s);
    s.step = r.revealSteps.findIndex((x) => x.kind === 'trades');
    const v = buildPublicView(s, viewOpts);
    expect(v.reveal!.trades).toEqual([{ from: 'p1', to: 'p2', goods: ['iron'] }]);
  });
});

describe('clue cards', () => {
  const setup = () => {
    const s = makeGame(5, 13);
    goTo(s, 2, 'market');
    return s;
  };
  it('sells the same card to several buyers and delivers the true clue', () => {
    const s = setup();
    const before = totals(s);
    listClueCard(s, 'p1', 60);
    buyClueCard(s, 'p2', 'p1');
    buyClueCard(s, 'p3', 'p1');
    const r = currentRound(s);
    expect(r.cards[0].buyers).toEqual(['p2', 'p3']);
    expect(r.purchases.map((p) => p.clue.id)).toEqual([r.clues.p1.id, r.clues.p1.id]);
    expect(getPlayer(s, 'p1').cash).toBe(1000 + 120);
    expect(getPlayer(s, 'p2').cash).toBe(940);
    expect(totals(s).cash).toBe(before.cash);
  });
  it('previews hide the full clue; sold count is public', () => {
    const s = setup();
    listClueCard(s, 'p1', 60);
    buyClueCard(s, 'p2', 'p1');
    const v = buildPlayerView(s, 'p3', viewOpts);
    expect(v.cards[0].soldCount).toBe(1);
    const json = JSON.stringify(v.cards[0]);
    expect(json).not.toContain('direction":"');
    expect(v.me.purchases).toHaveLength(0);
  });
  it('enforces the price cap, no self purchase, no double purchase, enough cash', () => {
    const s = setup();
    expect(errCode(() => listClueCard(s, 'p1', 201))).toBe('bad-price');
    listClueCard(s, 'p1', 200);
    expect(errCode(() => buyClueCard(s, 'p1', 'p1'))).toBe('own-card');
    buyClueCard(s, 'p2', 'p1');
    expect(errCode(() => buyClueCard(s, 'p2', 'p1'))).toBe('already-bought');
    getPlayer(s, 'p3').cash = 10;
    expect(errCode(() => buyClueCard(s, 'p3', 'p1'))).toBe('not-enough-cash');
  });
  it('a buyer cannot list a purchased clue: a card always holds the seller\'s own dealt clue', () => {
    const s = setup();
    listClueCard(s, 'p1', 60);
    buyClueCard(s, 'p2', 'p1');
    listClueCard(s, 'p2', 30);
    const r = currentRound(s);
    expect(r.cards.find((c) => c.sellerId === 'p2')!.clueId).toBe(r.clues.p2.id);
    expect(r.clues.p2.id).not.toBe(r.clues.p1.id);
  });
});

describe('warehouse capacity setting', () => {
  it('is sanitised, used by trades, and bots play with a larger warehouse', async () => {
    const s = makeGame(4, 11, { warehouseCapacity: 16 });
    expect(s.settings.warehouseCapacity).toBe(16);
    expect(makeGame(4, 11, { warehouseCapacity: 999 }).settings.warehouseCapacity).toBe(40);
    goTo(s, 2, 'market');
    getPlayer(s, 'p1').inventory.iron = 3;
    getPlayer(s, 'p2').inventory.wheat = 14; // would overflow at 12, fits at 16
    const price = s.prices.iron;
    const o = proposeTrade(s, 'p1', 'p2', { goods: { iron: 2 }, coins: 0 }, { goods: {}, coins: price * 2 });
    respondTrade(s, 'p2', o.id, true);
    expect(getPlayer(s, 'p2').inventory.iron).toBe(2);
    const { runBotMatch } = await import('../../src/engine/sim');
    const res = runBotMatch({ seed: 5, bots: 4, settings: { warehouseCapacity: 20 } });
    expect(res.errors).toEqual([]);
    for (const p of res.state.players) expect(Object.values(p.inventory).reduce((x, y) => x + y, 0)).toBeLessThanOrEqual(20);
  });
});
