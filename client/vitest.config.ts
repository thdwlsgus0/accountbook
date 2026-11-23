import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// 앱 빌드 설정(vite.config.ts)을 그대로 이어받고, 테스트용 설정만 덧붙인다.
// jsdom: 브라우저 없이 DOM(document, localStorage 등)을 흉내 내서 컴포넌트를 그려볼 수 있게 한다.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  })
);
