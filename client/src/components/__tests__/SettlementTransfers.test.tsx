import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SettlementTransfers from '../SettlementTransfers';

describe('SettlementTransfers', () => {
  it('송금할 게 없으면 "이미 딱 맞게 냈어요"', () => {
    render(<SettlementTransfers transfers={[]} />);
    expect(screen.getByText(/이미 딱 맞게 냈어요/)).toBeInTheDocument();
  });

  it('한 번이면 "보내면 정산 끝!"', () => {
    render(<SettlementTransfers transfers={[{ fromUserName: '지수', toUserName: '민호', amount: 15000 }]} />);
    expect(screen.getByRole('listitem')).toHaveTextContent('지수님 → 민호님 15,000원');
    expect(screen.getByText('보내면 정산 끝!')).toBeInTheDocument();
  });

  it('여러 명이면 송금 줄과 횟수를 보여준다', () => {
    render(
      <SettlementTransfers
        transfers={[
          { fromUserName: 'C', toUserName: 'A', amount: 40000 },
          { fromUserName: 'B', toUserName: 'A', amount: 10000 },
        ]}
      />
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('2번만 보내면 정산 끝!')).toBeInTheDocument();
  });
});
