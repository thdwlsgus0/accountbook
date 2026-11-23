import { api } from '../api/client';

// 대시보드의 빠른 입력·템플릿·"사도 될까?"·고정비 알림은 대시보드 숫자가 다 그려진 "뒤에" 각자 요청을
// 보내서, 요청이 두 번에 나눠 나갔다(서버 왕복을 두 번 기다림). 대시보드가 처음부터 미리 요청해두고,
// 각 컴포넌트는 첫 로딩 때 그 결과를 받아 쓰게 해서 한 번에 동시에 나가게 한다.
// 미리 받은 결과는 "한 번만" 쓰고 지운다. 그 뒤 새로고침(기록 후 다시 불러오기 등)은 항상 새로 요청한다.
const PREFETCH_TTL_MS = 10_000;
const prefetched = new Map<string, { promise: Promise<unknown>; at: number }>();

export function prefetch(url: string): void {
  const existing = prefetched.get(url);
  if (existing && Date.now() - existing.at < PREFETCH_TTL_MS) return;
  const promise = api.get(url).then((res) => res.data);
  // 미리 받기가 실패해도 여기서 에러를 띄우지 않는다. 실제로 쓰는 쪽(getOnce)에서 다시 처리된다.
  promise.catch(() => {});
  prefetched.set(url, { promise, at: Date.now() });
}

export function getOnce<T>(url: string): Promise<T> {
  const entry = prefetched.get(url);
  prefetched.delete(url);
  if (entry && Date.now() - entry.at < PREFETCH_TTL_MS) return entry.promise as Promise<T>;
  return api.get<T>(url).then((res) => res.data);
}
