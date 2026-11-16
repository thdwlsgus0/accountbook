import { MonthSettlement } from '../types';
import { formatCurrency } from '../utils/format';
import SettlementTransfers from './SettlementTransfers';

// "이번 달 누가 누구에게 얼마" 자동 정산. 공동 지출만, 건별 분담 비율을 반영해서 서버가 계산한다.
// 구성원마다 이번 달에 낸 돈과 정산 기준 받을/보낼 돈을 보여주고, 그 아래에 송금 목록을 띄운다.
// 3명 이상이면 송금이 여러 줄이 될 수 있지만 최대 (인원 - 1)번이면 끝나도록 계산돼 있다.
export default function SettlementCard({ data }: { data: MonthSettlement }) {
  const { members, totalExpense, settlements } = data;

  return (
    <section className="card settlement-card">
      <h3>이번 달 정산</h3>

      {members.length < 2 ? (
        <p className="muted">같이 쓰는 사람이 가계부에 참여하면 누가 얼마 더 냈는지 자동으로 계산해드려요.</p>
      ) : (
        <>
          <ul className="settlement-members">
            {members.map((m) => (
              <li key={m.userId} className="settlement-member">
                <span className="navbar-avatar">{m.userName.slice(0, 1)}</span>
                <span className="settlement-member-name">{m.userName}</span>
                <span className="amount expense">{formatCurrency(m.paid)}</span>
                {m.balance !== 0 && (
                  <span className={`settlement-balance ${m.balance > 0 ? 'receive' : 'send'}`}>
                    {m.balance > 0 ? '받을 돈' : '보낼 돈'} {formatCurrency(Math.abs(m.balance))}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {totalExpense === 0 ? (
            <p className="muted small">이번 달 지출 내역이 아직 없어요.</p>
          ) : (
            <SettlementTransfers transfers={settlements} />
          )}
        </>
      )}
    </section>
  );
}
