import { describe, expect, it } from 'vitest';
import { Category } from '../types';
import { MemoCategory, suggestCategories } from './categorySuggest';

const cat = (id: number, name: string, type: 'expense' | 'income' = 'expense'): Category => ({
  id,
  name,
  type,
  color: '#000000',
  isDate: false,
});

const expenseCats = [cat(1, '식비'), cat(2, '카페/간식'), cat(4, '데이트'), cat(6, '쇼핑')];
const history: MemoCategory[] = [
  { memo: '스타벅스 강남점', type: 'expense', categoryId: 2, count: 5 },
  { memo: '스타벅스', type: 'expense', categoryId: 4, count: 1 },
  { memo: '아웃백 잠실점', type: 'expense', categoryId: 4, count: 3 },
  { memo: '월급', type: 'income', categoryId: 11, count: 10 },
];

const ids = (memo: string, type: 'expense' | 'income' = 'expense', cats = expenseCats) =>
  suggestCategories(memo, type, history, cats).map((s) => s.categoryId);

describe('suggestCategories', () => {
  it('한 글자로는 추천하지 않는다', () => {
    expect(ids('스')).toEqual([]);
  });

  it('같은 메모로 많이 고른 카테고리가 1순위', () => {
    const result = suggestCategories('스타벅스 강남점', 'expense', history, expenseCats);
    expect(result[0]).toEqual({ categoryId: 2, source: 'history', count: 5 });
  });

  it('지점이 달라도 같은 가게(첫 단어)면 기록을 따른다', () => {
    expect(ids('스타벅스 역삼점')[0]).toBe(2);
  });

  it('우리 가계부 기록이 가게 이름 사전보다 먼저다 (아웃백 → 데이트가 식비보다 앞)', () => {
    expect(ids('아웃백 홍대점')).toEqual([4, 1]);
  });

  it('기록이 없으면 가게 이름 사전으로 짐작한다', () => {
    expect(suggestCategories('쿠팡', 'expense', history, expenseCats)).toEqual([
      { categoryId: 6, source: 'hint', count: 0 },
    ]);
  });

  it('#태그는 빼고 비교한다', () => {
    expect(ids('스타벅스 강남점 #데이트')[0]).toBe(2);
  });

  it('수입/지출 기록은 섞지 않는다', () => {
    expect(ids('월급')).toEqual([]);
    expect(ids('월급', 'income', [cat(11, '월급', 'income')])).toEqual([11]);
  });

  it('지금 고를 수 없는 카테고리는 추천하지 않는다', () => {
    expect(ids('스타벅스 강남점', 'expense', [cat(1, '식비')])).toEqual([]);
  });

  it('최대 3개까지만', () => {
    const many: MemoCategory[] = [1, 2, 4, 6].map((id, i) => ({ memo: '마트', type: 'expense', categoryId: id, count: i + 1 }));
    expect(suggestCategories('마트', 'expense', many, expenseCats)).toHaveLength(3);
  });
});
