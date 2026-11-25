import { defineConfig } from 'vitest/config';

// 백엔드 테스트는 Node 환경에서 돌린다. DB는 각 테스트가 vi.mock으로 가짜 pool을 넣어서 쓰므로
// 실제 MySQL 없이도 실행된다 (입력 검증, 권한 규칙, 응답 형태, 캐시 동작을 확인하는 용도).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // 테스트용 JWT 비밀 값. 실제 .env와 섞이지 않게 고정해 둔다.
    env: { JWT_SECRET: 'test-secret' },
  },
});
