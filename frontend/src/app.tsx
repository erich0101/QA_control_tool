import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { RequireAdmin, RequireAuth } from '@/components/layout/require-auth';
import { LoginPage } from '@/features/auth/login-page';
import { NAV_ITEMS } from '@/lib/navigation';
import { NotFoundPage } from '@/pages/not-found-page';
import { PageSkeleton } from '@/pages/page-skeleton';

// Cada tab es su propio chunk: el bundle inicial no carga pantallas que el
// usuario todavía no abrió (la documentación Markdown es la más pesada).
const UseCasesPage = lazy(() =>
  import('@/features/use-cases/use-cases-page').then((module) => ({
    default: module.UseCasesPage,
  })),
);

const TestSuitesPage = lazy(() =>
  import('@/features/test-suites/test-suites-page').then((module) => ({
    default: module.TestSuitesPage,
  })),
);

const PlaceholderPage = lazy(() =>
  import('@/pages/placeholder-page').then((module) => ({ default: module.PlaceholderPage })),
);

function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={<PageSkeleton />}>{element}</Suspense>;
}

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
              item.id === 'use-cases' ? (
                withSuspense(<UseCasesPage />)
              ) : item.id === 'test-suites' ? (
                withSuspense(<TestSuitesPage />)
              ) : item.requiresAdmin ? (
                withSuspense(
                  <RequireAdmin>
                    <PlaceholderPage title={item.label} />
                  </RequireAdmin>,
                )
              ) : (
                withSuspense(<PlaceholderPage title={item.label} />)
              )
            }
          />
        ))}

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
