import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDb, ok } from './helpers/fakeDb.js';

vi.mock('../src/config/db.js', async () => ({ pool: (await import('./helpers/fakeDb.js')).fakeDb.pool }));

const { syncRecurringTransactions, invalidateRecurringSync } = await import('../src/utils/recurring.js');

const RULE = {
  id: 5,
  user_id: 1,
  category_id: 3,
  type: 'expense',
  amount: 500000,
  memo: null,
  day_of_month: 1,
  split_type: 'shared',
  payer_share_percent: 60,
};

describe('syncRecurringTransactions (고정비 자동 기록)', () => {
  beforeEach(() => {
    fakeDb.reset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 25, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('이번 달 치가 없는 규칙을 기록하고, 규칙의 분담 비율을 그대로 복사한다', async () => {
    fakeDb.on(/SELECT \* FROM recurring_transactions/, [RULE]);
    fakeDb.on(/UPDATE recurring_transactions/, ok());
    fakeDb.on(/INSERT INTO transactions/, ok({ insertId: 99 }));

    await syncRecurringTransactions(101);

    const [insert] = fakeDb.callsMatching(/INSERT INTO transactions/);
    // (household, user, category, type, amount, memo, occurred_on, split_type, payer_share_percent)
    expect(insert.params).toEqual([101, 1, 3, 'expense', 500000, '(고정비 자동 등록)', '2026-11-01', 'shared', 60]);
  });

  it('다른 요청이 먼저 선점했으면(affectedRows 0) 두 번 만들지 않는다', async () => {
    fakeDb.on(/SELECT \* FROM recurring_transactions/, [RULE]);
    fakeDb.on(/UPDATE recurring_transactions/, ok({ affectedRows: 0 }));

    await syncRecurringTransactions(102);
    expect(fakeDb.callsMatching(/INSERT INTO transactions/)).toHaveLength(0);
  });

  it('동시에 여러 번 불러도 확인은 한 번만 한다', async () => {
    fakeDb.on(/SELECT \* FROM recurring_transactions/, []);
    await Promise.all([syncRecurringTransactions(103), syncRecurringTransactions(103), syncRecurringTransactions(103)]);
    expect(fakeDb.callsMatching(/SELECT \* FROM recurring_transactions/)).toHaveLength(1);
  });

  it('1분 안에 다시 부르면 건너뛰고, 1분이 지나면 다시 확인한다', async () => {
    fakeDb.on(/SELECT \* FROM recurring_transactions/, []);
    await syncRecurringTransactions(104);
    vi.advanceTimersByTime(30_000);
    await syncRecurringTransactions(104);
    expect(fakeDb.callsMatching(/SELECT \* FROM recurring_transactions/)).toHaveLength(1);

    vi.advanceTimersByTime(31_000);
    await syncRecurringTransactions(104);
    expect(fakeDb.callsMatching(/SELECT \* FROM recurring_transactions/)).toHaveLength(2);
  });

  it('고정비를 등록/켜면(invalidate) 1분을 기다리지 않고 바로 다시 확인한다', async () => {
    fakeDb.on(/SELECT \* FROM recurring_transactions/, []);
    await syncRecurringTransactions(105);
    invalidateRecurringSync(105);
    await syncRecurringTransactions(105);
    expect(fakeDb.callsMatching(/SELECT \* FROM recurring_transactions/)).toHaveLength(2);
  });

  it('실패하면 다음에 다시 시도한다 (실패를 "확인함"으로 기억하지 않음)', async () => {
    fakeDb.on(/SELECT \* FROM recurring_transactions/, () => {
      throw new Error('db down');
    });
    await expect(syncRecurringTransactions(106)).rejects.toThrow('db down');
    fakeDb.on(/SELECT \* FROM recurring_transactions/, []);
    await syncRecurringTransactions(106);
    expect(fakeDb.callsMatching(/SELECT \* FROM recurring_transactions/)).toHaveLength(2);
  });
});
