import { describe, expect, it } from 'vitest';
import { BASE_PRICES } from '../../src/engine/config';
import { checkTradeBand, emptyInventory, executionPrice, nextPrice, resolveOrders } from '../../src/engine/prices';
import type { PlayerOrders } from '../../src/engine/types';

const goods = ['wheat', 'fuel', 'iron', 'medicine'] as const;
const prices = { ...BASE_PRICES };
const po = (orders: PlayerOrders['orders']): PlayerOrders => ({ orders, bid: null, sealed: true });

describe('execution price', () => {
  it('moves 2% per unit of net demand', () => {
    expect(executionPrice(100, 0)).toBe(100);
    expect(executionPrice(100, 5)).toBe(110);
    expect(executionPrice(100, -5)).toBe(90);
  });
  it('is clamped between 50% and 200%', () => {
    expect(executionPrice(100, 1000)).toBe(200);
    expect(executionPrice(100, -1000)).toBe(50);
  });
});

describe('next price', () => {
  it('applies event effects and carries half of the execution impact', () => {
    // current 100, exec 110 (+10), events +20% -> 100*1.2 + 5 = 125
    expect(nextPrice('iron', 100, 110, 0.2)).toBe(125);
    expect(nextPrice('iron', 100, 90, -0.1)).toBe(85);
  });
  it('never drops below 20% of the base price', () => {
    expect(nextPrice('iron', 21, 10, -0.9)).toBe(20);
  });
  it('pumping does not pay: carry-over is only half the impact', () => {
    const exec = executionPrice(100, 10); // 120
    expect(nextPrice('iron', 100, exec, 0)).toBe(110);
  });
});

describe('order resolution', () => {
  const mk = (cash: number, inv: Partial<Record<(typeof goods)[number], number>> = {}) => ({
    id: '',
    cash,
    inventory: { ...emptyInventory(), ...inv },
  });
  it('scales buys down by cash and every scaled buy stays affordable', () => {
    const a = { ...mk(250), id: 'a' };
    const out = resolveOrders([a], { a: po({ iron: 5 }) }, prices, [...goods]);
    expect(out.executed.a.iron).toBe(2);
    expect(out.execPrices.iron).toBe(104);
    expect(2 * out.execPrices.iron).toBeLessThanOrEqual(250);
  });
  it('scales buys down by warehouse capacity', () => {
    const a = { ...mk(100000, { wheat: 10 }), id: 'a' };
    const out = resolveOrders([a], { a: po({ iron: 5 }) }, prices, [...goods]);
    expect(out.executed.a.iron).toBe(2);
  });
  it('selling frees capacity for buying in the same round', () => {
    const a = { ...mk(100000, { wheat: 12 }), id: 'a' };
    const out = resolveOrders([a], { a: po({ wheat: -4, iron: 4 }) }, prices, [...goods]);
    expect(out.executed.a.iron).toBe(4);
    expect(out.executed.a.wheat).toBe(-4);
  });
  it('limits sells to holdings and ignores shorting', () => {
    const a = { ...mk(1000, { iron: 2 }), id: 'a' };
    const out = resolveOrders([a], { a: po({ iron: -9, fuel: -3 }) }, prices, [...goods]);
    expect(out.executed.a.iron).toBe(-2);
    expect(out.executed.a.fuel).toBeUndefined();
  });
  it('everybody pays the same execution price; net demand includes all players', () => {
    const a = { ...mk(5000), id: 'a' };
    const b = { ...mk(5000), id: 'b' };
    const c = { ...mk(5000, { iron: 3 }), id: 'c' };
    const out = resolveOrders([a, b, c], { a: po({ iron: 4 }), b: po({ iron: 3 }), c: po({ iron: -2 }) }, prices, [...goods]);
    expect(out.netDemand.iron).toBe(5);
    expect(out.execPrices.iron).toBe(110);
  });
  it('reserves cash for the auction bid', () => {
    const a = { ...mk(500), id: 'a' };
    const out = resolveOrders([a], { a: po({ iron: 5 }) }, prices, [...goods], { a: 300 });
    // 500 - 300 reserved = 200 spendable; at pass-1 price 110 that is one unit
    expect(out.executed.a.iron).toBe(1);
  });
});

describe('trade price band', () => {
  it('accepts pure goods-for-coins within +-50% and rejects outside', () => {
    const give = { goods: { iron: 2 }, coins: 0 };
    expect(checkTradeBand(give, { goods: {}, coins: 200 }, prices).ok).toBe(true);
    expect(checkTradeBand(give, { goods: {}, coins: 100 }, prices).ok).toBe(true);
    expect(checkTradeBand(give, { goods: {}, coins: 300 }, prices).ok).toBe(true);
    expect(checkTradeBand(give, { goods: {}, coins: 99 }, prices).ok).toBe(false);
    expect(checkTradeBand(give, { goods: {}, coins: 301 }, prices).ok).toBe(false);
  });
  it('requires goods and limits goods-for-goods value gaps', () => {
    expect(checkTradeBand({ goods: {}, coins: 100 }, { goods: {}, coins: 100 }, prices).ok).toBe(false);
    expect(checkTradeBand({ goods: { iron: 1 }, coins: 0 }, { goods: { wheat: 2 }, coins: 0 }, prices).ok).toBe(true);
    expect(checkTradeBand({ goods: { iron: 1 }, coins: 0 }, { goods: { wheat: 4 }, coins: 0 }, prices).ok).toBe(false);
  });
});

describe('configurable warehouse capacity', () => {
  it('scales buys by the given capacity', () => {
    const a = { id: 'a', cash: 100000, inventory: { ...emptyInventory(), wheat: 10 } };
    const small = resolveOrders([a], { a: po({ iron: 9 }) }, prices, [...goods], {}, 12);
    const big = resolveOrders([a], { a: po({ iron: 9 }) }, prices, [...goods], {}, 20);
    expect(small.executed.a.iron).toBe(2);
    expect(big.executed.a.iron).toBe(9);
  });
});
