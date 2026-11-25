import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeBalances, computeTransfers } from '../src/utils/settlement.js';

describe('서버 정산 계산', () => {
  it('2명 6:4', () => {
    const b = computeBalances([{ userId: 1, amount: 10000, payerSharePercent: 60 }], [1, 2]);
    expect([b.get(1), b.get(2)]).toEqual([4000, -4000]);
  });

  it('3명 균등 분할과 송금 목록', () => {
    const b = computeBalances(
      [
        { userId: 1, amount: 90000, payerSharePercent: 50 },
        { userId: 2, amount: 30000, payerSharePercent: 50 },
      ],
      [1, 2, 3]
    );
    expect(computeTransfers(b)).toEqual([
      { fromUserId: 3, toUserId: 1, amount: 40000 },
      { fromUserId: 2, toUserId: 1, amount: 10000 },
    ]);
  });

  // 더치페이 미리보기용으로 같은 코드가 client/src/utils/settlement.ts에 복사돼 있다.
  // 한쪽만 고치면 미리보기 금액과 실제 정산 금액이 달라지니, 둘이 똑같은지 여기서 확인한다.
  it('클라이언트에 복사된 정산 코드와 내용이 같다', () => {
    const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
    // 맨 위 설명 주석(어느 쪽 복사본인지 적은 부분)만 빼고 비교한다.
    const body = (src: string) => src.slice(src.indexOf('export interface SplitLike'));
    expect(body(read('../../client/src/utils/settlement.ts'))).toBe(body(read('../src/utils/settlement.ts')));
  });
});
