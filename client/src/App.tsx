import { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { HouseholdProvider } from './context/HouseholdContext';
import { RequireAuth, RequireHousehold } from './components/ProtectedRoute';
import NavBar from './components/NavBar';
import LoginPage from './pages/LoginPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import HouseholdSetupPage from './pages/HouseholdSetupPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import InsightsPage from './pages/InsightsPage';
import RecurringPage from './pages/RecurringPage';
import BudgetsPage from './pages/BudgetsPage';
import GoalsPage from './pages/GoalsPage';
import HouseholdPage from './pages/HouseholdPage';

function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <NavBar />
      <main>{children}</main>
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
