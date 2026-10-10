import { DailyTotal } from '../types';
import { formatCompactCurrency, formatCurrency } from '../utils/format';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

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

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface CalendarCell {
  day: number | null;
  date: string | null;
  weekday: number;
}

// 선택한 달의 날짜별 지출/수입을 달력 형태로 보여준다.
// 지출이 많은 날일수록 칸이 더 진하게 물든다(히트맵), 수입이 있던 날은 초록 점으로 표시.
export default function SpendingCalendar({ month, daily }: { month: string; daily: DailyTotal[] }) {
  const dailyMap = new Map(daily.map((d) => [d.date, d]));
  const totalDays = daysInMonth(month);
  const offset = firstWeekday(month);
  const maxExpense = Math.max(1, ...daily.map((d) => d.expense));
  const today = todayKey();

  const cells: CalendarCell[] = [];
  for (let i = 0; i < offset; i++) cells.push({ day: null, date: null, weekday: i });
  for (let day = 1; day <= totalDays; day++) {
    cells.push({ day, date: `${month}-${String(day).padStart(2, '0')}`, weekday: (offset + day - 1) % 7 });
  }

  return (
    <div className="spending-calendar">
      <div className="calendar-weekdays">
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>
            {w}
          </span>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((cell, idx) => {
          if (cell.day == null || cell.date == null) {
            return <div key={idx} className="calendar-cell empty" />;
          }
          const totals = dailyMap.get(cell.date);
          const expense = totals?.expense ?? 0;
          const income = totals?.income ?? 0;
          const intensity = expense > 0 ? Math.min(1, expense / maxExpense) : 0;
          const weekdayClass = cell.weekday === 0 ? 'sun' : cell.weekday === 6 ? 'sat' : '';

          return (
            <div
              key={idx}
              className={`calendar-cell ${cell.date === today ? 'today' : ''} ${expense > 0 ? 'has-expense' : ''}`}
              style={expense > 0 ? { backgroundColor: `rgba(245, 69, 92, ${0.12 + intensity * 0.38})` } : undefined}
              title={expense > 0 ? `${cell.date} 지출 ${formatCurrency(expense)}` : cell.date}
            >
              {income > 0 && <span className="calendar-income-dot" />}
              <span className={`calendar-day ${weekdayClass}`}>{cell.day}</span>
              {expense > 0 && <span className="calendar-amount">{formatCompactCurrency(expense)}</span>}
            </div>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span className="muted small">적게 씀</span>
        <span className="calendar-legend-bar" />
        <span className="muted small">많이 씀</span>
        <span className="calendar-legend-sep" />
        <span className="calendar-income-dot" />
        <span className="muted small">수입 있음</span>
      </div>
    </div>
  );
}
