import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AnimatedNumber from '../AnimatedNumber';
import { formatCurrency } from '../../utils/format';

describe('AnimatedNumber', () => {
  afterEach(() => vi.useRealTimers());

  it('처음엔 바로 최종값을 보여준다 (0부터 올라가지 않음)', () => {
    render(<AnimatedNumber value={125000} format={formatCurrency} />);
    expect(screen.getAllByText('125,000원')).toHaveLength(2); // 보이는 숫자 + 화면 읽기용
  });

  it('값이 바뀌면 굴러간 뒤 새 값에서 멈추고, 화면 읽기용 텍스트는 바로 새 값이다', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const { rerender, container } = render(<AnimatedNumber value={10000} format={formatCurrency} />);
    rerender(<AnimatedNumber value={20000} format={formatCurrency} />);

    expect(container.querySelector('.sr-only')).toHaveTextContent('20,000원');
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('20,000원');
  });
});
