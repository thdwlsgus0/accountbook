import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, getErrorMessage } from '../api/client';
import { Category, ExpenseTemplate, PaymentMethod, SplitType, TransactionType } from '../types';
import Spinner from './Spinner';
import SplitControl from './SplitControl';
import ReceiptPicker from './ReceiptPicker';
import TemplateBar from './TemplateBar';
import PaymentMethodPicker from './PaymentMethodPicker';
import SmsPasteBox from './SmsPasteBox';
import { ParsedSms } from '../utils/smsParser';
import { MemoCategory, suggestCategories } from '../utils/categorySuggest';
import { useToast } from '../context/ToastContext';
import { getOnce } from '../utils/prefetch';
import { formatCurrency } from '../utils/format';
import { readLastPaymentMethod, writeLastPaymentMethod } from '../utils/payment';
import { uploadReceipt } from '../utils/receipt';

interface QuickAddFormProps {
  householdId: number;
  categories: Category[];
  // 기록이 생기면 그 거래 id를 넘긴다 (대시보드가 방금 기록한 내역을 반짝이게). 되돌리면 id 없이 부른다.
  onAdded: (newId?: number) => void;
  // "사도 될까?" 요청을 보냈을 때 (대시보드의 요청 카드를 새로 고치게 한다)
  onRequested?: () => void;
}

// 이 금액 이상인 지출은 기록하기 전에 상대방에게 "사도 될까?"를 물어볼 수 있게 버튼을 띄운다.
const LARGE_EXPENSE_THRESHOLD = 100000;

