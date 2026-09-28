import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    api
      .get<{ user: User }>('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => {
        localStorage.removeItem('token');
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  // 토큰만 저장하면 위의 useEffect가 /auth/me로 사용자 정보를 불러온다.
  // 그동안 RequireAuth가 로그인 화면으로 튕기지 않도록 loading을 켜둔다.
  function login(newToken: string) {
    localStorage.setItem('token', newToken);
    setLoading(true);
    setToken(newToken);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('currentHouseholdId');
    setToken(null);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.');
  }
  return value;
}
