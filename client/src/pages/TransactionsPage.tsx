import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useHousehold } from '../context/HouseholdContext';
import { Category, Transaction, TransactionType } from '../types';
import { formatCurrency } from '../utils/format';

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
}

export default function TransactionsPage() {
  const { currentId } = useHousehold();
  const [month, setMonth] = useState(currentYearMonth());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);

  const load = useCallback(async () => {
    if (!currentId) return;
    const [tRes, cRes] = await Promise.all([
      api.get<{ transactions: Transaction[] }>(`/households/${currentId}/transactions`, { params: { month } }),
      api.get<{ categories: Category[] }>(`/households/${currentId}/categories`),
    ]);
    setTransactions(tRes.data.transactions);
    setCategories(cRes.data.categories);
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
    });
  }

  async function saveEdit(id: number) {
    if (!editForm || !currentId) return;
    await api.put(`/households/${currentId}/transactions/${id}`, {
      ...editForm,
      amount: Number(editForm.amount),
      categoryId: editForm.categoryId || null,
    });
    setEditingId(null);
    load();
  }

  async function handleDelete(id: number) {
    if (!currentId || !confirm('이 내역을 삭제할까요?')) return;
    await api.delete(`/households/${currentId}/transactions/${id}`);
    load();
  }

  return (
    <div className="page">
      <div className="month-nav">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      <ul className="transaction-list">
        {transactions.map((t) => (
          <li key={t.id} className={`transaction-item ${t.type}`}>
            {editingId === t.id && editForm ? (
              <div className="edit-row">
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
                <input
                  type="text"
                  value={editForm.memo}
                  onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                />
                <input
                  type="date"
                  value={editForm.occurredOn}
                  onChange={(e) => setEditForm({ ...editForm, occurredOn: e.target.value })}
                />
                <button onClick={() => saveEdit(t.id)}>저장</button>
                <button onClick={() => setEditingId(null)}>취소</button>
              </div>
            ) : (
              <>
                <div className="transaction-main">
                  <span className="category-dot" style={{ backgroundColor: t.categoryColor || '#ccc' }} />
                  <div>
                    <p className="transaction-category">
                      {t.categoryName || '미분류'}
                      {t.memo ? ` · ${t.memo}` : ''}
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
                  <button onClick={() => startEdit(t)}>수정</button>
                  <button onClick={() => handleDelete(t.id)}>삭제</button>
                </div>
              </>
            )}
          </li>
        ))}
        {transactions.length === 0 && <p className="muted">기록된 내역이 없습니다.</p>}
      </ul>
    </div>
  );
}
