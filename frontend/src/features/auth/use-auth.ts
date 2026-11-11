import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { authApi, type LoginPayload } from '@/lib/api/auth';
import { ApiError, UNAUTHORIZED_EVENT } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { useSessionStore } from '@/stores/session';

/**
 * Bootstrap de sesión: consulta /api/auth/me una vez y sincroniza el store.
 * Si el backend responde 401, la app queda en estado `anonymous` y el router
 * manda al login. Un 401 posterior (token vencido) también cierra la sesión.
 */
export function useSessionBootstrap() {
  const { setUser, clear, status } = useSessionStore();

  const query = useQuery({
    queryKey: queryKeys.session,
    queryFn: authApi.me,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (query.isSuccess) {
      setUser({ ...query.data.user, permissions: query.data.permissions });
    }
    if (query.isError) {
      // Sin respuesta válida de /me no hay sesión que recuperar (401 o error de red).
      if (query.error instanceof ApiError || query.error instanceof TypeError) {
        clear();
      }
    }
  }, [query.isSuccess, query.isError, query.data, query.error, setUser, clear]);

  useEffect(() => {
    const onUnauthorized = () => clear();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [clear]);

  return { status, isLoading: query.isLoading };
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
    onSuccess: async () => {
      // Refresca /me para traer usuario + permisos y reconstruir la sesión.
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const clear = useSessionStore((s) => s.clear);

  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      clear();
      queryClient.clear();
    },
  });
}
