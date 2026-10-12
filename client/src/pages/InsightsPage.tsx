import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useHousehold } from '../context/HouseholdContext';
import SpendingCalendar from '../components/SpendingCalendar';
import LoadingScreen from '../components/LoadingScreen';
import { MonthInsights } from '../types';
import { formatCurrency } from '../utils/format';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function InsightsPage() {
  const { currentId } = useHousehold();
  const [month, setMonth] = useState(currentYearMonth());
  const [insights, setInsights] = useState<MonthInsights | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentId) return;
    setLoading(true);
    const res = await api.get<MonthInsights>(`/households/${currentId}/summary/insights`, { params: { month } });
    setInsights(res.data);
    setLoading(false);
  }, [currentId, month]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !insights) {
    return <LoadingScreen />;
  }

  // categories는 서버에서 이미 current 내림차순으로 내려오므로 앞 3개가 곧 Top3.
  const top3 = insights.categories.filter((c) => c.current > 0).slice(0, 3);

  // Number()로 한 번 더 감싸는 이유: 서버가 DB의 SUM() 결과를 숫자로 내려주지만,
  // 혹시라도 문자열("0")이 섞여 들어오면 뒤에서 `!== 0` 같은 엄격 비교가 틀어져
  // 0으로 나누기(Infinity%) 버그로 이어질 수 있어서 여기서 한 번 더 숫자로 확정한다.
  const currentIncome = Number(insights.totals.currentIncome);
  const currentExpense = Number(insights.totals.currentExpense);
  const previousIncome = Number(insights.totals.previousIncome);
  const previousExpense = Number(insights.totals.previousExpense);
  // "늘어난 게 좋은 일"인지는 항목마다 다르다 — 지출은 줄어야 좋고, 수입/남은 돈은 늘어야 좋다.
  const totalsRows = [
    { label: '지출', current: currentExpense, previous: previousExpense, goodWhenUp: false },
    { label: '수입', current: currentIncome, previous: previousIncome, goodWhenUp: true },
    {
      label: '남은 돈',
      current: currentIncome - currentExpense,
      previous: previousIncome - previousExpense,
      goodWhenUp: true,
    },
  ];

  return (
    <div className="page">
      <h2>통계</h2>
      <div className="month-nav">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      <section className="card">
        <h3>이번 달 vs 지난달</h3>
        <ul className="compare-list">
          {totalsRows.map((row) => {
            const diff = row.current - row.previous;
            const diffPercent = row.previous !== 0 ? Math.round((diff / Math.abs(row.previous)) * 100) : null;
            const isGood = diff === 0 ? null : (diff > 0) === row.goodWhenUp;
            return (
              <li key={row.label} className="compare-item">
                <div className="compare-main">
                  <span>{row.label}</span>
                </div>
                <div className="compare-amounts">
                  <span className="muted small">
                    {formatCurrency(row.previous)} → {formatCurrency(row.current)}
                  </span>
                  {diff !== 0 && (
                    <span className={isGood ? 'diff diff-good' : 'diff diff-bad'}>
                      {diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(diff))}
                      {diffPercent != null && ` (${Math.abs(diffPercent)}%)`}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h3>이번 달 Top 3 카테고리</h3>
        {top3.length === 0 ? (
          <p className="muted">이번 달 지출 내역이 없습니다.</p>
        ) : (
          <ul className="top3-list">
            {top3.map((c, i) => (
              <li key={c.categoryId} className="top3-item">
                <span className={`top3-rank rank-${i + 1}`}>{i + 1}</span>
                <span className="category-dot" style={{ backgroundColor: c.categoryColor }} />
                <span className="top3-name">{c.categoryName}</span>
                <span className="amount expense">{formatCurrency(c.current)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3>지난달과 비교</h3>
        {insights.categories.length === 0 ? (
          <p className="muted">비교할 지출 내역이 없습니다.</p>
        ) : (
          <ul className="compare-list">
            {insights.categories.map((c) => {
              const diff = c.current - c.previous;
              const diffPercent = c.previous > 0 ? Math.round((diff / c.previous) * 100) : null;
              return (
                <li key={c.categoryId} className="compare-item">
                  <div className="compare-main">
                    <span className="category-dot" style={{ backgroundColor: c.categoryColor }} />
                    <span>{c.categoryName}</span>
                  </div>
                  <div className="compare-amounts">
                    <span className="muted small">{formatCurrency(c.previous)} → {formatCurrency(c.current)}</span>
                    {diff !== 0 && (
                      <span className={diff > 0 ? 'diff diff-up' : 'diff diff-down'}>
                        {diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(diff))}
                        {diffPercent != null && ` (${Math.abs(diffPercent)}%)`}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h3>날짜별 지출 캘린더</h3>
        <SpendingCalendar month={month} daily={insights.daily} />
      </section>
    </div>
  );
}
