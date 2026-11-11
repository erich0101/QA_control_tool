import { Navigate, useLocation } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useSessionStore } from '@/stores/session';

/** Splash mientras se resuelve /api/auth/me. */
function SessionSplash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg">
      <div className="flex size-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <FlaskConical className="size-6" />
      </div>
      <div className="w-40 space-y-2">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-2/3" />
      </div>
      <p className="text-caption text-fg-subtle">Verificando sesión…</p>
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useSessionStore((s) => s.status);
  const location = useLocation();

  if (status === 'loading') return <SessionSplash />;

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const isAdmin = useSessionStore((s) => s.isAdmin());
  if (!isAdmin) return <Navigate to="/use-cases" replace />;
  return <>{children}</>;
}
