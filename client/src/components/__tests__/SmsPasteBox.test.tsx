import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SmsPasteBox from '../SmsPasteBox';

const SMS = '[Web발신]\n신한카드(1234)승인\n홍*동\n12,500원 일시불\n11/17 14:02 스타벅스 강남점';

async function openAndPaste(text: string) {
  const onParsed = vi.fn();
  render(<SmsPasteBox onParsed={onParsed} />);
  await userEvent.click(screen.getByRole('button', { name: /카드 문자 붙여넣기/ }));
  const textarea = screen.getByRole('textbox');
  textarea.focus();
  await userEvent.paste(text);
  return onParsed;
}

describe('SmsPasteBox', () => {
  it('처음엔 버튼만 보이고, 누르면 붙여넣기 칸이 열린다', async () => {
    render(<SmsPasteBox onParsed={vi.fn()} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /카드 문자 붙여넣기/ }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('붙여넣으면 읽은 결과를 넘기고, 읽은 항목을 칩으로 보여준다', async () => {
    const onParsed = await openAndPaste(SMS);
    expect(onParsed).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount: 12500, merchant: '스타벅스 강남점', paymentMethod: 'card' })
    );
    expect(screen.getByText('12,500원')).toBeInTheDocument();
    expect(screen.getByText('스타벅스 강남점')).toBeInTheDocument();
    expect(screen.getByText(/채워뒀어요/)).toBeInTheDocument();
  });

  it('못 읽은 항목은 알려준다', async () => {
    await openAndPaste('아무 문장');
    expect(screen.getByText(/금액, 가게, 날짜은\(는\) 못 읽었어요/)).toBeInTheDocument();
  });

  it('승인 취소 문자면 경고한다', async () => {
    await openAndPaste('[Web발신]\n신한카드 승인취소\n12,500원\n11/17 15:10 스타벅스');
    expect(screen.getByText(/승인 취소 문자예요/)).toBeInTheDocument();
  });

  it('닫으면 다시 버튼만 남는다', async () => {
    await openAndPaste(SMS);
    await userEvent.click(screen.getByRole('button', { name: '문자 붙여넣기 닫기' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
