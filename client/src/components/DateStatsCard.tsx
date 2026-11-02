import { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../api/client';
import { Category, DateStats } from '../types';
import { formatCompactCurrency, formatCurrency } from '../utils/format';
import Spinner from './Spinner';

// 연간 데이트 비용 통계. 통계 페이지의 "월" 선택과는 따로 "연도" 단위로 넘겨 본다.
// 데이트/기념일 카테고리(isDate)로 표시된 카테고리의 지출만 집계하고, 어떤 카테고리를 넣을지는
// 아래 "데이트 카테고리 설정"에서 켜고 끌 수 있다 (예: 여행도 데이트로 치고 싶을 때).
export default function DateStatsCard({ householdId }: { householdId: number }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [stats, setStats] = useState<DateStats | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [sRes, cRes] = await Promise.all([
      api.get<DateStats>(`/households/${householdId}/summary/date-stats`, { params: { year } }),
      api.get<{ categories: Category[] }>(`/households/${householdId}/categories`),
    ]);
    setStats(sRes.data);
    setCategories(cRes.data.categories.filter((c) => c.type === 'expense'));
  }, [householdId, year]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleDateCategory(c: Category) {
    setError('');
    try {
      await api.patch(`/households/${householdId}/categories/${c.id}`, { isDate: !c.isDate });
      load();
    } catch (err) {
      setError(getErrorMessage(err, '설정 변경에 실패했습니다.'));
    }
  }

  const thisYear = new Date().getFullYear();
  const thisMonth = new Date().getMonth() + 1;
  // 올해는 지난 달까지만(진행 중인 이번 달 포함) 평균을 내야 "월평균"이 실제보다 작아 보이지 않는다.
  const monthsElapsed = stats ? (stats.year === thisYear ? thisMonth : stats.year < thisYear ? 12 : 0) : 0;
  const monthlyAverage = stats && monthsElapsed > 0 ? Math.round(stats.total / monthsElapsed) : 0;
  const maxMonthly = stats ? Math.max(...stats.monthly.map((m) => m.total), 1) : 1;
  const diff = stats ? stats.total - stats.previousYearTotal : 0;
  const peak = stats ? stats.monthly.reduce((a, b) => (b.total > a.total ? b : a)) : null;

  return (
    <section className="card date-stats">
      <div className="date-stats-header">
        <h3>💕 연간 데이트 비용</h3>
        <div className="date-stats-year">
          <button type="button" onClick={() => setYear((y) => y - 1)} aria-label="이전 해">
            ‹
          </button>
          <span>{year}년</span>
          <button type="button" onClick={() => setYear((y) => y + 1)} disabled={year >= thisYear} aria-label="다음 해">
            ›
          </button>
        </div>
      </div>

      {!stats ? (
        <Spinner />
      ) : (
        <>
          <div className="date-stats-summary">
            <div>
              <p className="muted small">총 데이트 비용</p>
              <p className="date-stats-total">{formatCurrency(stats.total)}</p>
              {stats.previousYearTotal > 0 && diff !== 0 && (
                <span className={diff > 0 ? 'diff diff-up' : 'diff diff-down'}>
                  작년보다 {diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(diff))}
                </span>
              )}
            </div>
            <div>
              <p className="muted small">월평균</p>
              <p className="date-stats-value">{formatCurrency(monthlyAverage)}</p>
            </div>
            <div>
              <p className="muted small">데이트 지출</p>
              <p className="date-stats-value">{stats.count}건</p>
            </div>
          </div>

          {stats.total === 0 ? (
            <p className="muted">
              {year}년에는 데이트 카테고리 지출이 없어요. 아래 설정에서 데이트로 볼 카테고리를 확인해보세요.
            </p>
          ) : (
            <>
              {/* 월별 막대. 시리즈가 하나라 범례 없이 제목으로 대신하고, 값은 막대에 마우스를 올리거나
                  포커스하면 툴팁으로, 그리고 아래 카테고리/Top 5 목록으로 숫자를 읽을 수 있다. */}
              <div className="date-chart" role="list" aria-label={`${year}년 월별 데이트 비용`}>
                {stats.monthly.map((m) => {
                  const label = `${m.month}월 ${formatCurrency(m.total)} (${m.count}건)`;
                  return (
                    <div key={m.month} className="date-chart-col" role="listitem" tabIndex={0} aria-label={label}>
                      <span className="date-chart-tooltip">{label}</span>
                      <div className="date-chart-track">
                        {m.total > 0 && (
                          <div className="date-chart-bar" style={{ height: `${(m.total / maxMonthly) * 100}%` }} />
                        )}
                      </div>
                      <span className="date-chart-label">{m.month}</span>
                    </div>
                  );
                })}
              </div>
              {peak && (
                <p className="muted small date-chart-caption">
                  가장 많이 쓴 달: {peak.month}월 · {formatCompactCurrency(peak.total)}
                </p>
              )}

              <h4>카테고리별</h4>
              <ul className="compare-list">
                {stats.categories.map((c) => (
                  <li key={c.categoryId} className="compare-item">
                    <div className="compare-main">
                      <span className="category-dot" style={{ backgroundColor: c.categoryColor }} />
                      <span>{c.categoryName}</span>
                    </div>
                    <span className="muted small">
                      {formatCurrency(c.total)} ({Math.round((c.total / stats.total) * 100)}%)
                    </span>
                  </li>
                ))}
              </ul>

              <h4>가장 컸던 데이트 Top 5</h4>
              <ul className="compare-list">
                {stats.top.map((t) => (
                  <li key={t.id} className="compare-item">
                    <div className="compare-main">
                      <span>{t.memo || t.categoryName}</span>
                      <span className="muted small">{t.occurredOn}</span>
                    </div>
                    <span className="amount expense">{formatCurrency(t.amount)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <button type="button" className="date-settings-toggle" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? '설정 닫기' : '데이트 카테고리 설정'}
          </button>
          {showSettings && (
            <div className="date-settings">
              <p className="muted small">체크한 카테고리의 지출이 데이트 비용으로 집계돼요.</p>
              {categories.map((c) => (
                <label key={c.id} className="date-settings-item">
                  <input type="checkbox" checked={c.isDate} onChange={() => toggleDateCategory(c)} />
                  <span className="category-dot" style={{ backgroundColor: c.color }} />
                  {c.name}
                </label>
              ))}
              {error && <p className="error">{error}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
