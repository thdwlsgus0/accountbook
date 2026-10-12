import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useHousehold } from '../context/HouseholdContext';
import LoadingScreen from './LoadingScreen';

export function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireHousehold() {
  const { current, households, loading } = useHousehold();
  if (loading) return <LoadingScreen />;
  if (!current && households.length === 0) return <Navigate to="/setup" replace />;
  return <Outlet />;
}
