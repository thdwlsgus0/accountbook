import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await api.get<{ user: User }>('/auth/me');
      setUser(res.data.user);
    } catch {
      localStorage.removeItem('token');
      setUser(null);
    }
  }, []);

  // 앱이 처음 뜰 때, 이미 저장된 토큰이 있으면 그걸로 로그인 상태를 복원한다.
  useEffect(() => {
    const existingToken = localStorage.getItem('token');
    if (!existingToken) {
      setLoading(false);
      return;
    }
    fetchMe().finally(() => setLoading(false));
  }, [fetchMe]);

  // 네이버 로그인 콜백(AuthCallbackPage)에서 토큰을 받았을 때 호출한다.
  // 사용자 정보를 다 불러올 때까지 기다린 뒤에 끝나므로, 호출한 쪽에서 이 함수가
  // 끝나길 기다렸다가 화면을 옮기면 "로그인 안 된 상태"가 잠깐이라도 보이는 일이 없다.
  // (예전에는 토큰 저장과 사용자 정보 조회가 서로 다른 effect에서 따로 돌다가,
  //  effect 실행 순서 문제로 loading이 너무 일찍 false가 되어 로그인 화면으로
  //  되돌아가는 버그가 있었다 — 로그인 버튼을 두 번 눌러야 들어가지는 원인이었음)
  const login = useCallback(
    async (newToken: string) => {
      localStorage.setItem('token', newToken);
      setLoading(true);
      await fetchMe();
      setLoading(false);
    },
    [fetchMe]
  );

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('currentHouseholdId');
    setUser(null);
  }, []);

  // value 객체를 매 렌더링마다 새로 만들면, user/loading이 안 바뀌어도 login/logout이
  // (useCallback 없이) 매번 새 함수가 되어 모든 하위 컴포넌트가 불필요하게 다시 렌더링된다.
  // login/logout을 useCallback으로 고정하고 value 자체도 useMemo로 묶어서,
  // 실제로 user나 loading이 바뀔 때만 context 값이 바뀌도록 한다.
  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.');
  }
  return value;
}
