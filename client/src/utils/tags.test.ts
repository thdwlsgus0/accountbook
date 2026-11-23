import { describe, expect, it } from 'vitest';
import { extractTags, stripTags } from './tags';

describe('extractTags', () => {
  it('메모 속 #태그를 뽑는다', () => {
    expect(extractTags('흑돼지 #제주여행 #데이트')).toEqual(['제주여행', '데이트']);
  });

  it('붙어 있는 태그와 중복도 처리한다', () => {
    expect(extractTags('#여행#여행 #생일')).toEqual(['여행', '생일']);
  });

  it('태그는 최대 20자', () => {
    expect(extractTags(`#${'가'.repeat(25)}`)).toEqual(['가'.repeat(20)]);
  });

  it('메모가 없거나 태그가 없으면 빈 배열', () => {
    expect(extractTags(null)).toEqual([]);
    expect(extractTags('그냥 메모')).toEqual([]);
  });
});

describe('stripTags', () => {
  it('태그를 빼고 공백을 정리한다', () => {
    expect(stripTags('스타벅스  #데이트 강남점')).toBe('스타벅스 강남점');
  });
});
