import { lazy, ReactNode, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { HouseholdProvider } from './context/HouseholdContext';
import { RequireAuth, RequireHousehold } from './components/ProtectedRoute';
import NavBar from './components/NavBar';
import LoadingScreen from './components/LoadingScreen';
import LoginPage from './pages/LoginPage';
import AuthCallbackPage from './pages/AuthCallbackPage';

// 로그인/콜백 화면은 앱 진입 직후 바로 보여줘야 해서 그냥 묶음(static import)으로 둔다.
// 그 뒤에 있는 "로그인 후에만 보이는" 화면들은 lazy로 분리해서, 처음 접속할 때
// (아직 로그인도 안 한 사람이) 이 페이지들 코드까지 전부 내려받지 않도록 한다.
const HouseholdSetupPage = lazy(() => import('./pages/HouseholdSetupPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'));
const InsightsPage = lazy(() => import('./pages/InsightsPage'));
const RecurringPage = lazy(() => import('./pages/RecurringPage'));
const BudgetsPage = lazy(() => import('./pages/BudgetsPage'));
const GoalsPage = lazy(() => import('./pages/GoalsPage'));
const HouseholdPage = lazy(() => import('./pages/HouseholdPage'));

function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <NavBar />
      <main>
        <Suspense fallback={<LoadingScreen />}>{children}</Suspense>
      </main>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <HouseholdProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />

            <Route element={<RequireAuth />}>
              <Route
                path="/setup"
                element={
                  <Layout>
                    <HouseholdSetupPage />
                  </Layout>
                }
              />

              <Route element={<RequireHousehold />}>
                <Route
                  path="/"
                  element={
                    <Layout>
                      <DashboardPage />
                    </Layout>
                  }
                />
                <Route
                  path="/transactions"
                  element={
                    <Layout>
                      <TransactionsPage />
                    </Layout>
                  }
                />
                <Route
                  path="/insights"
                  element={
                    <Layout>
                      <InsightsPage />
                    </Layout>
                  }
                />
                <Route
                  path="/recurring"
                  element={
                    <Layout>
                      <RecurringPage />
                    </Layout>
                  }
                />
                <Route
                  path="/budgets"
                  element={
                    <Layout>
                      <BudgetsPage />
                    </Layout>
                  }
                />
                <Route
                  path="/goals"
                  element={
                    <Layout>
                      <GoalsPage />
                    </Layout>
                  }
                />
                <Route
                  path="/household"
                  element={
                    <Layout>
                      <HouseholdPage />
                    </Layout>
                  }
                />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HouseholdProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
