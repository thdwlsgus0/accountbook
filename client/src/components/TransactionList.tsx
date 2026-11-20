import { Transaction } from '../types';
import { formatCurrency, splitBadgeLabel } from '../utils/format';
import ReceiptButton from './ReceiptButton';
import { useNavigate } from 'react-router-dom';
import MemoText from './MemoText';
import { paymentMethodLabel } from '../utils/payment';

export default function TransactionList({ transactions }: { transactions: Transaction[] }) {
  const navigate = useNavigate();
  if (transactions.length === 0) {
    return <p className="muted">기록된 내역이 없습니다.</p>;
  }

  return (
    <ul className="transaction-list">
      {transactions.map((t) => {
        const badge = splitBadgeLabel(t.splitType, t.payerSharePercent);
        return (
          <li key={t.id} className={`transaction-item ${t.type}`}>
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
                      <MemoText
                        memo={t.memo}
                        onTagClick={(tag) => navigate(`/transactions?tag=${encodeURIComponent(tag)}`)}
                      />
                    </>
                  )}
                  {badge && <span className="split-badge">{badge}</span>}
                  {t.hasReceipt && <ReceiptButton transactionId={t.id} />}
                </p>
                <p className="muted small">
                  {t.occurredOn} · {t.userName}
                  {t.type === 'expense' && t.paymentMethod && ` · ${paymentMethodLabel(t.paymentMethod)}`}
                </p>
              </div>
            </div>
            <span className={`amount ${t.type}`}>
              {t.type === 'income' ? '+' : '-'}
              {formatCurrency(t.amount)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
