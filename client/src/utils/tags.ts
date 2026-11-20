// 메모 속 #태그. 서버 server/src/utils/tags.ts와 같은 규칙이다 (공백이나 다른 #이 나오기 전까지, 최대 20자).
export const TAG_PATTERN = /#([^\s#]{1,20})/g;

export function extractTags(memo: string | null | undefined): string[] {
  if (!memo) return [];
  return [...new Set([...memo.matchAll(TAG_PATTERN)].map((m) => m[1]))];
}

// 태그를 뺀 메모 본문. 카테고리 추천처럼 "스타벅스 #데이트"와 "스타벅스"를 같은 메모로 봐야 할 때 쓴다.
export function stripTags(memo: string): string {
  return memo.replace(TAG_PATTERN, '').replace(/\s+/g, ' ').trim();
}
