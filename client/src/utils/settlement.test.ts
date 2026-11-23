import { describe, expect, it } from 'vitest';
import { computeBalances, computeTransfers, SplitLike } from './settlement';

const A = 1;
const B = 2;
const C = 3;

function tx(userId: number, amount: number, payerSharePercent = 50): SplitLike {
  return { userId, amount, payerSharePercent };
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

describe('computeBalances (받을 돈 + / 보낼 돈 -)', () => {
  it('2명 1:1: 낸 사람은 절반을 돌려받는다', () => {
    const balances = computeBalances([tx(A, 10000)], [A, B]);
    expect(balances.get(A)).toBe(5000);
    expect(balances.get(B)).toBe(-5000);
  });

  it('2명 6:4: 낸 사람이 60%를 부담한다', () => {
    const balances = computeBalances([tx(A, 10000, 60)], [A, B]);
    expect(balances.get(A)).toBe(4000);
    expect(balances.get(B)).toBe(-4000);
  });

  it('3명 이상이면 기본값(50%)은 전원 균등 분할로 본다', () => {
    const balances = computeBalances([tx(A, 90000), tx(B, 30000)], [A, B, C]);
    // 총 12만원, 1인당 4만원
    expect(balances.get(A)).toBe(50000);
    expect(balances.get(B)).toBe(-10000);
    expect(balances.get(C)).toBe(-40000);
  });

  it('3명 이상 + 다른 비율이면 낸 사람이 그 비율, 나머지를 다른 사람이 균등 분할', () => {
    const balances = computeBalances([tx(A, 10000, 70)], [A, B, C]);
    expect(balances.get(A)).toBe(3000);
    expect(balances.get(B)).toBe(-1500);
    expect(balances.get(C)).toBe(-1500);
  });

  it('원 단위로 안 나눠떨어져도 합계가 정확히 0이다', () => {
    const balances = computeBalances([tx(A, 10001), tx(B, 3333, 61), tx(C, 7)], [A, B, C]);
    expect(sum(balances.values())).toBe(0);
  });

  it('가계부를 나간 사람이 낸 지출은 건너뛴다', () => {
    const balances = computeBalances([tx(99, 10000)], [A, B]);
    expect(balances.get(A)).toBe(0);
    expect(balances.get(B)).toBe(0);
  });

  it('구성원이 1명이면 정산할 게 없다', () => {
    const balances = computeBalances([tx(A, 10000)], [A]);
    expect(balances.get(A)).toBe(0);
  });
});

describe('computeTransfers (누가 누구에게 얼마)', () => {
  it('이미 딱 맞으면 송금이 없다', () => {
    expect(computeTransfers(new Map([[A, 0], [B, 0]]))).toEqual([]);
  });

  it('2명이면 한 번 송금', () => {
    expect(computeTransfers(new Map([[A, 5000], [B, -5000]]))).toEqual([{ fromUserId: B, toUserId: A, amount: 5000 }]);
  });

  it('3명 예시: C→A 4만원, B→A 1만원', () => {
    const transfers = computeTransfers(new Map([[A, 50000], [B, -10000], [C, -40000]]));
    expect(transfers).toEqual([
      { fromUserId: C, toUserId: A, amount: 40000 },
      { fromUserId: B, toUserId: A, amount: 10000 },
    ]);
  });

  it('무작위 지출에서도 송금 후 전원 0이 되고, 송금은 최대 (인원 - 1)번이다', () => {
    // 테스트가 매번 같은 결과를 내도록 간단한 고정 시드 난수를 쓴다.
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let round = 0; round < 300; round++) {
      const members = Array.from({ length: 2 + rand(5) }, (_, i) => 10 + i);
      const txs = Array.from({ length: rand(30) }, () =>
        tx(members[rand(members.length)], 1 + rand(300000), [50, 50, 60, 70, 1 + rand(99)][rand(5)])
      );
      const balances = computeBalances(txs, members);
      expect(sum(balances.values())).toBe(0);

      const transfers = computeTransfers(balances);
      expect(transfers.length).toBeLessThanOrEqual(members.length - 1);
      const after = new Map(balances);
      for (const t of transfers) {
        expect(t.amount).toBeGreaterThan(0);
        after.set(t.fromUserId, after.get(t.fromUserId)! + t.amount);
        after.set(t.toUserId, after.get(t.toUserId)! - t.amount);
      }
      expect([...after.values()].every((v) => v === 0)).toBe(true);
    }
  });
});
