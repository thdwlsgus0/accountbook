import { useState } from 'react';
import { Link } from 'react-router-dom';
import { readDismissed, writeDismissed } from '../utils/storage';

// 12월엔 올해 결산, 1월엔 지난해 결산을 대시보드에 한 번 권한다. 닫으면 그해 결산은 다시 안 띄운다.
export default function YearReportBanner({ householdId }: { householdId: number }) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = month === 12 ? now.getFullYear() : now.getFullYear() - 1;
  const storageKey = `yearReportDismissed:${householdId}`;
  const [dismissed, setDismissed] = useState(() => readDismissed(storageKey) === String(year));

  if ((month !== 12 && month !== 1) || dismissed) return null;

  return (
    <section className="card upcoming-banner year-report-banner" role="status">
      <div className="upcoming-banner-header">
        <p className="upcoming-banner-title">🎁 우리의 {year} 결산이 준비됐어요</p>
        <button
          type="button"
          className="upcoming-banner-close"
          aria-label="결산 알림 닫기"
          onClick={() => {
            writeDismissed(storageKey, String(year));
            setDismissed(true);
          }}
        >
          ×
        </button>
      </div>
      <Link to={`/report?year=${year}`} className="small">
        한 해 돌아보기
      </Link>
    </section>
  );
}
