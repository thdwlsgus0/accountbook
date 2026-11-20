import { useState } from 'react';
import { Category, HouseholdMember } from '../types';
import { formatCompactCurrency } from '../utils/format';
import { PAYMENT_METHODS } from '../utils/payment';

// 검색 조건. 전부 문자열이고 빈 값('')이면 그 조건은 안 쓴다 (서버 /transactions/search 파라미터와 같은 이름).
export interface SearchFilters {
  q: string;
  tag: string;
  from: string;
  to: string;
  min: string;
  max: string;
  type: string;
  categoryId: string;
  paymentMethod: string;
  userId: string;
}

export const EMPTY_FILTERS: SearchFilters = {
  q: '',
  tag: '',
  from: '',
  to: '',
  min: '',
  max: '',
  type: '',
  categoryId: '',
  paymentMethod: '',
  userId: '',
};

export interface TagStat {
  tag: string;
  count: number;
  expense: number;
}

// 검색창·태그 칩 외에 "필터" 안에 숨겨둔 조건들 (몇 개 켜져 있는지 버튼에 보여준다)
const PANEL_KEYS: (keyof SearchFilters)[] = ['from', 'to', 'min', 'max', 'type', 'categoryId', 'paymentMethod', 'userId'];

export function hasAnyFilter(f: SearchFilters): boolean {
  return Object.values(f).some((v) => v !== '');
}

interface TransactionSearchProps {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  tags: TagStat[];
  categories: Category[];
  members: HouseholdMember[];
}

// 전체 내역 위의 검색: 메모·카테고리 검색어, 자주 쓴 #태그 칩, 펼쳐보는 상세 필터.
export default function TransactionSearch({ filters, onChange, tags, categories, members }: TransactionSearchProps) {
  const [panelOpen, setPanelOpen] = useState(() => PANEL_KEYS.some((k) => filters[k] !== ''));
  const activePanelCount = PANEL_KEYS.filter((k) => filters[k] !== '').length;
  const set = (patch: Partial<SearchFilters>) => onChange({ ...filters, ...patch });

  // 검색창에 "#여행"처럼 태그 하나만 쓰고 Enter를 누르면 글자 검색 대신 태그 검색으로 바꾼다.
  // (치는 도중에 바꾸면 입력칸이 비워져서 Enter에서만 바꾼다. 그 전엔 "#여행" 글자 검색으로 동작한다.)
  function commitQuery() {
    const tagOnly = filters.q.trim().match(/^#([^\s#]{1,20})$/);
    if (tagOnly) set({ q: '', tag: tagOnly[1] });
  }

  return (
    <div className="card tx-search">
      <div className="tx-search-row">
        <input
          id="tx-search-q"
          type="search"
          placeholder="메모·카테고리 검색 또는 #태그"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitQuery();
          }}
        />
        <button
          type="button"
          className={panelOpen || activePanelCount > 0 ? 'active' : ''}
          aria-expanded={panelOpen}
          aria-controls="tx-search-panel"
          onClick={() => setPanelOpen((v) => !v)}
        >
          필터{activePanelCount > 0 ? ` ${activePanelCount}` : ''}
        </button>
        {hasAnyFilter(filters) && (
          <button type="button" onClick={() => onChange(EMPTY_FILTERS)}>
            지우기
          </button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="tx-tags" role="group" aria-label="자주 쓴 태그">
          {tags.slice(0, 12).map((t) => {
            const active = filters.tag === t.tag;
            return (
              <button
                key={t.tag}
                type="button"
                className={active ? 'tx-tag active' : 'tx-tag'}
                aria-pressed={active}
                onClick={() => set({ tag: active ? '' : t.tag })}
              >
                #{t.tag}
                <span>
                  {t.count}건{t.expense > 0 ? ` · ${formatCompactCurrency(t.expense)}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {filters.tag && !tags.some((t) => t.tag === filters.tag) && (
        <div className="tx-tags">
          <button type="button" className="tx-tag active" aria-pressed onClick={() => set({ tag: '' })}>
            #{filters.tag} ×
          </button>
        </div>
      )}

      {panelOpen && (
        <div className="tx-search-panel" id="tx-search-panel">
          <label>
            <span>기간</span>
            <div className="tx-range">
              <input id="tx-from" type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
              <span>~</span>
              <input id="tx-to" type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
            </div>
          </label>
          <label>
            <span>금액</span>
            <div className="tx-range">
              <input
                id="tx-min"
                type="number"
                inputMode="numeric"
                placeholder="최소"
                value={filters.min}
                onChange={(e) => set({ min: e.target.value })}
              />
              <span>~</span>
              <input
                id="tx-max"
                type="number"
                inputMode="numeric"
                placeholder="최대"
                value={filters.max}
                onChange={(e) => set({ max: e.target.value })}
              />
            </div>
          </label>
          <label>
            <span>종류</span>
            <select id="tx-type" value={filters.type} onChange={(e) => set({ type: e.target.value, categoryId: '' })}>
              <option value="">전체</option>
              <option value="expense">지출</option>
              <option value="income">수입</option>
            </select>
          </label>
          <label>
            <span>카테고리</span>
            <select id="tx-category" value={filters.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
              <option value="">전체</option>
              <option value="none">미분류</option>
              {categories
                .filter((c) => !filters.type || c.type === filters.type)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>결제수단</span>
            <select
              id="tx-payment"
              value={filters.paymentMethod}
              onChange={(e) => set({ paymentMethod: e.target.value })}
            >
              <option value="">전체</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
              <option value="none">미지정</option>
            </select>
          </label>
          {members.length >= 2 && (
            <label>
              <span>작성자</span>
              <select id="tx-user" value={filters.userId} onChange={(e) => set({ userId: e.target.value })}>
                <option value="">전체</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
