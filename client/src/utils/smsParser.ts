import { PaymentMethod } from '../types';

// 카드 승인 문자 / 네이버페이 결제 알림을 붙여넣으면 금액·가게·날짜·결제수단을 뽑아낸다.
// 카드사마다 형식이 조금씩 달라서(줄바꿈 위치, "누적"/"잔액" 줄 유무, 한 줄로 붙어 오는 경우 등)
// 정확한 형식 대신 "금액은 ~원, 날짜는 MM/DD HH:MM, 가게는 그 시각 뒤나 다음 줄"이라는 공통점으로 읽는다.
// 못 읽은 항목은 null로 두고, 화면에서 사용자가 직접 채우게 한다.

export interface ParsedSms {
  amount: number | null;
  // YYYY-MM-DD (문자엔 연도가 없어서 추정한다)
  occurredOn: string | null;
  merchant: string | null;
  paymentMethod: PaymentMethod | null;
  // 승인 취소 문자면 true — 지출로 기록하면 안 된다
  isCancel: boolean;
}

const DATE_TIME = /(\d{1,2})\/(\d{1,2})\s*(\d{1,2}):(\d{2})/;
// 결제 금액이 아닌 금액(누적 사용액, 체크카드 잔액, 포인트 등) 앞에 붙는 말
const NOT_PAYMENT = /(누적|잔액|한도|포인트|적립)\s*:?\s*$/;
// 가게 이름으로 쓰면 안 되는 줄
const NOT_MERCHANT = /누적|잔액|한도|일시불|할부|승인|님$|^\[|원$|Web발신/;

function toNumber(text: string): number {
  return Number(text.replace(/,/g, ''));
}

// 문자엔 월/일만 있다. 올해로 두되, 그러면 미래가 되는 경우(1월에 12월 문자를 붙여넣음)엔 작년으로 본다.
function inferDate(month: number, day: number, now: Date): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = now.getFullYear();
  const candidate = new Date(year, month - 1, day);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (candidate > tomorrow) year -= 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function findAmount(text: string): number | null {
  // "결제금액: 38,900원"처럼 라벨이 붙어 있으면 그걸 우선한다.
  const labeled = text.match(/(?:결제|승인|이용)\s*금액\s*:?\s*([\d,]+)\s*원/);
  if (labeled) return toNumber(labeled[1]);

  for (const m of text.matchAll(/([\d,]*\d)\s*원/g)) {
    const before = text.slice(Math.max(0, m.index! - 6), m.index);
    if (NOT_PAYMENT.test(before)) continue;
    const value = toNumber(m[1]);
    if (value > 0) return value;
  }
  return null;
}

function findMerchant(text: string, lines: string[]): string | null {
  const labeled = text.match(/(?:가맹점|사용처|결제처|상호)\s*:?\s*([^\n]+)/);
  if (labeled) return labeled[1].trim() || null;

  // 1) 시각 바로 뒤 (같은 줄). 한 줄로 붙은 문자는 뒤에 "누적 ..."이 이어지니 거기서 자른다.
  const idx = lines.findIndex((l) => DATE_TIME.test(l));
  if (idx >= 0) {
    const rest = lines[idx]
      .replace(new RegExp(`^.*?${DATE_TIME.source}`), '')
      .replace(/\s*(누적|잔액|한도).*$/, '')
      .trim();
    if (rest) return rest;
    // 2) 시각 다음 줄
    const next = lines[idx + 1];
    if (next && !NOT_MERCHANT.test(next)) return next;
  }

  // 3) "쿠팡 38,900원"처럼 금액 앞에 가게 이름이 붙은 형식 (네이버페이 알림 등)
  for (const line of lines) {
    const m = line.match(/^(.+?)\s+[\d,]*\d\s*원/);
    if (!m) continue;
    const name = m[1].replace(/\[.*?\]/g, '').trim();
    if (name && !/일시불|할부|누적|잔액|금액/.test(name)) return name;
  }
  return null;
}

function findPaymentMethod(text: string): PaymentMethod | null {
  if (/네이버\s*페이|naver\s*pay|N\s*Pay|N페이/i.test(text)) return 'naverpay';
  if (/카드|승인|신한|국민|KB|삼성|현대|롯데|하나|우리|BC|비씨|NH|농협|씨티/.test(text)) return 'card';
  if (/현금/.test(text)) return 'cash';
  return null;
}

export function parseSms(raw: string, now: Date = new Date()): ParsedSms {
  const text = raw.replace(/\r/g, '').trim();
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const dt = text.match(DATE_TIME);

  return {
    amount: findAmount(text),
    occurredOn: dt ? inferDate(Number(dt[1]), Number(dt[2]), now) : null,
    merchant: findMerchant(text, lines),
    paymentMethod: findPaymentMethod(text),
    isCancel: /취소/.test(text),
  };
}

// 가게 이름으로 카테고리를 짐작한다. 가계부마다 카테고리 이름이 다를 수 있어서,
// 기본 카테고리 이름(예: '카페/간식')을 찾고, 없으면 이름에 키워드가 들어간 카테고리를 찾는다.
const CATEGORY_HINTS: Array<{ pattern: RegExp; names: string[] }> = [
  { pattern: /스타벅스|커피|카페|투썸|메가MGC|메가커피|이디야|빽다방|폴바셋|할리스|파스쿠찌|베이커리|파리바게뜨|뚜레쥬르|배스킨|던킨/i, names: ['카페/간식', '카페', '간식'] },
  { pattern: /배달의민족|배민|요기요|쿠팡이츠|식당|김밥|치킨|피자|버거|맥도날드|롯데리아|버거킹|아웃백|국밥|분식|고기|초밥|마라/, names: ['식비', '외식'] },
  { pattern: /이마트|홈플러스|롯데마트|코스트코|GS25|CU|세븐일레븐|이마트24|마트|편의점/, names: ['식비', '생활'] },
  { pattern: /쿠팡|무신사|올리브영|다이소|11번가|G마켓|지마켓|SSG|오늘의집|29CM|에이블리|지그재그/, names: ['쇼핑'] },
  { pattern: /택시|카카오T|티머니|지하철|버스|코레일|KTX|SRT|주유|GS칼텍스|SK에너지|S-OIL|주차/, names: ['교통'] },
  { pattern: /CGV|메가박스|롯데시네마|넷플릭스|유튜브|멜론|노래방|볼링|PC방/, names: ['문화/여가', '여가'] },
  { pattern: /병원|의원|약국|치과|한의원/, names: ['의료/건강', '의료'] },
  { pattern: /SKT|KT|LG U\+|LGU\+|통신|관리비|전기|가스|수도/, names: ['주거/통신', '통신'] },
];

export function guessCategoryId(merchant: string, categories: { id: number; name: string }[]): number | null {
  for (const hint of CATEGORY_HINTS) {
    if (!hint.pattern.test(merchant)) continue;
    for (const name of hint.names) {
      const exact = categories.find((c) => c.name === name);
      if (exact) return exact.id;
    }
    const partial = categories.find((c) => hint.names.some((n) => c.name.includes(n.split('/')[0])));
    if (partial) return partial.id;
  }
  return null;
}
