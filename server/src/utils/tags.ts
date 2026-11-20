// 태그는 메모 안에 "#여행 #생일"처럼 쓴다. 따로 저장하지 않고 메모에서 뽑아 쓰므로,
// 메모를 고치면 태그도 저절로 바뀐다. 클라이언트 client/src/utils/tags.ts와 같은 규칙이다.
// 공백이나 다른 #이 나오기 전까지가 태그 하나, 최대 20자.
const TAG_PATTERN = /#([^\s#]{1,20})/g;

export function extractTags(memo: string | null | undefined): string[] {
  if (!memo) return [];
  const tags = [...memo.matchAll(TAG_PATTERN)].map((m) => m[1]);
  return [...new Set(tags)];
}
