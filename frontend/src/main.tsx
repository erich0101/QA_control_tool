import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppRoutes } from './app';
import { SessionGate } from './features/auth/session-gate';
import { TooltipProvider } from './components/ui/tooltip';
import { ApiError } from './lib/api/client';
import { useUiStore } from './stores/ui';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Un 401 no se reintenta: significa que la sesión expiró.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status === 401) return false;
        return failureCount < 2;
      },
    },
  },
});

/**
 * React Router toma el prefijo de despliegue desde Vite.
 * En prod la app vive en /app (conviviendo con la legacy en /).
 */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

function ThemedToaster() {
  const theme = useUiStore((s) => s.theme);
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      toastOptions={{ style: { fontFamily: 'var(--apple-font-family)' } }}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <BrowserRouter basename={basename}>
          <SessionGate>
            <AppRoutes />
          </SessionGate>
          <ThemedToaster />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
