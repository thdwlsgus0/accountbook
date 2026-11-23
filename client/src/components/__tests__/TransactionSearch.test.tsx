import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Category, HouseholdMember } from '../../types';
import TransactionSearch, { EMPTY_FILTERS, hasAnyFilter, SearchFilters, TagStat } from '../TransactionSearch';

const categories: Category[] = [
  { id: 1, name: '식비', type: 'expense', color: '#f00', isDate: false },
  { id: 11, name: '월급', type: 'income', color: '#0f0', isDate: false },
];
const members: HouseholdMember[] = [
  { id: 1, name: '지수', email: null, role: 'owner' },
  { id: 2, name: '민호', email: null, role: 'member' },
];
const tags: TagStat[] = [
  { tag: '제주여행', count: 5, expense: 324000 },
  { tag: '생일', count: 2, expense: 80000 },
];

// TransactionSearch는 부모가 조건을 들고 있는 "제어 컴포넌트"라, 테스트에서도 상태를 가진 부모로 감싼다.
function Harness({ onChange }: { onChange?: (f: SearchFilters) => void }) {
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  return (
    <>
      <TransactionSearch
        filters={filters}
        onChange={(next) => {
          setFilters(next);
          onChange?.(next);
        }}
        tags={tags}
        categories={categories}
        members={members}
      />
      <output data-testid="filters">{JSON.stringify(filters)}</output>
    </>
  );
}

const current = (): SearchFilters => JSON.parse(screen.getByTestId('filters').textContent!);

describe('TransactionSearch', () => {
  it('검색어를 치면 q가 바뀐다', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByRole('searchbox'), '스타벅스');
    expect(current().q).toBe('스타벅스');
  });

  it('"#태그"만 쓰고 Enter를 누르면 태그 검색으로 바뀐다 (치는 도중엔 안 바뀜)', async () => {
    render(<Harness />);
    const box = screen.getByRole('searchbox');
    await userEvent.type(box, '#여행');
    expect(current()).toMatchObject({ q: '#여행', tag: '' });
    await userEvent.type(box, '{Enter}');
    expect(current()).toMatchObject({ q: '', tag: '여행' });
  });

  it('태그 칩을 누르면 그 태그로, 다시 누르면 해제된다', async () => {
    render(<Harness />);
    const chip = screen.getByRole('button', { name: /#제주여행/ });
    expect(chip).toHaveTextContent('5건 · 32.4만');
    await userEvent.click(chip);
    expect(current().tag).toBe('제주여행');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(chip);
    expect(current().tag).toBe('');
  });

  it('필터를 열어 조건을 고르면 버튼에 켜진 개수가 보인다', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: '필터' }));
    await userEvent.selectOptions(screen.getByLabelText('종류'), 'expense');
    await userEvent.type(screen.getByPlaceholderText('최소'), '10000');
    expect(current()).toMatchObject({ type: 'expense', min: '10000' });
    expect(screen.getByRole('button', { name: '필터 2' })).toBeInTheDocument();
  });

  it('종류를 지출로 고르면 카테고리 목록에 수입 카테고리가 빠진다', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: '필터' }));
    await userEvent.selectOptions(screen.getByLabelText('종류'), 'expense');
    const options = Array.from((screen.getByLabelText('카테고리') as HTMLSelectElement).options).map((o) => o.text);
    expect(options).toEqual(['전체', '미분류', '식비']);
  });

  it('"지우기"는 조건이 있을 때만 보이고, 누르면 전부 비운다', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.queryByRole('button', { name: '지우기' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox'), '쿠팡');
    await userEvent.click(screen.getByRole('button', { name: '지우기' }));
    expect(onChange).toHaveBeenLastCalledWith(EMPTY_FILTERS);
    expect(hasAnyFilter(current())).toBe(false);
  });
});
