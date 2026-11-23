import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PaymentMethodPicker from '../PaymentMethodPicker';

describe('PaymentMethodPicker', () => {
  it('고른 결제수단이 눌린 상태로 보이고, 다른 걸 누르면 알려준다', async () => {
    const onChange = vi.fn();
    render(<PaymentMethodPicker value="card" onChange={onChange} />);
    expect(screen.getByRole('button', { name: /카드/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /네이버페이/ }));
    expect(onChange).toHaveBeenCalledWith('naverpay');
  });

  it('allowClear면 고른 걸 다시 눌러 "미지정"으로 되돌린다', async () => {
    const onChange = vi.fn();
    render(<PaymentMethodPicker value="cash" onChange={onChange} allowClear />);
    await userEvent.click(screen.getByRole('button', { name: /현금/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('allowClear가 없으면 다시 눌러도 그대로', async () => {
    const onChange = vi.fn();
    render(<PaymentMethodPicker value="cash" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /현금/ }));
    expect(onChange).toHaveBeenCalledWith('cash');
  });
});
