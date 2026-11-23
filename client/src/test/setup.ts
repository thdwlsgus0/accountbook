import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// 테스트마다 그린 컴포넌트와 localStorage를 지워서, 앞 테스트의 상태가 다음 테스트에 새지 않게 한다.
afterEach(() => {
  cleanup();
  localStorage.clear();
});

// jsdom에는 matchMedia가 없다. "동작 줄이기"(prefers-reduced-motion) 확인 등에 쓰여서 기본값(꺼짐)으로 흉내 낸다.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
