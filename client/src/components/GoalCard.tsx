import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import { SavingsGoal } from '../types';
import { formatCurrency, localDateString } from '../utils/format';
import { isGoalStalled, shouldRemindStalledGoals } from '../utils/goals';
import Spinner from './Spinner';

interface GoalCardProps {
  goal: SavingsGoal;
  householdId: number;
  onChange: () => void;
}

export default function GoalCard({ goal, householdId, onChange }: GoalCardProps) {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const percent = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));

  async function handleContribute(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setSubmitting(true);
    try {
      await api.post(`/households/${householdId}/goals/${goal.id}/contribute`, {
        amount: Number(amount),
        contributedOn: localDateString(),
      });
      setAmount('');
      onChange();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="goal-card card">
      <h3>{goal.name}</h3>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="muted small">
        {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)} ({percent}%)
      </p>
      {goal.targetDate && <p className="muted small">목표일: {goal.targetDate}</p>}
      {shouldRemindStalledGoals() && isGoalStalled(goal) && <p className="warning">이번 달 아직 저축 안 하셨어요</p>}
      <form onSubmit={handleContribute} className="inline-form">
        <input type="number" placeholder="적립할 금액" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button type="submit" disabled={submitting}>
          {submitting && <Spinner size="sm" variant="on-primary" />}
          적립
        </button>
      </form>
    </div>
  );
}
