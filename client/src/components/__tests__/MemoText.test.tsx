import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MemoText from '../MemoText';

describe('MemoText', () => {
  it('메모 속 #태그를 버튼으로 보여주고, 누르면 그 태그를 알려준다', async () => {
    const onTagClick = vi.fn();
    render(
      <p>
        <MemoText memo="흑돼지 #제주여행 #데이트" onTagClick={onTagClick} />
      </p>
    );

    expect(screen.getByText(/흑돼지/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '#제주여행' }));
    expect(onTagClick).toHaveBeenCalledWith('제주여행');
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('누를 곳이 없으면(onTagClick 없음) 태그를 강조만 한다', () => {
    render(<MemoText memo="스타벅스 #데이트" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('#데이트')).toHaveClass('memo-tag');
  });

  it('태그가 없으면 메모를 그대로 보여준다', () => {
    const { container } = render(<MemoText memo="그냥 메모" />);
    expect(container).toHaveTextContent('그냥 메모');
  });
});
