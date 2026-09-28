import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      // Dart Sass의 예전(legacy) JS API 대신 최신 API를 쓴다.
      // 지정하지 않으면 legacy API를 쓰면서 deprecation 경고가 뜬다.
      // ('modern-compiler'는 sass-embedded 패키지가 필요해서, 여기선 sass 패키지에 맞는 'modern'을 쓴다)
      scss: {
        api: 'modern',
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
