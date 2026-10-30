import { FormEvent, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../api/client';
import { Category, SplitType, TransactionType } from '../types';
import Spinner from './Spinner';
import SplitControl from './SplitControl';
import ReceiptPicker from './ReceiptPicker';
import { uploadReceipt } from '../utils/receipt';

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
  const [splitType, setSplitType] = useState<SplitType>('shared');
  const [payerSharePercent, setPayerSharePercent] = useState(50);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
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
    if (type === 'expense' && splitType === 'shared' && (payerSharePercent < 1 || payerSharePercent > 99)) {
      setError('분담 비율은 1~99 사이로 입력해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ id: number }>(`/households/${householdId}/transactions`, {
        type,
        amount: Number(amount),
        categoryId: categoryId || null,
        memo: memo || null,
        occurredOn,
        // 수입은 나눠 부담할 일이 없으니 그냥 공동/100%로 둔다 (서버도 이 값을 신경 안 씀).
        splitType: type === 'expense' ? splitType : 'shared',
        payerSharePercent: type === 'expense' ? payerSharePercent : 50,
      });
      setAmount('');
      setMemo('');
      if (type === 'expense' && receiptFile) {
        // 내역 자체는 이미 저장됐으니, 사진만 실패하면 그렇다고 알려주고 목록은 갱신한다.
        try {
          await uploadReceipt(householdId, res.data.id, receiptFile);
        } catch (err) {
          setError(getErrorMessage(err, '내역은 기록됐지만 영수증 사진 업로드에 실패했습니다.'));
        }
      }
      setReceiptFile(null);
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

      {type === 'expense' && (
        <>
          <SplitControl
            splitType={splitType}
            payerSharePercent={payerSharePercent}
            onChange={(next) => {
              setSplitType(next.splitType);
              setPayerSharePercent(next.payerSharePercent);
            }}
          />
          <ReceiptPicker file={receiptFile} onChange={setReceiptFile} />
        </>
      )}

      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting && <Spinner size="sm" variant="on-primary" />}
        {submitting ? '기록 중...' : '기록하기'}
      </button>
    </form>
  );
}
