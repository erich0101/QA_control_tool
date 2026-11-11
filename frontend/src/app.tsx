import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { RequireAdmin, RequireAuth } from '@/components/layout/require-auth';
import { LoginPage } from '@/features/auth/login-page';
import { NAV_ITEMS } from '@/lib/navigation';
import { NotFoundPage } from '@/pages/not-found-page';
import { PlaceholderPage } from '@/pages/placeholder-page';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to={NAV_ITEMS[0].path} replace />} />

        {NAV_ITEMS.map((item) => (
          <Route
            key={item.id}
            path={item.path}
            element={
              item.requiresAdmin ? (
                <RequireAdmin>
                  <PlaceholderPage title={item.label} />
                </RequireAdmin>
              ) : (
                <PlaceholderPage title={item.label} />
              )
            }
          />
        ))}

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
