import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from '../ToastContext';

function Trigger({ onUndo }: { onUndo?: () => void }) {
  const { showToast } = useToast();
  return (
    <>
      <button onClick={() => showToast('12,500원 기록했어요', onUndo && { action: { label: '되돌리기', onClick: onUndo } })}>
        기록
      </button>
      <button onClick={() => showToast('두 번째 알림')}>또</button>
    </>
  );
}

describe('ToastProvider', () => {
  afterEach(() => vi.useRealTimers());

  it('알림을 띄우고, 되돌리기를 누르면 동작을 실행하고 닫힌다', async () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Trigger onUndo={onUndo} />
      </ToastProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: '기록' }));
    expect(screen.getByRole('status')).toHaveTextContent('12,500원 기록했어요');

    await userEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('새 알림이 오면 바로 바꾸고, 시간이 지나면 저절로 사라진다', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    act(() => screen.getByRole('button', { name: '기록' }).click());
    act(() => screen.getByRole('button', { name: '또' }).click());
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('두 번째 알림');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('Provider 밖에서 쓰면 바로 알 수 있게 에러를 낸다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/);
  });
});
