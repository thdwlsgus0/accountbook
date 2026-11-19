import { Category, TransactionType } from '../types';

// 카테고리 자동 추천. 빠른 입력에서 메모를 쓰면 어떤 카테고리일지 짐작해서 골라둔다.
// 1순위: 이 가계부에서 같은 메모(또는 같은 가게)로 예전에 고른 카테고리 — 우리 집 습관이 제일 정확하다.
// 2순위: 기록이 없으면 가게 이름 사전으로 짐작 (스타벅스 → 카페/간식). 카드 문자 붙여넣기도 이걸 쓴다.

// 서버 GET /transactions/memo-categories 응답 한 줄
export interface MemoCategory {
  memo: string;
  type: TransactionType;
  categoryId: number;
  count: number;
}

export interface CategorySuggestion {
  categoryId: number;
  // 'history': 예전에 같은 메모/가게로 고른 적 있음, 'hint': 가게 이름 사전으로 짐작
  source: 'history' | 'hint';
  // history일 때 예전에 고른 횟수
  count: number;
}

export const CATEGORY_HINTS: Array<{ pattern: RegExp; names: string[] }> = [
  { pattern: /스타벅스|커피|카페|투썸|메가MGC|메가커피|이디야|빽다방|폴바셋|할리스|파스쿠찌|베이커리|파리바게뜨|뚜레쥬르|배스킨|던킨/i, names: ['카페/간식', '카페', '간식'] },
  { pattern: /배달의민족|배민|요기요|쿠팡이츠|식당|김밥|치킨|피자|버거|맥도날드|롯데리아|버거킹|아웃백|국밥|분식|고기|초밥|마라/, names: ['식비', '외식'] },
  { pattern: /이마트|홈플러스|롯데마트|코스트코|GS25|CU|세븐일레븐|이마트24|마트|편의점/, names: ['식비', '생활'] },
  { pattern: /쿠팡|무신사|올리브영|다이소|11번가|G마켓|지마켓|SSG|오늘의집|29CM|에이블리|지그재그/, names: ['쇼핑'] },
  { pattern: /택시|카카오T|티머니|지하철|버스|코레일|KTX|SRT|주유|GS칼텍스|SK에너지|S-OIL|주차/, names: ['교통'] },
  { pattern: /CGV|메가박스|롯데시네마|넷플릭스|유튜브|멜론|노래방|볼링|PC방/, names: ['문화/여가', '여가'] },
  { pattern: /병원|의원|약국|치과|한의원/, names: ['의료/건강', '의료'] },
  { pattern: /SKT|KT|LG U\+|LGU\+|통신|관리비|전기|가스|수도/, names: ['주거/통신', '통신'] },
];

// 비교용으로 대소문자·공백을 없앤다. "스타벅스 강남점"과 "스타벅스강남점"을 같게 본다.
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '');
}

// 첫 단어를 가게(브랜드) 이름으로 본다. "스타벅스 강남점" → "스타벅스"
function brandOf(text: string): string {
  return normalize(text.trim().split(/\s+/)[0] ?? '');
}

function hintCategoryIds(memo: string, categories: Category[]): number[] {
  const ids: number[] = [];
  for (const hint of CATEGORY_HINTS) {
    if (!hint.pattern.test(memo)) continue;
    const exact = hint.names.map((n) => categories.find((c) => c.name === n)).find(Boolean);
    const partial = categories.find((c) => hint.names.some((n) => c.name.includes(n.split('/')[0])));
    const match = exact ?? partial;
    if (match && !ids.includes(match.id)) ids.push(match.id);
  }
  return ids;
}

// categories는 지금 고른 종류(지출/수입)의 카테고리만 넘긴다. 점수가 높은 순으로 최대 3개.
export function suggestCategories(
  memo: string,
  type: TransactionType,
  history: MemoCategory[],
  categories: Category[]
): CategorySuggestion[] {
  const full = normalize(memo);
  if (full.length < 2) return [];
  const brand = brandOf(memo);
  const allowed = new Set(categories.map((c) => c.id));

  const scores = new Map<number, { score: number; count: number }>();
  for (const row of history) {
    if (row.type !== type || !allowed.has(row.categoryId)) continue;
    const rowFull = normalize(row.memo);
    let weight = 0;
    if (rowFull === full) weight = 3; // 메모가 똑같음
    else if ((brand.length >= 2 && brandOf(row.memo) === brand) || rowFull.startsWith(full)) weight = 1; // 같은 가게 / 쓰는 중인 메모로 시작
    if (weight === 0) continue;
    const prev = scores.get(row.categoryId) ?? { score: 0, count: 0 };
    scores.set(row.categoryId, { score: prev.score + row.count * weight, count: prev.count + row.count });
  }

  const result: CategorySuggestion[] = [...scores]
    .sort((a, b) => b[1].score - a[1].score)
    .map(([categoryId, s]) => ({ categoryId, source: 'history' as const, count: s.count }));

  // 사전 짐작은 기록이 없는 카테고리만 뒤에 붙인다 (기록이 사전보다 우선).
  if (type === 'expense') {
    for (const id of hintCategoryIds(memo, categories)) {
      if (!result.some((r) => r.categoryId === id)) result.push({ categoryId: id, source: 'hint', count: 0 });
    }
  }
  return result.slice(0, 3);
}
