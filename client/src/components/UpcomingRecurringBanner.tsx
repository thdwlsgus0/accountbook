import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { RecurringRule } from '../types';
import { formatCurrency } from '../utils/format';

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 닫은 날짜를 기억해서 같은 날엔 다시 안 띄운다. 시크릿 모드 등에서 localStorage가 막혀 있으면
// 그냥 매번 보이게 둔다 (알림이 안 뜨는 것보단 낫다).
function readDismissed(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeDismissed(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장 못 해도 이번 화면에서는 닫힌 상태로 둔다.
  }
}

// 고정비 결제일 D-1 알림. 내일이 결제일(day_of_month)인 활성 고정비 지출을 대시보드 맨 위에 띄운다.
// 고정비는 결제일 당일에 자동 기록만 되고 미리 알려주는 게 없어서, 통장 잔고를 챙길 수 있게 하루 전에 알려준다.
// "내일"은 서버(Vercel, UTC)가 아니라 사용자 기기 시간 기준으로 계산해야 한국 날짜와 맞는다.
export default function UpcomingRecurringBanner({ householdId }: { householdId: number }) {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = formatLocalDate(tomorrow);
  const storageKey = `upcomingRecurringDismissed:${householdId}`;
  const [dismissed, setDismissed] = useState(() => readDismissed(storageKey) === tomorrowKey);

  useEffect(() => {
    api
      .get<{ recurring: RecurringRule[] }>(`/households/${householdId}/recurring`)
      .then((res) => setRules(res.data.recurring))
      .catch(() => setRules([]));
  }, [householdId]);

  const upcoming = rules.filter((r) => r.isActive && r.type === 'expense' && r.dayOfMonth === tomorrow.getDate());
  if (dismissed || upcoming.length === 0) return null;

  const total = upcoming.reduce((sum, r) => sum + r.amount, 0);

  return (
    <section className="card upcoming-banner" role="status">
      <div className="upcoming-banner-header">
        <p className="upcoming-banner-title">
          🔔 내일({tomorrow.getMonth() + 1}/{tomorrow.getDate()}) 고정비 {upcoming.length}건 · {formatCurrency(total)}{' '}
          결제 예정
        </p>
        <button
          type="button"
          className="upcoming-banner-close"
          aria-label="오늘 그만 보기"
          onClick={() => {
            writeDismissed(storageKey, tomorrowKey);
            setDismissed(true);
          }}
        >
          ×
        </button>
      </div>
      <ul className="upcoming-banner-list">
        {upcoming.map((r) => (
          <li key={r.id}>
            <span>{r.memo || r.categoryName || '고정비'}</span>
            <span className="amount expense">{formatCurrency(r.amount)}</span>
          </li>
        ))}
      </ul>
      <Link to="/recurring" className="small">
        고정비 관리
      </Link>
    </section>
  );
}