// "빠른 입력"이 핵심 요구사항이므로 필드 수를 최소화하고,
// 금액 입력창에 자동 포커스를 준다.
export default function QuickAddForm({ householdId, categories, onAdded, onRequested }: QuickAddFormProps) {
  const { showToast } = useToast();
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  // 사용자가 카테고리를 직접 골랐는지. 직접 고르기 전까지는 메모에 맞춰 추천 1순위를 자동으로 골라둔다.
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [memoHistory, setMemoHistory] = useState<MemoCategory[]>([]);
  const [memo, setMemo] = useState('');
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [splitType, setSplitType] = useState<SplitType>('shared');
  const [payerSharePercent, setPayerSharePercent] = useState(50);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(readLastPaymentMethod);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState<ExpenseTemplate[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [notice, setNotice] = useState('');
  // 기록하고 나면 올려서 문자 붙여넣기 칸을 새로 그린다(붙여넣은 문자와 결과 지우기).
  const [smsKey, setSmsKey] = useState(0);

  const loadTemplates = useCallback(async () => {
    const data = await getOnce<{ templates: ExpenseTemplate[] }>(`/households/${householdId}/templates`);
    setTemplates(data.templates);
  }, [householdId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const loadMemoHistory = useCallback(async () => {
    const data = await getOnce<{ memoCategories: MemoCategory[] }>(
      `/households/${householdId}/transactions/memo-categories`
    );
    setMemoHistory(data.memoCategories);
  }, [householdId]);

  useEffect(() => {
    // 추천은 있으면 좋은 기능이라, 불러오기에 실패해도 입력은 그대로 되게 조용히 넘긴다.
    loadMemoHistory().catch(() => setMemoHistory([]));
  }, [loadMemoHistory]);

  const filteredCategories = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);
  const suggestions = useMemo(
    () => suggestCategories(memo, type, memoHistory, filteredCategories),
    [memo, type, memoHistory, filteredCategories]
  );

  useEffect(() => {
    setCategoryId('');
    setCategoryTouched(false);
  }, [type]);

  // 직접 고르기 전에는 메모가 바뀔 때마다 추천 1순위로 맞춰둔다 (추천이 없으면 비움).
  useEffect(() => {
    if (categoryTouched) return;
    setCategoryId(suggestions[0] ? String(suggestions[0].categoryId) : '');
  }, [suggestions, categoryTouched]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setNotice('');
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
        paymentMethod: type === 'expense' ? paymentMethod : null,
      });
      if (type === 'expense') writeLastPaymentMethod(paymentMethod);
      const recordedLabel = `${memo.trim() ? `${memo.trim()} ` : ''}${formatCurrency(Number(amount))}`;
      setAmount('');
      setMemo('');
      setCategoryTouched(false);
      if (type === 'expense' && receiptFile) {
        // 내역 자체는 이미 저장됐으니, 사진만 실패하면 그렇다고 알려주고 목록은 갱신한다.
        try {
          await uploadReceipt(householdId, res.data.id, receiptFile);
        } catch (err) {
          setError(getErrorMessage(err, '내역은 기록됐지만 영수증 사진 업로드에 실패했습니다.'));
        }
      }
      setReceiptFile(null);
      setSmsKey((k) => k + 1);
      // 방금 기록한 메모·카테고리도 다음 추천에 반영되게 다시 불러온다.
      loadMemoHistory().catch(() => {});
      onAdded(res.data.id);
      showToast(`${recordedLabel} 기록했어요`, {
        action: {
          label: '되돌리기',
          onClick: async () => {
            try {
              await api.delete(`/households/${householdId}/transactions/${res.data.id}`);
              onAdded();
              showToast('기록을 되돌렸어요');
            } catch (err) {
              showToast(getErrorMessage(err, '되돌리지 못했어요. 전체 내역에서 지워주세요.'), { tone: 'error' });
            }
          },
        },
      });
    } catch (err) {
      setError(getErrorMessage(err, '기록에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  }

  // 카드 문자에서 읽은 항목만 입력칸에 채운다. 못 읽은 항목은 사용자가 이미 적어둔 값을 그대로 둔다.
  function applySms(r: ParsedSms) {
    if (r.amount != null) setAmount(String(r.amount));
    if (r.merchant) setMemo(r.merchant);
    if (r.occurredOn) setOccurredOn(r.occurredOn);
    if (r.paymentMethod) setPaymentMethod(r.paymentMethod);
    // 카테고리는 메모(가게 이름)가 바뀌면 자동 추천이 알아서 골라준다.
  }

  // 지금 입력한 메모·금액·카테고리·분담 비율을 그대로 템플릿으로 저장한다. 메모가 템플릿 이름이 된다.
  async function handleSaveTemplate() {
    setError('');
    if (!memo.trim() || !amount || Number(amount) <= 0) {
      setError('템플릿으로 저장하려면 메모(이름)와 금액을 입력해주세요.');
      return;
    }
    if (splitType === 'shared' && (payerSharePercent < 1 || payerSharePercent > 99)) {
      setError('분담 비율은 1~99 사이로 입력해주세요.');
      return;
    }
    setSavingTemplate(true);
    try {
      await api.post(`/households/${householdId}/templates`, {
        name: memo.trim(),
        amount: Number(amount),
        categoryId: categoryId || null,
        splitType,
        payerSharePercent,
        paymentMethod,
      });
      loadTemplates();
    } catch (err) {
      setError(getErrorMessage(err, '템플릿 저장에 실패했습니다.'));
    } finally {
      setSavingTemplate(false);
    }
  }

  // 큰 지출은 바로 기록하는 대신 상대방에게 먼저 물어본다. 승인되면 요청 카드에서 "샀어요!"로 기록한다.
  async function handleRequest() {
    setError('');
    setNotice('');
    if (!memo.trim()) {
      setError('무엇을 사려는지 메모에 적어주세요.');
      return;
    }
    if (splitType === 'shared' && (payerSharePercent < 1 || payerSharePercent > 99)) {
      setError('분담 비율은 1~99 사이로 입력해주세요.');
      return;
    }
    setRequesting(true);
    try {
      await api.post(`/households/${householdId}/purchase-requests`, {
        title: memo.trim(),
        amount: Number(amount),
        categoryId: categoryId || null,
        splitType,
        payerSharePercent,
      });
      setAmount('');
      setMemo('');
      setNotice('상대방에게 물어봤어요. 승인되면 위 "사도 될까?" 카드에서 기록할 수 있어요.');
      onRequested?.();
    } catch (err) {
      setError(getErrorMessage(err, '요청에 실패했습니다.'));
    } finally {
      setRequesting(false);
    }
  }

  const isLargeExpense = type === 'expense' && Number(amount) >= LARGE_EXPENSE_THRESHOLD;

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

      {type === 'expense' && <SmsPasteBox key={smsKey} onParsed={applySms} />}

      {type === 'expense' && (
        <TemplateBar householdId={householdId} templates={templates} onChanged={loadTemplates} onAdded={onAdded} />
      )}

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
        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setCategoryTouched(true);
          }}
        >
          <option value="">카테고리 선택</option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <input type="text" placeholder="메모 (선택) · #태그" value={memo} onChange={(e) => setMemo(e.target.value)} />
        <input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
      </div>

      {suggestions.length > 0 && (
        <div className="category-suggest" role="group" aria-label="추천 카테고리">
          <span className="muted small">추천</span>
          {suggestions.map((sg) => {
            const category = filteredCategories.find((c) => c.id === sg.categoryId);
            if (!category) return null;
            const active = categoryId === String(sg.categoryId);
            return (
              <button
                key={sg.categoryId}
                type="button"
                className={active ? 'suggest-chip active' : 'suggest-chip'}
                aria-pressed={active}
                onClick={() => {
                  setCategoryId(String(sg.categoryId));
                  setCategoryTouched(true);
                }}
              >
                <span className="category-dot" style={{ backgroundColor: category.color, color: category.color }} />
                {category.name}
                <span className="suggest-reason">{sg.source === 'history' ? `${sg.count}번 고름` : '가게 이름'}</span>
              </button>
            );
          })}
        </div>
      )}

      {type === 'expense' && (
        <>
          <PaymentMethodPicker value={paymentMethod} onChange={(m) => m && setPaymentMethod(m)} />
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

      {isLargeExpense && (
        <p className="muted small large-expense-hint">💸 큰 지출이네요. 사기 전에 상대방에게 물어볼 수도 있어요.</p>
      )}
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <div className="quick-add-actions">
        {type === 'expense' && (
          <button type="button" disabled={savingTemplate} onClick={handleSaveTemplate}>
            ⭐ 템플릿으로 저장
          </button>
        )}
        {isLargeExpense && (
          <button type="button" disabled={requesting} onClick={handleRequest}>
            🙋 사도 될까? 물어보기
          </button>
        )}
        <button type="submit" disabled={submitting}>
          {submitting && <Spinner size="sm" variant="on-primary" />}
          {submitting ? '기록 중...' : '기록하기'}
        </button>
      </div>
    </form>
  );
}
