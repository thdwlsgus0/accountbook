// localStorage 읽기/쓰기를 안전하게 감싼 것. 대시보드 알림 배너를 "닫은 시점"(날짜나 달)을 기억하거나,
// 마지막으로 쓴 결제수단을 기억하는 데 쓴다. 시크릿 모드 등에서 localStorage가 막혀 있으면
// 그냥 기억 못 한 것처럼 동작한다 (알림이 안 뜨는 것보단 매번 뜨는 게 낫다).
export function readDismissed(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeDismissed(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장 못 해도 이번 화면에서는 닫힌 상태로 둔다.
  }
}
