import { Fragment } from 'react';
import { TAG_PATTERN } from '../utils/tags';

interface MemoTextProps {
  memo: string;
  // 태그를 누르면 그 태그로 검색한다. 없으면 태그를 그냥 강조만 한다.
  onTagClick?: (tag: string) => void;
}

// 메모 안의 #태그를 칩처럼 보여준다. "스타벅스 #데이트" → 스타벅스 [#데이트]
export default function MemoText({ memo, onTagClick }: MemoTextProps) {
  const parts: Array<{ text: string; tag?: string }> = [];
  let last = 0;
  for (const m of memo.matchAll(TAG_PATTERN)) {
    if (m.index! > last) parts.push({ text: memo.slice(last, m.index) });
    parts.push({ text: m[0], tag: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < memo.length) parts.push({ text: memo.slice(last) });

  return (
    <>
      {parts.map((p, i) =>
        p.tag ? (
          onTagClick ? (
            <button
              key={i}
              type="button"
              className="memo-tag"
              onClick={(e) => {
                e.stopPropagation();
                onTagClick(p.tag!);
              }}
            >
              {p.text}
            </button>
          ) : (
            <span key={i} className="memo-tag">
              {p.text}
            </span>
          )
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        )
      )}
    </>
  );
}
