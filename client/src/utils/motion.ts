// 기기에서 "동작 줄이기"를 켠 사용자에게는 숫자 굴러가기 같은 JS 애니메이션도 바로 최종값으로 보여준다.
// (CSS 애니메이션은 index.scss 맨 아래의 prefers-reduced-motion 규칙이 한꺼번에 끈다)
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
