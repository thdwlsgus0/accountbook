import { MonthSettlement } from '../types';
import { formatCurrency } from '../utils/format';

// "이번 달 누가 얼마 더 냈는지" 자동 계산해서, 차액의 절반만 보내면 정산이 끝나도록 보여준다.
// 공용가계부라 모든 지출을 공동 지출로 보고 구성원 둘이 똑같이 나눠 낸다고 가정한다.
export default function SettlementCard({ data }: { data: MonthSettlement }) {
  const { members, totalExpense, settlement } = data;

  return (
    <section className="card settlement-card">
      <h3>이번 달 정산</h3>

      {members.length < 2 ? (
        <p className="muted">파트너가 가계부에 참여하면 누가 얼마 더 냈는지 자동으로 계산해드려요.</p>
      ) : (
        <>
          <ul className="settlement-members">
            {members.map((m) => (
              <li key={m.userId} className="settlement-member">
                <span className="navbar-avatar">{m.userName.slice(0, 1)}</span>
                <span className="settlement-member-name">{m.userName}</span>
                <span className="amount expense">{formatCurrency(m.paid)}</span>
              </li>
            ))}
          </ul>

          {totalExpense === 0 ? (
            <p className="muted small">이번 달 지출 내역이 아직 없어요.</p>
          ) : settlement ? (
            <p className="settlement-result">
              <strong>{settlement.fromUserName}</strong>님이 <strong>{settlement.toUserName}</strong>님에게{' '}
              <strong>{formatCurrency(settlement.amount)}</strong> 보내면 정산 끝!
            </p>
          ) : (
            <p className="settlement-result settled">이미 딱 맞게 정산됐어요! 🎉</p>
          )}
        </>
      )}
    </section>
  );
}
