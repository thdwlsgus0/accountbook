import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useHousehold } from '../context/HouseholdContext';
import QuickAddForm from '../components/QuickAddForm';
import TransactionList from '../components/TransactionList';
import BudgetBar from '../components/BudgetBar';
import { Category, MonthSummary, SavingsGoal, Transaction } from '../types';
import { formatCurrency } from '../utils/format';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DashboardPage() {
  const { currentId } = useHousehold();
  const [month, setMonth] = useState(currentYearMonth());
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentId) return;
    setLoading(true);
    const [summaryRes, categoriesRes, transactionsRes, goalsRes] = await Promise.all([
      api.get<MonthSummary>(`/households/${currentId}/summary`, { params: { month } }),
      api.get<{ categories: Category[] }>(`/households/${currentId}/categories`),
      api.get<{ transactions: Transaction[] }>(`/households/${currentId}/transactions`, { params: { month } }),
      api.get<{ goals: SavingsGoal[] }>(`/households/${currentId}/goals`),
    ]);
    setSummary(summaryRes.data);
    setCategories(categoriesRes.data.categories);
    setTransactions(transactionsRes.data.transactions);
    setGoals(goalsRes.data.goals);
    setLoading(false);
  }, [currentId, month]);

  useEffect(() => {
    load();
  }, [load]);

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }

  if (loading || !summary || !currentId) {
    return <div className="center-message">불러오는 중...</div>;
  }

  const budgetCategories = summary.categories.filter((c) => c.budgetLimit != null);

  return (
    <div className="page">
      <div className="month-nav">
        <button onClick={() => shiftMonth(-1)}>이전 달</button>
        <h2>{month}</h2>
        <button onClick={() => shiftMonth(1)}>다음 달</button>
      </div>

      <div className="summary-cards">
        <div className="card summary-card income">
          <p className="muted">수입</p>
          <p className="summary-amount">{formatCurrency(summary.income)}</p>
        </div>
        <div className="card summary-card expense">
          <p className="muted">지출</p>
          <p className="summary-amount">{formatCurrency(summary.expense)}</p>
        </div>
        <div className="card summary-card balance">
          <p className="muted">남은 돈</p>
          <p className="summary-amount">{formatCurrency(summary.balance)}</p>
        </div>
      </div>

      <QuickAddForm householdId={currentId} categories={categories} onAdded={load} />

      {budgetCategories.length > 0 && (
        <section className="card">
          <h3>예산 현황</h3>
          {budgetCategories.map((c) => (
            <BudgetBar key={c.categoryId} category={c} />
          ))}
        </section>
      )}

      {goals.length > 0 && (
        <section>
          <h3>공동 목표</h3>
          <div className="goal-grid">
            {goals.slice(0, 2).map((g) => {
              const percent = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
              return (
                <div key={g.id} className="card">
                  <p>{g.name}</p>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="muted small">
                    {formatCurrency(g.currentAmount)} / {formatCurrency(g.targetAmount)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="card">
        <h3>최근 내역</h3>
        <TransactionList transactions={transactions.slice(0, 8)} />
      </section>
    </div>
  );
}
