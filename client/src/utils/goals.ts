import { SavingsGoal } from '../types';
import { localDateString } from './format';

// 월초부터 "아직 저축 안 하셨어요"라고 하면 잔소리처럼 느껴지니, 이 날짜부터만 리마인드한다.
export const STALL_REMIND_FROM_DAY = 15;

// 이번 달 아직 한 번도 적립하지 않은, 진행 중인 목표인지.
// 이번 달에 새로 만든 목표는 "정체"라고 보기 이르니 제외한다.
// createdAt은 서버 시간(UTC) 기준이라 월 경계에서 몇 시간 어긋날 수 있지만, 판단이 하루 늦어질 뿐이라 감수한다.
export function isGoalStalled(goal: SavingsGoal, now: Date = new Date()): boolean {
  if (goal.currentAmount >= goal.targetAmount) return false;
  const thisMonth = localDateString(now).slice(0, 7);
  if (goal.createdAt.slice(0, 7) >= thisMonth) return false;
  return !goal.lastContributedOn || goal.lastContributedOn.slice(0, 7) < thisMonth;
}

export function shouldRemindStalledGoals(now: Date = new Date()): boolean {
  return now.getDate() >= STALL_REMIND_FROM_DAY;
}
