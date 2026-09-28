import { useSearchParams } from 'react-router-dom';

// 서버(/api/auth/naver/callback)가 로그인 실패 시 /login?error=<코드>로 돌려보낸다.
const ERROR_MESSAGES: Record<string, string> = {
  denied: '네이버 로그인이 취소되었습니다.',
  invalid_state: '로그인 요청이 유효하지 않습니다. 다시 시도해주세요.',
  not_configured: '네이버 로그인이 설정되지 않았습니다. 관리자에게 문의해주세요.',
  failed: '네이버 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.',
};

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const errorCode = searchParams.get('error');
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.failed : '';

  return (
    <div className="auth-page">
      <div className="card">
        <h1>공용가계부</h1>
        <p className="muted">네이버 계정으로 간편하게 시작하세요.</p>
        {errorMessage && <p className="error">{errorMessage}</p>}
        {/* fetch가 아니라 페이지 이동이어야 네이버 로그인 화면으로 넘어갈 수 있다. */}
        <a className="naver-login-button" href="/api/auth/naver">
          네이버로 로그인
        </a>
      </div>
    </div>
  );
}
