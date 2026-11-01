// 대시보드 알림 배너를 "닫은 시점"(날짜나 달)을 기억해서 같은 기간엔 다시 안 띄우는 데 쓴다.
// 시크릿 모드 등에서 localStorage가 막혀 있으면 그냥 매번 보이게 둔다 (알림이 안 뜨는 것보단 낫다).
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
