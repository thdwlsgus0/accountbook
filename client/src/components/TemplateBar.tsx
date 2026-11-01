import { useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../api/client';
import { ExpenseTemplate } from '../types';
import { formatCurrency, localDateString, splitBadgeLabel } from '../utils/format';

interface TemplateBarProps {
  householdId: number;
  templates: ExpenseTemplate[];
  onChanged: () => void;
  onAdded: () => void;
}

const UNDO_MS = 5000;

// 자주 쓰는 지출 템플릿을 칩으로 보여주고, 누르면 그 자리에서 바로 오늘 지출로 기록한다.
// 한 번 탭으로 기록되는 만큼 잘못 누르기 쉬우니, 몇 초 동안 "되돌리기"를 띄워준다.
export default function TemplateBar({ householdId, templates, onChanged, onAdded }: TemplateBarProps) {
  const [editing, setEditing] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [lastAdded, setLastAdded] = useState<{ transactionId: number; name: string } | null>(null);
  const [error, setError] = useState('');
  const undoTimer = useRef<number>();

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  async function handleUse(t: ExpenseTemplate) {
    setError('');
    setPendingId(t.id);
    try {
      const res = await api.post<{ id: number }>(`/households/${householdId}/templates/${t.id}/use`, {
        occurredOn: localDateString(),
      });
      setLastAdded({ transactionId: res.data.id, name: t.name });
      window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setLastAdded(null), UNDO_MS);
      onAdded();
    } catch (err) {
      setError(getErrorMessage(err, '기록에 실패했습니다.'));
    } finally {
      setPendingId(null);
    }
  }

  async function handleUndo() {
    if (!lastAdded) return;
    window.clearTimeout(undoTimer.current);
    setLastAdded(null);
    await api.delete(`/households/${householdId}/transactions/${lastAdded.transactionId}`);
    onAdded();
  }

  async function handleDelete(t: ExpenseTemplate) {
    if (!confirm(`"${t.name}" 템플릿을 삭제할까요?`)) return;
    await api.delete(`/households/${householdId}/templates/${t.id}`);
    onChanged();
  }

  if (templates.length === 0) {
    return (
      <p className="muted small template-hint">
        자주 쓰는 지출은 메모와 금액을 입력하고 "⭐ 템플릿으로 저장"을 누르면 다음부터 한 번에 기록할 수 있어요.
      </p>
    );
  }

  return (
    <div className="template-bar">
      <div className="template-chips">
        {templates.map((t) => {
          const badge = splitBadgeLabel(t.splitType, t.payerSharePercent);
          return (
            <span key={t.id} className="template-chip-wrap">
              <button
                type="button"
                className="template-chip"
                disabled={editing || pendingId !== null}
                onClick={() => handleUse(t)}
                style={{ borderColor: t.categoryColor || undefined }}
              >
                <span className="template-chip-name">{t.name}</span>
                <span className="template-chip-amount">
                  {formatCurrency(t.amount)}
                  {badge && ` · ${badge}`}
                </span>
              </button>
              {editing && (
                <button
                  type="button"
                  className="template-chip-delete"
                  aria-label={`${t.name} 템플릿 삭제`}
                  onClick={() => handleDelete(t)}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
        <button type="button" className="template-edit-toggle" onClick={() => setEditing((v) => !v)}>
          {editing ? '완료' : '편집'}
        </button>
      </div>
      {lastAdded && (
        <p className="template-toast">
          "{lastAdded.name}" 기록했어요.
          <button type="button" onClick={handleUndo}>
            되돌리기
          </button>
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
