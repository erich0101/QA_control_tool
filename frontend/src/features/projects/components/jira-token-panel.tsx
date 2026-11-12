import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { ExternalLink, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useDeleteJiraUserConfig,
  useJiraConfig,
  useJiraUserConfig,
  useSaveJiraUserConfig,
  useTestJiraConnection,
} from '../use-jira-config';

const ATLASSIAN_TOKENS_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';

interface JiraTokenPanelProps {
  projectId: number | null;
  /** Se llama después de guardar o eliminar correctamente (para cerrar el diálogo). */
  onSaved?: () => void;
  onDeleted?: () => void;
}

interface UserForm {
  jira_user_email: string;
  jira_api_token: string;
}

/**
 * Credenciales personales de Jira (email + API token) para el proyecto activo.
 * El token viaja una sola vez y el backend lo guarda cifrado; nunca se devuelve.
 */
export function JiraTokenPanel({ projectId, onSaved, onDeleted }: JiraTokenPanelProps) {
  const confirm = useConfirm();
  const { data, isLoading: configLoading } = useJiraConfig(projectId);
  const hasToken = Boolean(data?.userHasToken);
  const { data: userConfig, isLoading: userLoading } = useJiraUserConfig(projectId, hasToken);

  const saveUserConfig = useSaveJiraUserConfig(projectId);
  const deleteUserConfig = useDeleteJiraUserConfig(projectId);
  const testConnection = useTestJiraConnection(projectId);

  const form = useForm<UserForm>({
    defaultValues: { jira_user_email: '', jira_api_token: '' },
  });
  // Evita pisar lo que el usuario escribe si la query se refresca.
  const loadedForRef = useRef<number | null>(null);

  useEffect(() => {
    if (loadedForRef.current === projectId) return;
    if (!projectId) return;
    loadedForRef.current = projectId;
    form.reset({ jira_user_email: '', jira_api_token: '' });
  }, [projectId, form]);

  useEffect(() => {
    if (!userConfig?.email) return;
    if (!form.getValues('jira_user_email')) {
      form.setValue('jira_user_email', userConfig.email);
    }
  }, [userConfig?.email, form]);

  const onSave = form.handleSubmit(async (values) => {
    try {
      await saveUserConfig.mutateAsync({
        jira_user_email: values.jira_user_email.trim(),
        jira_api_token: values.jira_api_token.trim(),
      });
      form.setValue('jira_api_token', '');
      toast.success(hasToken ? 'Token de Jira actualizado' : 'Token de Jira guardado');
      onSaved?.();
    } catch {
      // El hook ya muestra el toast de error.
    }
  });

  const onTest = form.handleSubmit(async (values) => {
    // Probar guarda primero: el backend valida contra las credenciales persistidas.
    await testConnection.mutateAsync({
      jira_user_email: values.jira_user_email.trim(),
      jira_api_token: values.jira_api_token.trim(),
    });
  });

  const onDelete = async () => {
    const ok = await confirm({
      title: '¿Eliminar tu token de Jira?',
      description:
        'Se borran tus credenciales para este proyecto. Podés volver a cargarlas cuando quieras.',
      confirmLabel: 'Eliminar token',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteUserConfig.mutateAsync();
      form.reset({ jira_user_email: '', jira_api_token: '' });
      onDeleted?.();
    } catch {
      // El hook ya muestra el toast de error.
    }
  };

  const loading = configLoading || userLoading;

  return (
    <form className="space-y-4" onSubmit={onSave} noValidate>
      <div className="flex items-center gap-2">
        <span className="text-footnote text-fg-muted">Estado:</span>
        {hasToken ? <Badge tone="ok">Token configurado</Badge> : <Badge tone="fail">Sin token</Badge>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="jira-user-email">Email de usuario Jira</Label>
        <Input
          id="jira-user-email"
          type="email"
          autoComplete="email"
          placeholder="tu-email@empresa.com"
          disabled={loading}
          aria-invalid={Boolean(form.formState.errors.jira_user_email)}
          {...form.register('jira_user_email', { required: 'El email es obligatorio' })}
        />
        {form.formState.errors.jira_user_email ? (
          <p className="text-caption text-fail">{form.formState.errors.jira_user_email.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="jira-api-token">API Token</Label>
        <Input
          id="jira-api-token"
          type="password"
          autoComplete="off"
          placeholder={hasToken ? 'Dejar vacío para conservar el actual' : 'Ingresá tu API Token'}
          aria-invalid={Boolean(form.formState.errors.jira_api_token)}
          {...form.register('jira_api_token', {
            validate: (value) =>
              hasToken || value.trim().length > 0
                ? true
                : 'El API Token es obligatorio la primera vez',
          })}
        />
        {form.formState.errors.jira_api_token ? (
          <p className="text-caption text-fail">{form.formState.errors.jira_api_token.message}</p>
        ) : null}
        <p className="text-caption text-fg-subtle">
          Generá tu token en{' '}
          <a
            className="inline-flex items-center gap-1 text-brand hover:underline"
            href={ATLASSIAN_TOKENS_URL}
            target="_blank"
            rel="noreferrer"
          >
            Atlassian Account → API Tokens
            <ExternalLink className="size-3" />
          </a>
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {hasToken ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onDelete}
              loading={deleteUserConfig.isPending}
            >
              <Trash2 />
              Eliminar
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            onClick={onTest}
            loading={testConnection.isPending}
            disabled={loading}
          >
            Probar conexión
          </Button>
        </div>
        <Button type="submit" variant="primary" loading={saveUserConfig.isPending}>
          {hasToken ? 'Actualizar' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}
