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
  build: {
    rollupOptions: {
      output: {
        // react/react-dom/react-router-dom은 우리 코드보다 훨씬 드물게 바뀐다.
        // 한 파일로 다 묶으면 코드 한 줄만 고쳐도 이 라이브러리들까지 매번 다시 내려받아야 하는데,
        // 따로 분리해두면 그 chunk는 브라우저 캐시에 그대로 남아있어서 재방문·재배포가 더 빠르다.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
