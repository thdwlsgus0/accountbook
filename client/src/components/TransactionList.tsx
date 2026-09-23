import { Transaction } from '../types';
import { formatCurrency } from '../utils/format';

export default function TransactionList({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return <p className="muted">기록된 내역이 없습니다.</p>;
  }

  return (
    <ul className="transaction-list">
      {transactions.map((t) => (
        <li key={t.id} className={`transaction-item ${t.type}`}>
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
          <span className={`amount ${t.type}`}>
            {t.type === 'income' ? '+' : '-'}
            {formatCurrency(t.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}
