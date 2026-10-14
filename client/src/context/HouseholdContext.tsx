import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { Household } from '../types';
import { useAuth } from './AuthContext';

interface HouseholdContextValue {
  households: Household[];
  current: Household | null;
  currentId: number | null;
  selectHousehold: (id: number) => void;
  refresh: () => Promise<Household[]>;
  loading: boolean;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(() => {
    const saved = localStorage.getItem('currentHouseholdId');
    return saved ? Number(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await api.get<{ households: Household[] }>('/households/mine');
    setHouseholds(res.data.households);
    return res.data.households;
  }, []);

  const selectHousehold = useCallback((id: number) => {
    setCurrentId(id);
    localStorage.setItem('currentHouseholdId', String(id));
  }, []);

  useEffect(() => {
    if (!user) {
      setHouseholds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh()
      .then((list) => {
        if (list.length > 0 && !list.some((h) => h.id === currentId)) {
          selectHousehold(list[0].id);
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const current = households.find((h) => h.id === currentId) || null;

  // AuthContext와 같은 이유로, context 값을 useMemo로 묶어서 households/current/currentId/loading이
  // 실제로 바뀔 때만 하위 컴포넌트가 다시 렌더링되게 한다.
  const value = useMemo(
    () => ({ households, current, currentId, selectHousehold, refresh, loading }),
    [households, current, currentId, selectHousehold, refresh, loading]
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdContextValue {
  const value = useContext(HouseholdContext);
  if (!value) {
    throw new Error('useHousehold는 HouseholdProvider 안에서만 사용할 수 있습니다.');
  }
  return value;
}
