import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SavingsGoal } from '../types';
import { formatCurrency, localDateString } from '../utils/format';
import { isGoalStalled, shouldRemindStalledGoals } from '../utils/goals';
import { readDismissed, writeDismissed } from '../utils/storage';

// 목표 저축 정체 리마인드. 이번 달 아직 한 번도 적립 안 한 목표가 있으면(15일부터) 대시보드에 알려준다.
// 닫으면 그달엔 다시 안 띄우고, 다음 달 15일에 여전히 정체돼 있으면 다시 보인다.
export default function GoalReminderBanner({ householdId, goals }: { householdId: number; goals: SavingsGoal[] }) {
  const thisMonth = localDateString().slice(0, 7);
  const storageKey = `goalReminderDismissed:${householdId}`;
  const [dismissed, setDismissed] = useState(() => readDismissed(storageKey) === thisMonth);

  const stalled = goals.filter((g) => isGoalStalled(g));
  if (dismissed || !shouldRemindStalledGoals() || stalled.length === 0) return null;

  return (
    <section className="card upcoming-banner goal-reminder" role="status">
      <div className="upcoming-banner-header">
        <p className="upcoming-banner-title">🐷 이번 달 아직 저축 안 하셨어요</p>
        <button
          type="button"
          className="upcoming-banner-close"
          aria-label="이번 달 그만 보기"
          onClick={() => {
            writeDismissed(storageKey, thisMonth);
            setDismissed(true);
          }}
        >
          ×
        </button>
      </div>
      <ul className="upcoming-banner-list">
        {stalled.map((g) => (
          <li key={g.id}>
            <span>{g.name}</span>
            <span className="muted">
              {formatCurrency(g.currentAmount)} / {formatCurrency(g.targetAmount)}
            </span>
          </li>
        ))}
      </ul>
      <Link to="/goals" className="small">
        지금 적립하러 가기
      </Link>
    </section>
  );
}
