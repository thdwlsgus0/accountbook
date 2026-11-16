import { formatCurrency } from '../utils/format';

export interface TransferView {
  fromUserName: string;
  toUserName: string;
  amount: number;
}

// "누가 누구에게 얼마" 송금 목록. 이번 달 정산 카드와 더치페이 미리보기에서 같이 쓴다.
// 2명이면 한 줄, 여러 명이면 최대 (인원 - 1)줄이 나온다. 비어 있으면 이미 딱 맞게 낸 상태.
export default function SettlementTransfers({ transfers }: { transfers: TransferView[] }) {
  if (transfers.length === 0) {
    return <p className="settlement-result settled">이미 딱 맞게 냈어요! 🎉</p>;
  }

  return (
    <div className="settlement-result">
      <ul className="settlement-transfers">
        {transfers.map((t, i) => (
          <li key={i}>
            <strong>{t.fromUserName}</strong>님 → <strong>{t.toUserName}</strong>님{' '}
            <strong>{formatCurrency(t.amount)}</strong>
          </li>
        ))}
      </ul>
      <p className="settlement-transfers-footer">
        {transfers.length === 1 ? '보내면 정산 끝!' : `${transfers.length}번만 보내면 정산 끝!`}
      </p>
    </div>
  );
}
