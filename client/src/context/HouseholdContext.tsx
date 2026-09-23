import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
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

  function selectHousehold(id: number) {
    setCurrentId(id);
    localStorage.setItem('currentHouseholdId', String(id));
  }

  const current = households.find((h) => h.id === currentId) || null;

  return (
    <HouseholdContext.Provider value={{ households, current, currentId, selectHousehold, refresh, loading }}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold(): HouseholdContextValue {
  const value = useContext(HouseholdContext);
  if (!value) {
    throw new Error('useHousehold는 HouseholdProvider 안에서만 사용할 수 있습니다.');
  }
  return value;
}
