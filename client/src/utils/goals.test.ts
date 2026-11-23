import { describe, expect, it } from 'vitest';
import { SavingsGoal } from '../types';
import { isGoalStalled, shouldRemindStalledGoals } from './goals';

const NOW = new Date(2026, 10, 20); // 2026-11-20

const goal = (patch: Partial<SavingsGoal>): SavingsGoal => ({
  id: 1,
  name: '제주도 여행',
  targetAmount: 1000000,
  currentAmount: 300000,
  targetDate: null,
  createdAt: '2026-08-01 10:00:00',
  lastContributedOn: '2026-10-05',
  ...patch,
});

describe('isGoalStalled', () => {
  it('이번 달 적립이 없으면 정체', () => expect(isGoalStalled(goal({}), NOW)).toBe(true));
  it('한 번도 적립 안 했으면 정체', () => expect(isGoalStalled(goal({ lastContributedOn: null }), NOW)).toBe(true));
  it('이번 달 적립했으면 정체 아님', () =>
    expect(isGoalStalled(goal({ lastContributedOn: '2026-11-02' }), NOW)).toBe(false));
  it('달성한 목표는 정체 아님', () => expect(isGoalStalled(goal({ currentAmount: 1000000 }), NOW)).toBe(false));
  it('이번 달에 만든 목표는 아직 정체라고 보지 않는다', () =>
    expect(isGoalStalled(goal({ createdAt: '2026-11-10 09:00:00', lastContributedOn: null }), NOW)).toBe(false));
});

describe('shouldRemindStalledGoals', () => {
  it('15일 전엔 리마인드하지 않는다', () => expect(shouldRemindStalledGoals(new Date(2026, 10, 14))).toBe(false));
  it('15일부터 리마인드한다', () => expect(shouldRemindStalledGoals(new Date(2026, 10, 15))).toBe(true));
});
