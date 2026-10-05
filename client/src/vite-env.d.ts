/// <reference types="vite/client" />

interface ImportMetaEnv {
  // 백엔드가 프론트와 다른 도메인에 배포될 때 쓰는 절대 URL. 비워두면 '/api'(같은 출처)를 쓴다.
  // 예: https://api.example.com/api
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
