import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// 서버가 로그인 성공 후 /auth/callback#token=<JWT> 로 돌려보낸다.
// 토큰을 저장하고 나면 홈으로 이동한다.
export default function AuthCallbackPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');

  useEffect(() => {
    if (!token) return;
    login(token);
    // 주소창에 토큰이 남지 않도록 fragment를 지우고 이동한다.
    navigate('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!token) return <Navigate to="/login?error=failed" replace />;
  return <div className="center-message">로그인 중...</div>;
}
