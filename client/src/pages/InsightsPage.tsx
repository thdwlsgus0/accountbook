import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useHousehold } from '../context/HouseholdContext';
import SpendingCalendar from '../components/SpendingCalendar';
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
    return <div className="center-message">불러오는 중...</div>;
  }

  // categories는 서버에서 이미 current 내림차순으로 내려오므로 앞 3개가 곧 Top3.
  const top3 = insights.categories.filter((c) => c.current > 0).slice(0, 3);

  return (
    <div className="page">
      <h2>통계</h2>
      <div className="month-nav">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

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
