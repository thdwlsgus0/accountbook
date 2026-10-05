import axios from 'axios';

// 로컬 개발(Vite 프록시)이나 프론트+백엔드가 같은 출처로 배포된 환경에서는 '/api'면 충분하다.
// 프론트(Vercel)와 백엔드(별도 서버)가 서로 다른 도메인에 떨어져 있을 때는
// 빌드 시 VITE_API_BASE_URL(예: https://api.example.com/api)을 넣어준다.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 토큰이 만료/무효화되어 401을 받으면 로그인 화면으로 보낸다.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// catch(err)에서 err는 TS에서 unknown 타입이라 바로 err.response에 접근할 수 없다.
// 서버가 { error: { message } } 형태로 내려주는 에러 메시지를 안전하게 꺼내는 헬퍼.
export function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { message?: string } } | undefined;
    if (data?.error?.message) return data.error.message;
  }
  return fallback;
}
