import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useHousehold } from '../context/HouseholdContext';
import { MonthInsights } from '../types';
import { formatCompactCurrency, formatCurrency } from '../utils/format';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// "YYYY-MM" -> 그 달의 날짜 수
function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// "YYYY-MM" -> 1일의 요일 (0=일요일)
function firstWeekday(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).getDay();
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

interface CalendarCell {
  day: number | null;
  date: string | null;
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

  const dailyMap = new Map(insights.daily.map((d) => [d.date, d]));
  const totalDays = daysInMonth(month);
  const offset = firstWeekday(month);
  const maxExpense = Math.max(1, ...insights.daily.map((d) => d.expense));

  const cells: CalendarCell[] = [];
  for (let i = 0; i < offset; i++) cells.push({ day: null, date: null });
  for (let day = 1; day <= totalDays; day++) {
    cells.push({ day, date: `${month}-${String(day).padStart(2, '0')}` });
  }

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
        <div className="calendar-weekdays">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {cells.map((cell, idx) => {
            if (cell.day == null || cell.date == null) {
              return <div key={idx} className="calendar-cell empty" />;
            }
            const totals = dailyMap.get(cell.date);
            const expense = totals?.expense ?? 0;
            const intensity = expense > 0 ? Math.min(1, expense / maxExpense) : 0;
            return (
              <div
                key={idx}
                className="calendar-cell"
                style={expense > 0 ? { backgroundColor: `rgba(245, 69, 92, ${0.08 + intensity * 0.3})` } : undefined}
              >
                <span className="calendar-day">{cell.day}</span>
                {expense > 0 && <span className="calendar-amount">{formatCompactCurrency(expense)}</span>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
