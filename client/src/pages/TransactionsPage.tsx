import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getErrorMessage } from '../api/client';
import { useHousehold } from '../context/HouseholdContext';
import SplitControl from '../components/SplitControl';
import ReceiptButton from '../components/ReceiptButton';
import ReceiptPicker from '../components/ReceiptPicker';
import Spinner from '../components/Spinner';
import { Category, HouseholdDetail, SplitType, Transaction, TransactionType } from '../types';
import { formatCurrency, splitBadgeLabel } from '../utils/format';
import { triggerDownload } from '../utils/download';
import { computeSettlement } from '../utils/settlement';
import { deleteReceipt, uploadReceipt } from '../utils/receipt';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface EditForm {
  type: TransactionType;
  amount: number;
  categoryId: string;
  memo: string;
  occurredOn: string;
  splitType: SplitType;
  payerSharePercent: number;
  // 새로 고른 영수증 사진(있으면 저장할 때 기존 사진을 교체한다)
  receiptFile: File | null;
  // 기존 영수증 사진을 지우기로 했는지
  removeReceipt: boolean;
}

export default function TransactionsPage() {
  const { currentId } = useHousehold();
  const [month, setMonth] = useState(currentYearMonth());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [household, setHousehold] = useState<HouseholdDetail | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // "더치페이" — 공동 지출 중 고른 건들만 바로 정산 완료로 표시하는 모드.
  const [dutchMode, setDutchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState('');

  const load = useCallback(async () => {
    if (!currentId) return;
    const [tRes, cRes, hRes] = await Promise.all([
      api.get<{ transactions: Transaction[] }>(`/households/${currentId}/transactions`, { params: { month } }),
      api.get<{ categories: Category[] }>(`/households/${currentId}/categories`),
      api.get<HouseholdDetail>(`/households/${currentId}`),
    ]);
    setTransactions(tRes.data.transactions);
    setCategories(cRes.data.categories);
    setHousehold(hRes.data);
  }, [currentId, month]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(t: Transaction) {
    setEditingId(t.id);
    setEditForm({
      type: t.type,
      amount: t.amount,
      categoryId: t.categoryId ? String(t.categoryId) : '',
      memo: t.memo || '',
      occurredOn: t.occurredOn,
      splitType: t.splitType,
      payerSharePercent: t.payerSharePercent,
      receiptFile: null,
      removeReceipt: false,
    });
    setEditError('');
  }

  async function saveEdit(id: number) {
    if (!editForm || !currentId) return;
    const { receiptFile, removeReceipt, ...fields } = editForm;
    setSavingEdit(true);
    setEditError('');
    try {
      await api.put(`/households/${currentId}/transactions/${id}`, {
        ...fields,
        amount: Number(fields.amount),
        categoryId: fields.categoryId || null,
      });
      if (receiptFile) {
        await uploadReceipt(currentId, id, receiptFile);
      } else if (removeReceipt) {
        await deleteReceipt(currentId, id);
      }
      setEditingId(null);
      load();
    } catch (err) {
      setEditError(getErrorMessage(err, '저장에 실패했습니다.'));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id: number) {
    if (!currentId || !confirm('이 내역을 삭제할까요?')) return;
    await api.delete(`/households/${currentId}/transactions/${id}`);
    load();
  }

  // 백업·세금정산용 CSV 내보내기. scope가 'month'면 지금 보고 있는 달만, 'all'이면 전체 내역.
  async function handleExport(scope: 'month' | 'all') {
    if (!currentId) return;
    const res = await api.get<Blob>(`/households/${currentId}/transactions/export`, {
      params: scope === 'month' ? { month } : {},
      responseType: 'blob',
    });
    triggerDownload(res, scope === 'month' ? `transactions_${month}.csv` : 'transactions_all.csv');
  }

  // 더치페이로 고를 수 있는 건: 공동 지출이면서(개인 지출은 정산 개념이 없음) 아직 정산 안 된 것.
  const dutchEligible = useMemo(
    () => transactions.filter((t) => t.type === 'expense' && t.splitType === 'shared' && !t.isSettled),
    [transactions]
  );

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDutchMode() {
    setDutchMode((prev) => !prev);
    setSelectedIds(new Set());
    setSettleError('');
  }

  const selectedTransactions = transactions.filter((t) => selectedIds.has(t.id));
  const selectedTotal = selectedTransactions.reduce((sum, t) => sum + t.amount, 0);
  const members = household?.members ?? [];
  const settlementPreview =
    members.length === 2 ? computeSettlement(selectedTransactions, [members[0].id, members[1].id]) : null;

  async function handleSettle() {
    if (!currentId || selectedIds.size === 0) return;
    setSettling(true);
    setSettleError('');
    try {
      await api.post(`/households/${currentId}/transactions/settle`, { ids: Array.from(selectedIds) });
      setDutchMode(false);
      setSelectedIds(new Set());
      load();
    } catch (err) {
      setSettleError(getErrorMessage(err, '정산 처리에 실패했습니다.'));
    } finally {
      setSettling(false);
    }
  }

  return (
    <div className="page">
      <div className="month-nav">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      <div className="export-actions">
        <button type="button" onClick={() => handleExport('month')}>
          이번 달 CSV 내보내기
        </button>
        <button type="button" onClick={() => handleExport('all')}>
          전체 내역 백업(CSV)
        </button>
        {members.length === 2 && (
          <button type="button" className={dutchMode ? 'active' : ''} onClick={toggleDutchMode}>
            {dutchMode ? '더치페이 종료' : '더치페이'}
          </button>
        )}
      </div>

      {dutchMode && (
        <div className="card dutch-panel">
          <p className="muted small">
            정산할 공동 지출을 체크하세요. (정산 안 된 공동 지출 {dutchEligible.length}건 중 선택 가능)
          </p>
          {selectedIds.size > 0 && (
            <p className="dutch-selected-total">
              {selectedIds.size}건 선택 · 합계 {formatCurrency(selectedTotal)}
            </p>
          )}
          {selectedIds.size > 0 &&
            (settlementPreview ? (
              <p className="settlement-result">
                <strong>{members.find((m) => m.id === settlementPreview.fromUserId)?.name}</strong>님이{' '}
                <strong>{members.find((m) => m.id === settlementPreview.toUserId)?.name}</strong>님에게{' '}
                <strong>{formatCurrency(settlementPreview.amount)}</strong> 보내면 정산 끝!
              </p>
            ) : (
              <p className="settlement-result settled">이미 딱 맞게 냈어요! 🎉</p>
            ))}
          {settleError && <p className="error">{settleError}</p>}
          <button type="submit" disabled={selectedIds.size === 0 || settling} onClick={handleSettle}>
            {settling && <Spinner size="sm" variant="on-primary" />}
            선택한 {selectedIds.size}건 정산 완료로 표시
          </button>
        </div>
      )}

      <ul className="transaction-list">
        {transactions.map((t) => {
          const selectable = dutchMode && t.type === 'expense' && t.splitType === 'shared' && !t.isSettled;
          return (
            <li key={t.id} className={`transaction-item ${t.type}`}>
              {editingId === t.id && editForm ? (
                <div className="edit-row">
                  <div className="form-row">
                    <select
                      value={editForm.categoryId}
                      onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}
                    >
                      <option value="">미분류</option>
                      {categories
                        .filter((c) => c.type === editForm.type)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                    <input
                      type="number"
                      value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-row">
                    <input
                      type="text"
                      placeholder="메모"
                      value={editForm.memo}
                      onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                    />
                    <input
                      type="date"
                      value={editForm.occurredOn}
                      onChange={(e) => setEditForm({ ...editForm, occurredOn: e.target.value })}
                    />
                  </div>
                  {editForm.type === 'expense' && (
                    <SplitControl
                      splitType={editForm.splitType}
                      payerSharePercent={editForm.payerSharePercent}
                      onChange={(next) => setEditForm({ ...editForm, ...next })}
                    />
                  )}
                  {editForm.type === 'expense' && (
                    <div className="receipt-edit">
                      {t.hasReceipt && !editForm.receiptFile && (
                        <label className="receipt-remove">
                          <input
                            type="checkbox"
                            checked={editForm.removeReceipt}
                            onChange={(e) => setEditForm({ ...editForm, removeReceipt: e.target.checked })}
                          />
                          첨부된 영수증 삭제
                        </label>
                      )}
                      <ReceiptPicker
                        file={editForm.receiptFile}
                        onChange={(file) => setEditForm({ ...editForm, receiptFile: file })}
                        label={t.hasReceipt ? '영수증 사진 교체' : '영수증 사진 첨부'}
                      />
                    </div>
                  )}
                  {editError && <p className="error">{editError}</p>}
                  <div className="edit-row-actions">
                    <button type="submit" disabled={savingEdit} onClick={() => saveEdit(t.id)}>
                      {savingEdit && <Spinner size="sm" variant="on-primary" />}
                      저장
                    </button>
                    <button type="button" onClick={() => setEditingId(null)}>
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {dutchMode && (
                    <input
                      type="checkbox"
                      className="dutch-checkbox"
                      disabled={!selectable}
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleSelect(t.id)}
                    />
                  )}
                  <div className="transaction-main">
                    <span
                      className="category-dot"
                      style={{ backgroundColor: t.categoryColor || '#ccc', color: t.categoryColor || '#ccc' }}
                    />
                    <div>
                      <p className="transaction-category">
                        {t.categoryName || '미분류'}
                        {t.memo ? ` · ${t.memo}` : ''}
                        {splitBadgeLabel(t.splitType, t.payerSharePercent) && (
                          <span className="split-badge">{splitBadgeLabel(t.splitType, t.payerSharePercent)}</span>
                        )}
                        {t.isSettled && <span className="split-badge settled">정산됨</span>}
                        {t.hasReceipt && <ReceiptButton transactionId={t.id} />}
                      </p>
                      <p className="muted small">
                        {t.occurredOn} · {t.userName}
                      </p>
                    </div>
                  </div>
                  <div className="transaction-actions">
                    <span className={`amount ${t.type}`}>
                      {t.type === 'income' ? '+' : '-'}
                      {formatCurrency(t.amount)}
                    </span>
                    {!dutchMode && (
                      <>
                        <button onClick={() => startEdit(t)}>수정</button>
                        <button onClick={() => handleDelete(t.id)}>삭제</button>
                      </>
                    )}
                  </div>
                </>
              )}
            </li>
          );
        })}
        {transactions.length === 0 && <p className="muted">기록된 내역이 없습니다.</p>}
      </ul>
    </div>
  );
}
