import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  projectsApi,
  type JiraProjectConfig,
} from '@/lib/api/projects';
import { queryKeys } from '@/lib/query-keys';

/** Configuración del proyecto + si el usuario ya tiene token guardado. */
export function useJiraConfig(projectId: number | null) {
  return useQuery({
    queryKey: queryKeys.jiraConfig(projectId ?? 0),
    queryFn: () => projectsApi.jiraConfig(projectId as number),
    enabled: projectId != null,
    staleTime: 30_000,
  });
}

/** Credenciales del usuario (email guardado; el token nunca se devuelve). */
export function useJiraUserConfig(projectId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.jiraConfig(projectId ?? 0), 'user'] as const,
    queryFn: () => projectsApi.jiraUserConfig(projectId as number),
    enabled: projectId != null && enabled,
    staleTime: 30_000,
  });
}

/** Guardar/actualizar las credenciales del usuario; `token` vacío conserva el actual. */
export function useSaveJiraUserConfig(projectId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { jira_user_email: string; jira_api_token: string }) =>
      projectsApi.saveJiraUserConfig(projectId as number, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jiraConfig(projectId ?? 0) });
      queryClient.invalidateQueries({ queryKey: queryKeys.jiraContext(projectId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteJiraUserConfig(projectId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => projectsApi.deleteJiraUserConfig(projectId as number),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jiraConfig(projectId ?? 0) });
      queryClient.invalidateQueries({ queryKey: queryKeys.jiraContext(projectId) });
      toast.success('Token de Jira eliminado');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/**
 * Probar conexión guarda primero las credenciales (el backend solo puede
 * testear lo que tiene persistido) y después valida contra Jira.
 */
export function useTestJiraConnection(projectId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { jira_user_email: string; jira_api_token: string }) => {
      await projectsApi.saveJiraUserConfig(projectId as number, input);
      await projectsApi.testJiraConnection(projectId as number);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jiraConfig(projectId ?? 0) });
      queryClient.invalidateQueries({ queryKey: queryKeys.jiraContext(projectId) });
      toast.success('Conexión exitosa con Jira');
    },
    onError: (error: Error) => toast.error(`No se pudo conectar: ${error.message}`),
  });
}

/** Dominio + key del proyecto (admin o `can_configure_jira`). */
export function useSaveJiraConfig(projectId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: JiraProjectConfig) =>
      projectsApi.saveJiraConfig(projectId as number, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jiraConfig(projectId ?? 0) });
      queryClient.invalidateQueries({ queryKey: queryKeys.jiraContext(projectId) });
      toast.success('Configuración de Jira guardada');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
