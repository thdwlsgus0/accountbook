import { TouchEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useHousehold } from '../context/HouseholdContext';
import QuickAddForm from '../components/QuickAddForm';
import TransactionList from '../components/TransactionList';
import BudgetBar from '../components/BudgetBar';
import SettlementCard from '../components/SettlementCard';
import UpcomingRecurringBanner from '../components/UpcomingRecurringBanner';
import GoalReminderBanner from '../components/GoalReminderBanner';
import YearReportBanner from '../components/YearReportBanner';
import PurchaseRequestsCard from '../components/PurchaseRequestsCard';
import { Category, MonthSettlement, MonthSummary, SavingsGoal, Transaction } from '../types';
import { formatCurrency } from '../utils/format';
import DashboardSkeleton from '../components/DashboardSkeleton';
import AnimatedNumber from '../components/AnimatedNumber';

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
  const [settlement, setSettlement] = useState<MonthSettlement | null>(null);
  const [loading, setLoading] = useState(true);
  // QuickAddForm에서 "사도 될까?" 요청을 보내면 올려서 요청 카드가 다시 불러오게 한다.
  const [requestsKey, setRequestsKey] = useState(0);
  // 방금 기록한 내역 id — 최근 내역에서 잠깐 반짝이게 한다.
  const [highlightId, setHighlightId] = useState<number | null>(null);
  // 달을 넘긴 방향. 요약 카드가 그 방향에서 미끄러져 들어온다.
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  // 처음 한 번만 뼈대 화면을 보여주고, 그 뒤 달을 넘길 땐 화면을 유지한 채 숫자만 바꾼다.
  const loadedOnce = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // 카테고리와 목표는 달과 상관없어서 가계부가 바뀔 때만 받는다 (달을 넘기거나 지출을 추가할 때 다시 받지 않게).
  useEffect(() => {
    if (!currentId) return;
    Promise.all([
      api.get<{ categories: Category[] }>(`/households/${currentId}/categories`),
      api.get<{ goals: SavingsGoal[] }>(`/households/${currentId}/goals`),
    ]).then(([categoriesRes, goalsRes]) => {
      setCategories(categoriesRes.data.categories);
      setGoals(goalsRes.data.goals);
    });
  }, [currentId]);

  // 달마다 바뀌는 숫자들. 지출을 추가하면 이것만 다시 받는다.
  // silent: 내역 추가 직후처럼 화면을 유지한 채 숫자만 갱신할 때. 전체 로딩 화면으로 바꾸면
  // 입력 폼이 언마운트되어 "되돌리기" 안내나 에러 메시지가 바로 사라진다.
  const load = useCallback(async (silent = false) => {
    if (!currentId) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    const [summaryRes, transactionsRes, settlementRes] = await Promise.all([
      api.get<MonthSummary>(`/households/${currentId}/summary`, { params: { month } }),
      api.get<{ transactions: Transaction[] }>(`/households/${currentId}/transactions`, { params: { month } }),
      api.get<MonthSettlement>(`/households/${currentId}/summary/settlement`, { params: { month } }),
    ]);
    setSummary(summaryRes.data);
    setTransactions(transactionsRes.data.transactions);
    setSettlement(settlementRes.data);
    setLoading(false);
    setRefreshing(false);
    loadedOnce.current = true;
  }, [currentId, month]);

  useEffect(() => {
    load(loadedOnce.current);
  }, [load]);

  function shiftMonth(delta: number) {
    setSlideDir(delta > 0 ? 'left' : 'right');
    const [y, m] = month.split('-').map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }

  // 휴대폰에서 요약 영역을 좌우로 밀면 달을 넘긴다 (세로 스크롤과 헷갈리지 않게 가로로 충분히 밀었을 때만).
  function handleTouchEnd(e: TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftMonth(dx < 0 ? 1 : -1);
  }

  if (loading || !summary || !settlement || !currentId) {
    return <DashboardSkeleton />;
  }

  const budgetCategories = summary.categories.filter((c) => c.budgetLimit != null);

  return (
    <div className="page">
      <div className="month-nav">
        <button onClick={() => shiftMonth(-1)} aria-label="이전 달">
          ‹ 이전 달
        </button>
        <h2 key={month} className="month-title">
          {month}
        </h2>
        <button onClick={() => shiftMonth(1)} aria-label="다음 달">
          다음 달 ›
        </button>
      </div>

      <YearReportBanner householdId={currentId} />
      <UpcomingRecurringBanner householdId={currentId} />
      <GoalReminderBanner householdId={currentId} goals={goals} />

      <div
        key={summary.month}
        className={`summary-cards${slideDir ? ` slide-${slideDir}` : ''}${refreshing ? ' is-refreshing' : ''}`}
        onTouchStart={(e) => (touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={handleTouchEnd}
      >
        <div className="card summary-card income">
          <p className="muted">수입</p>
          <p className="summary-amount">
            <AnimatedNumber value={summary.income} format={formatCurrency} />
          </p>
        </div>
        <div className="card summary-card expense">
          <p className="muted">지출</p>
          <p className="summary-amount">
            <AnimatedNumber value={summary.expense} format={formatCurrency} />
          </p>
        </div>
        <div className="card summary-card balance">
          <p className="muted">남은 돈</p>
          <p className="summary-amount">
            <AnimatedNumber value={summary.balance} format={formatCurrency} />
          </p>
        </div>
      </div>
      <p className="swipe-hint muted small">← 밀어서 달 넘기기 →</p>

      <SettlementCard data={settlement} />

      <PurchaseRequestsCard householdId={currentId} refreshKey={requestsKey} onPurchased={() => load(true)} />

      <QuickAddForm
        householdId={currentId}
        categories={categories}
        onAdded={(newId) => {
          setHighlightId(newId ?? null);
          load(true);
        }}
        onRequested={() => setRequestsKey((k) => k + 1)}
      />

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
        <TransactionList transactions={transactions.slice(0, 8)} highlightId={highlightId} />
      </section>
    </div>
  );
}
