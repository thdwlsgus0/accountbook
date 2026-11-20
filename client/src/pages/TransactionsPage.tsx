import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getErrorMessage } from '../api/client';
import { useHousehold } from '../context/HouseholdContext';
import SplitControl from '../components/SplitControl';
import ReceiptButton from '../components/ReceiptButton';
import ReceiptPicker from '../components/ReceiptPicker';
import PaymentMethodPicker from '../components/PaymentMethodPicker';
import { paymentMethodLabel } from '../utils/payment';
import Spinner from '../components/Spinner';
import { Category, HouseholdDetail, PaymentMethod, SplitType, Transaction, TransactionType } from '../types';
import { formatCurrency, splitBadgeLabel } from '../utils/format';
import { triggerDownload } from '../utils/download';
import { computeBalances, computeTransfers } from '../utils/settlement';
import SettlementTransfers from '../components/SettlementTransfers';
import { deleteReceipt, uploadReceipt } from '../utils/receipt';
import MemoText from '../components/MemoText';
import TransactionSearch, {
  EMPTY_FILTERS,
  hasAnyFilter,
  SearchFilters,
  TagStat,
} from '../components/TransactionSearch';

interface SearchResult {
  transactions: Transaction[];
  count: number;
  expense: number;
  income: number;
  truncated: boolean;
}

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
  paymentMethod: PaymentMethod | null;
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

  // 검색: 조건이 하나라도 있으면 월별 목록 대신 모든 달의 검색 결과를 보여준다.
  // 대시보드에서 #태그를 누르면 /transactions?tag=... 로 들어와서 바로 그 태그로 검색된다.
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<SearchFilters>(() => ({
    ...EMPTY_FILTERS,
    tag: params.get('tag') ?? '',
    q: params.get('q') ?? '',
  }));
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [tags, setTags] = useState<TagStat[]>([]);
  const searchActive = hasAnyFilter(filters);

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

  const loadTags = useCallback(async () => {
    if (!currentId) return;
    const res = await api.get<{ tags: TagStat[] }>(`/households/${currentId}/transactions/tags`);
    setTags(res.data.tags);
  }, [currentId]);

  useEffect(() => {
    loadTags().catch(() => setTags([]));
  }, [loadTags]);

  const runSearch = useCallback(async () => {
    if (!currentId || !hasAnyFilter(filters)) {
      setSearch(null);
      return;
    }
    const query = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
    setSearching(true);
    try {
      const res = await api.get<SearchResult>(`/households/${currentId}/transactions/search`, { params: query });
      setSearch(res.data);
    } finally {
      setSearching(false);
    }
  }, [currentId, filters]);

  // 글자를 칠 때마다 요청하지 않게 잠깐 멈췄을 때 검색한다.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      runSearch();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [runSearch]);

  function changeFilters(next: SearchFilters) {
    setFilters(next);
    // 주소의 ?tag= 는 처음 들어올 때만 쓰고, 조건을 바꾸면 지운다 (새로고침 때 옛 조건이 되살아나지 않게).
    if (params.has('tag') || params.has('q')) setParams({}, { replace: true });
  }

  function searchTag(tag: string) {
    changeFilters({ ...filters, tag });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 수정/삭제 후엔 월별 목록, 검색 결과, 태그 통계를 모두 새로 고친다.
  function refresh() {
    load();
    loadTags().catch(() => {});
    if (searchActive) runSearch();
  }

  const visible = searchActive ? (search?.transactions ?? []) : transactions;

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
      paymentMethod: t.paymentMethod,
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
      refresh();
    } catch (err) {
      setEditError(getErrorMessage(err, '저장에 실패했습니다.'));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id: number) {
    if (!currentId || !confirm('이 내역을 삭제할까요?')) return;
    await api.delete(`/households/${currentId}/transactions/${id}`);
    refresh();
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
  const nameOf = (id: number) => members.find((m) => m.id === id)?.name ?? '';
  const settlementPreview =
    members.length >= 2
      ? computeTransfers(
          computeBalances(
            selectedTransactions,
            members.map((m) => m.id)
          )
        ).map((t) => ({
          fromUserName: nameOf(t.fromUserId),
          toUserName: nameOf(t.toUserId),
          amount: t.amount,
        }))
      : [];

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
      <TransactionSearch
        filters={filters}
        onChange={(next) => {
          changeFilters(next);
          // 검색 중엔 월별 목록 기준인 더치페이를 끈다.
          if (hasAnyFilter(next)) setDutchMode(false);
        }}
        tags={tags}
        categories={categories}
        members={members}
      />

      {searchActive ? (
        <p className="tx-search-summary" aria-live="polite">
          {searching && !search ? (
            <Spinner size="sm" />
          ) : search ? (
            <>
              모든 달에서 <strong>{search.count}건</strong>
              {search.expense > 0 && (
                <>
                  {' · '}지출 <strong className="amount expense">{formatCurrency(search.expense)}</strong>
                </>
              )}
              {search.income > 0 && (
                <>
                  {' · '}수입 <strong className="amount income">{formatCurrency(search.income)}</strong>
                </>
              )}
              {search.truncated && <span className="muted small"> (최근 300건만 보여줘요)</span>}
            </>
          ) : null}
        </p>
      ) : (
        <>
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
            {members.length >= 2 && (
              <button type="button" className={dutchMode ? 'active' : ''} onClick={toggleDutchMode}>
                {dutchMode ? '더치페이 종료' : '더치페이'}
              </button>
            )}
          </div>
        </>
      )}

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
          {selectedIds.size > 0 && <SettlementTransfers transfers={settlementPreview} />}
          {settleError && <p className="error">{settleError}</p>}
          <button type="submit" disabled={selectedIds.size === 0 || settling} onClick={handleSettle}>
            {settling && <Spinner size="sm" variant="on-primary" />}
            선택한 {selectedIds.size}건 정산 완료로 표시
          </button>
        </div>
      )}

      <ul className="transaction-list">
        {visible.map((t) => {
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
                    <PaymentMethodPicker
                      value={editForm.paymentMethod}
                      onChange={(m) => setEditForm({ ...editForm, paymentMethod: m })}
                      allowClear
                    />
                  )}
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
                        {t.memo && (
                          <>
                            {' · '}
                            <MemoText memo={t.memo} onTagClick={searchTag} />
                          </>
                        )}
                        {splitBadgeLabel(t.splitType, t.payerSharePercent) && (
                          <span className="split-badge">{splitBadgeLabel(t.splitType, t.payerSharePercent)}</span>
                        )}
                        {t.isSettled && <span className="split-badge settled">정산됨</span>}
                        {t.hasReceipt && <ReceiptButton transactionId={t.id} />}
                      </p>
                      <p className="muted small">
                        {t.occurredOn} · {t.userName}
                        {t.type === 'expense' && t.paymentMethod && ` · ${paymentMethodLabel(t.paymentMethod)}`}
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
        {visible.length === 0 && (
          <p className="muted">
            {searchActive ? (searching ? '' : '조건에 맞는 내역이 없어요.') : '기록된 내역이 없습니다.'}
          </p>
        )}
      </ul>
    </div>
  );
}
