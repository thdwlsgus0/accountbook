import { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../api/client';
import { getOnce } from '../utils/prefetch';
import { useAuth } from '../context/AuthContext';
import { PurchaseRequest, PurchaseRequestStatus } from '../types';
import { formatCurrency, localDateString, splitBadgeLabel } from '../utils/format';

interface PurchaseRequestsCardProps {
  householdId: number;
  // QuickAddForm에서 새 요청을 보낼 때마다 바뀌어서 목록을 다시 불러오게 한다.
  refreshKey: number;
  // 구매 기록으로 지출이 생겼을 때 대시보드 숫자를 갱신하도록 알린다.
  onPurchased: () => void;
}

const STATUS_LABEL: Record<PurchaseRequestStatus, string> = {
  pending: '대기 중',
  approved: '승인됨',
  rejected: '거절됨',
  cancelled: '취소함',
  purchased: '구매 완료',
};

// "이거 사도 될까?" 요청 카드. 상대방이 보낸 대기 중 요청엔 승인/거절을, 내 요청엔 취소/구매 기록을 보여준다.
// 요청이 하나도 없으면(최근 2주 기준) 카드 자체를 숨긴다.
export default function PurchaseRequestsCard({ householdId, refreshKey, onPurchased }: PurchaseRequestsCardProps) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const data = await getOnce<{ requests: PurchaseRequest[] }>(`/households/${householdId}/purchase-requests`);
    setRequests(data.requests);
  }, [householdId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function run(id: number, action: () => Promise<unknown>, fallback: string) {
    setError('');
    setBusyId(id);
    try {
      await action();
      await load();
    } catch (err) {
      setError(getErrorMessage(err, fallback));
      load();
    } finally {
      setBusyId(null);
    }
  }

  function respond(r: PurchaseRequest, decision: 'approved' | 'rejected') {
    run(
      r.id,
      () =>
        api.post(`/households/${householdId}/purchase-requests/${r.id}/respond`, {
          decision,
          note: notes[r.id] || null,
        }),
      '처리에 실패했습니다.'
    );
  }

  function cancel(r: PurchaseRequest) {
    if (!confirm(`"${r.title}" 요청을 취소할까요?`)) return;
    run(r.id, () => api.post(`/households/${householdId}/purchase-requests/${r.id}/cancel`), '취소에 실패했습니다.');
  }

  function purchase(r: PurchaseRequest) {
    run(
      r.id,
      async () => {
        await api.post(`/households/${householdId}/purchase-requests/${r.id}/purchase`, {
          occurredOn: localDateString(),
        });
        onPurchased();
      },
      '구매 기록에 실패했습니다.'
    );
  }

  if (!user || requests.length === 0) return null;

  const toMe = requests.filter((r) => r.status === 'pending' && r.requesterId !== user.id);
  const others = requests.filter((r) => !toMe.includes(r));

  return (
    <section className="card purchase-requests">
      <h3>🙋 사도 될까?</h3>

      {toMe.length > 0 && (
        <ul className="purchase-request-list">
          {toMe.map((r) => (
            <li key={r.id} className="purchase-request to-me">
              <RequestSummary r={r} />
              <input
                type="text"
                placeholder="한마디 (선택) 예: 다음 달에 사자!"
                maxLength={255}
                value={notes[r.id] ?? ''}
                onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
              />
              <div className="purchase-request-actions">
                <button type="button" disabled={busyId === r.id} onClick={() => respond(r, 'rejected')}>
                  거절
                </button>
                <button type="submit" disabled={busyId === r.id} onClick={() => respond(r, 'approved')}>
                  승인
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <ul className="purchase-request-list">
          {others.map((r) => {
            const mine = r.requesterId === user.id;
            return (
              <li key={r.id} className="purchase-request">
                <RequestSummary r={r} />
                <p className="purchase-request-status">
                  <span className={`status-badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  {r.responderName && r.status !== 'cancelled' && (
                    <span className="muted small">
                      {r.responderName}
                      {r.responseNote ? `: "${r.responseNote}"` : ''}
                    </span>
                  )}
                  {r.status === 'pending' && <span className="muted small">상대방 답을 기다리는 중</span>}
                </p>
                {mine && (r.status === 'pending' || r.status === 'approved') && (
                  <div className="purchase-request-actions">
                    <button type="button" disabled={busyId === r.id} onClick={() => cancel(r)}>
                      {r.status === 'approved' ? '안 살래요' : '요청 취소'}
                    </button>
                    {r.status === 'approved' && (
                      <button type="submit" disabled={busyId === r.id} onClick={() => purchase(r)}>
                        샀어요! 지출로 기록
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
}

function RequestSummary({ r }: { r: PurchaseRequest }) {
  const badge = splitBadgeLabel(r.splitType, r.payerSharePercent);
  return (
    <div className="purchase-request-summary">
      <p className="transaction-category">
        {r.title}
        {badge && <span className="split-badge">{badge}</span>}
      </p>
      <p className="muted small">
        {r.requesterName} · {r.categoryName || '미분류'} · {r.createdAt.slice(5, 10).replace('-', '/')}
      </p>
      <span className="amount expense">{formatCurrency(r.amount)}</span>
    </div>
  );
}
