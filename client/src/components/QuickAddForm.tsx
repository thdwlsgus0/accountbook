import { FormEvent, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../api/client';
import { Category, TransactionType } from '../types';

interface QuickAddFormProps {
  householdId: number;
  categories: Category[];
  onAdded: () => void;
}

// "빠른 입력"이 핵심 요구사항이므로 필드 수를 최소화하고,
// 금액 입력창에 자동 포커스를 준다.
export default function QuickAddForm({ householdId, categories, onAdded }: QuickAddFormProps) {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [memo, setMemo] = useState('');
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const filteredCategories = categories.filter((c) => c.type === type);

  useEffect(() => {
    setCategoryId('');
  }, [type]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!amount || Number(amount) <= 0) {
      setError('금액을 입력해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/households/${householdId}/transactions`, {
        type,
        amount: Number(amount),
        categoryId: categoryId || null,
        memo: memo || null,
        occurredOn,
      });
      setAmount('');
      setMemo('');
      onAdded();
    } catch (err) {
      setError(getErrorMessage(err, '기록에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="quick-add card" onSubmit={handleSubmit}>
      <div className="type-toggle">
        <button
          type="button"
          className={type === 'expense' ? 'active expense' : ''}
          onClick={() => setType('expense')}
        >
          지출
        </button>
        <button
          type="button"
          className={type === 'income' ? 'active income' : ''}
          onClick={() => setType('income')}
        >
          수입
        </button>
      </div>

      <div className="form-row">
        <input
          type="number"
          inputMode="numeric"
          placeholder="금액"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="quick-amount"
          autoFocus
        />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">카테고리 선택</option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <input type="text" placeholder="메모 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} />
        <input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
      </div>

      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? '기록 중...' : '기록하기'}
      </button>
    </form>
  );
}
