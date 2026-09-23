import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../api/client';
import { useHousehold } from '../context/HouseholdContext';
import { Category, RecurringRule, TransactionType } from '../types';
import { formatCurrency } from '../utils/format';

interface RecurringForm {
  type: TransactionType;
  amount: string;
  categoryId: string;
  memo: string;
  dayOfMonth: string;
}

const EMPTY_FORM: RecurringForm = { type: 'expense', amount: '', categoryId: '', memo: '', dayOfMonth: '1' };

export default function RecurringPage() {
  const { currentId } = useHousehold();
  const [recurring, setRecurring] = useState<RecurringRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<RecurringForm>(EMPTY_FORM);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!currentId) return;
    const [rRes, cRes] = await Promise.all([
      api.get<{ recurring: RecurringRule[] }>(`/households/${currentId}/recurring`),
      api.get<{ categories: Category[] }>(`/households/${currentId}/categories`),
    ]);
    setRecurring(rRes.data.recurring);
    setCategories(cRes.data.categories);
  }, [currentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/households/${currentId}/recurring`, {
        ...form,
        amount: Number(form.amount),
        dayOfMonth: Number(form.dayOfMonth),
        categoryId: form.categoryId || null,
      });
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setError(getErrorMessage(err, '등록에 실패했습니다.'));
    }
  }

  async function toggleActive(r: RecurringRule) {
    await api.patch(`/households/${currentId}/recurring/${r.id}`, { isActive: !r.isActive });
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm('이 고정비를 삭제할까요?')) return;
    await api.delete(`/households/${currentId}/recurring/${id}`);
    load();
  }

  return (
    <div className="page">
      <h2>고정비 / 반복 지출</h2>
      <p className="muted">여기에 등록해두면 매월 지정한 날짜에 자동으로 거래 내역에 기록됩니다.</p>

      <form className="card" onSubmit={handleSubmit}>
        <div className="type-toggle">
          <button
            type="button"
            className={form.type === 'expense' ? 'active expense' : ''}
            onClick={() => setForm({ ...form, type: 'expense', categoryId: '' })}
          >
            지출
          </button>
          <button
            type="button"
            className={form.type === 'income' ? 'active income' : ''}
            onClick={() => setForm({ ...form, type: 'income', categoryId: '' })}
          >
            수입
          </button>
        </div>
        <input
          type="number"
          placeholder="금액"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
        <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
          <option value="">카테고리 선택</option>
          {categories
            .filter((c) => c.type === form.type)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <input
          type="text"
          placeholder="메모 (예: 월세, 넷플릭스)"
          value={form.memo}
          onChange={(e) => setForm({ ...form, memo: e.target.value })}
        />
        <label>
          매월
          <input
            type="number"
            min="1"
            max="28"
            value={form.dayOfMonth}
            onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })}
            style={{ width: '4em' }}
          />
          일에 자동 기록
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">등록</button>
      </form>

      <ul className="transaction-list">
        {recurring.map((r) => (
          <li key={r.id} className={`transaction-item ${r.type}`}>
            <div className="transaction-main">
              <div>
                <p className="transaction-category">
                  {r.categoryName || '미분류'}
                  {r.memo ? ` · ${r.memo}` : ''}
                </p>
                <p className="muted small">
                  매월 {r.dayOfMonth}일 · {r.isActive ? '활성' : '중지됨'}
                </p>
              </div>
            </div>
            <div className="transaction-actions">
              <span className={`amount ${r.type}`}>
                {r.type === 'income' ? '+' : '-'}
                {formatCurrency(r.amount)}
              </span>
              <button onClick={() => toggleActive(r)}>{r.isActive ? '중지' : '재개'}</button>
              <button onClick={() => handleDelete(r.id)}>삭제</button>
            </div>
          </li>
        ))}
        {recurring.length === 0 && <p className="muted">등록된 고정비가 없습니다.</p>}
      </ul>
    </div>
  );
}
