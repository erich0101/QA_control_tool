import { useSessionBootstrap } from './use-auth';

/**
 * Ejecuta el bootstrap de sesión una sola vez, por fuera del router
 * (así /login y las rutas privadas comparten el mismo estado).
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  useSessionBootstrap();
  return <>{children}</>;
}
