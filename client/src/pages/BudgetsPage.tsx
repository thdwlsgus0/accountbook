import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useHousehold } from '../context/HouseholdContext';
import { Budget, Category } from '../types';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function BudgetsPage() {
  const { currentId } = useHousehold();
  const [month, setMonth] = useState(currentYearMonth());
  const [categories, setCategories] = useState<Category[]>([]);
  const [amounts, setAmounts] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    if (!currentId) return;
    const [cRes, bRes] = await Promise.all([
      api.get<{ categories: Category[] }>(`/households/${currentId}/categories`),
      api.get<{ budgets: Budget[] }>(`/households/${currentId}/budgets`, { params: { month } }),
    ]);
    setCategories(cRes.data.categories.filter((c) => c.type === 'expense'));
    const map: Record<number, string> = {};
    bRes.data.budgets.forEach((b) => {
      map[b.categoryId] = String(b.amountLimit);
    });
    setAmounts(map);
  }, [currentId, month]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(categoryId: number) {
    const amountLimit = Number(amounts[categoryId] || 0);
    await api.put(`/households/${currentId}/budgets`, { categoryId, month, amountLimit });
    load();
  }

  return (
    <div className="page">
      <div className="month-nav">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <p className="muted">카테고리별로 이번 달 예산을 정해두면, 대시보드에서 초과 여부를 바로 확인할 수 있어요.</p>
      <div className="card">
        {categories.map((c) => (
          <div key={c.id} className="budget-edit-row">
            <span style={{ color: c.color }}>{c.name}</span>
            <input
              type="number"
              placeholder="예산 없음"
              value={amounts[c.id] ?? ''}
              onChange={(e) => setAmounts({ ...amounts, [c.id]: e.target.value })}
            />
            <button onClick={() => handleSave(c.id)}>저장</button>
          </div>
        ))}
      </div>
    </div>
  );
}
