import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ExternalLink, KeyRound, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useDeleteJiraUserConfig,
  useJiraConfig,
  useJiraUserConfig,
  useSaveJiraConfig,
  useSaveJiraUserConfig,
  useTestJiraConnection,
} from './use-jira-config';

interface JiraConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number | null;
}

interface ProjectForm {
  jira_domain: string;
  jira_project_key: string;
}

interface UserForm {
  jira_user_email: string;
  jira_api_token: string;
}

const ATLASSIAN_TOKENS_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';

/**
 * Configuración de Jira en dos pasos, igual que el legacy:
 *  1. Proyecto: dominio + key (lo comparte todo el equipo).
 *  2. Mi token: email + API token (cada usuario guarda el suyo, cifrado).
 *
 * Antes esto vivía solo en la UI legacy; en React el botón mostraba un toast
 * "se migra junto con Tools". Ahora usa los mismos endpoints
 * `/api/projects/:id/jira-config` y `/api/projects/:id/jira-user-config`.
 */
export function JiraConfigDialog({ open, onOpenChange, projectId }: JiraConfigDialogProps) {
  const confirm = useConfirm();
  const { data, isLoading } = useJiraConfig(open ? projectId : null);
  const saveProjectConfig = useSaveJiraConfig(projectId);
  const saveUserConfig = useSaveJiraUserConfig(projectId);
  const deleteUserConfig = useDeleteJiraUserConfig(projectId);
  const testConnection = useTestJiraConnection(projectId);

  const projectForm = useForm<ProjectForm>({
    defaultValues: { jira_domain: '', jira_project_key: '' },
  });
  const userForm = useForm<UserForm>({
    defaultValues: { jira_user_email: '', jira_api_token: '' },
  });

  const hasUserToken = Boolean(data?.userHasToken);
  const { data: userConfig } = useJiraUserConfig(projectId, open && hasUserToken);

  const [tab, setTab] = useState('project');
  // Evita re-inicializar los forms en cada refetch (pisaría lo que el usuario
  // está escribiendo): solo al abrir con datos nuevos del proyecto.
  const loadedForRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      loadedForRef.current = null;
      setTab('project');
      return;
    }
    if (!data || loadedForRef.current === projectId) return;

    loadedForRef.current = projectId;
    setTab('project');
    projectForm.reset({
      jira_domain: data.config?.jira_domain ?? '',
      jira_project_key: data.config?.jira_project_key ?? '',
    });
    userForm.reset({ jira_user_email: '', jira_api_token: '' });
  }, [open, data, projectId, projectForm, userForm]);

  useEffect(() => {
    if (!open || !userConfig?.email) return;
    if (!userForm.getValues('jira_user_email')) {
      userForm.setValue('jira_user_email', userConfig.email);
    }
  }, [open, userConfig?.email, userForm]);

  const onSaveProject = projectForm.handleSubmit(async (values) => {
    try {
      await saveProjectConfig.mutateAsync({
        jira_domain: values.jira_domain.trim(),
        jira_project_key: values.jira_project_key.trim(),
      });
      onOpenChange(false);
    } catch {
      // El hook ya muestra el toast.
    }
  });

  const onSaveUser = userForm.handleSubmit(async (values) => {
    try {
      await saveUserConfig.mutateAsync({
        jira_user_email: values.jira_user_email.trim(),
        jira_api_token: values.jira_api_token.trim(),
      });
      userForm.setValue('jira_api_token', '');
      onOpenChange(false);
    } catch {
      // El hook ya muestra el toast.
    }
  });

  const onTest = userForm.handleSubmit(async (values) => {
    await testConnection.mutateAsync({
      jira_user_email: values.jira_user_email.trim(),
      jira_api_token: values.jira_api_token.trim(),
    });
  });

  const onDeleteUser = async () => {
    const ok = await confirm({
      title: '¿Eliminar tu token de Jira?',
      description: 'Se borran tus credenciales para este proyecto. Podés volver a cargarlas cuando quieras.',
      confirmLabel: 'Eliminar token',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteUserConfig.mutateAsync();
      userForm.reset({ jira_user_email: '', jira_api_token: '' });
      setTab('project');
    } catch {
      // El hook ya muestra el toast.
    }
  };

  const savingProject = saveProjectConfig.isPending;
  const savingUser = saveUserConfig.isPending;
  const testing = testConnection.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configuración de Jira</DialogTitle>
          <DialogDescription>
            Dominio y key los comparte el proyecto; el token es personal de cada usuario.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="project">Proyecto</TabsTrigger>
            <TabsTrigger value="user">Mi token</TabsTrigger>
          </TabsList>

          <TabsContent value="project" className="pt-4">
            <form className="space-y-4" onSubmit={onSaveProject} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="jira-domain">Dominio de Jira (URL)</Label>
                <Input
                  id="jira-domain"
                  placeholder="https://tu-empresa.atlassian.net"
                  disabled={isLoading}
                  aria-invalid={Boolean(projectForm.formState.errors.jira_domain)}
                  {...projectForm.register('jira_domain', {
                    required: 'El dominio es obligatorio',
                  })}
                />
                {projectForm.formState.errors.jira_domain ? (
                  <p className="text-caption text-fail">
                    {projectForm.formState.errors.jira_domain.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="jira-project-key">Key del proyecto Jira</Label>
                <Input
                  id="jira-project-key"
                  placeholder="Ej: PROJ"
                  disabled={isLoading}
                  aria-invalid={Boolean(projectForm.formState.errors.jira_project_key)}
                  {...projectForm.register('jira_project_key', {
                    required: 'La key del proyecto es obligatoria',
                  })}
                />
                {projectForm.formState.errors.jira_project_key ? (
                  <p className="text-caption text-fail">
                    {projectForm.formState.errors.jira_project_key.message}
                  </p>
                ) : null}
              </div>

              <div className="flex items-start gap-2 rounded-md border border-border bg-fill-soft px-3 py-2.5">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                <p className="text-caption text-fg-muted">
                  Cada usuario carga su propio token en la pestaña <strong>Mi token</strong>.{' '}
                  {hasUserToken ? (
                    <Badge tone="ok">Token configurado</Badge>
                  ) : (
                    <Badge tone="fail">Sin token</Badge>
                  )}
                </p>
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={savingProject}>
                  Guardar proyecto
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="user" className="pt-4">
            <form className="space-y-4" onSubmit={onSaveUser} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="jira-user-email">Email de usuario Jira</Label>
                <Input
                  id="jira-user-email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu-email@empresa.com"
                  aria-invalid={Boolean(userForm.formState.errors.jira_user_email)}
                  {...userForm.register('jira_user_email', {
                    required: 'El email es obligatorio',
                  })}
                />
                {userForm.formState.errors.jira_user_email ? (
                  <p className="text-caption text-fail">
                    {userForm.formState.errors.jira_user_email.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="jira-api-token">API Token</Label>
                <Input
                  id="jira-api-token"
                  type="password"
                  autoComplete="off"
                  placeholder={hasUserToken ? 'Dejar vacío para conservar el actual' : 'Ingresá tu API Token'}
                  aria-invalid={Boolean(userForm.formState.errors.jira_api_token)}
                  {...userForm.register('jira_api_token', {
                    validate: (value) =>
                      hasUserToken || value.trim().length > 0
                        ? true
                        : 'El API Token es obligatorio la primera vez',
                  })}
                />
                {userForm.formState.errors.jira_api_token ? (
                  <p className="text-caption text-fail">
                    {userForm.formState.errors.jira_api_token.message}
                  </p>
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

              <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                <div className="flex gap-2">
                  {hasUserToken ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={onDeleteUser}
                      loading={deleteUserConfig.isPending}
                    >
                      <Trash2 />
                      Eliminar
                    </Button>
                  ) : null}
                  <Button type="button" variant="secondary" onClick={onTest} loading={testing}>
                    Probar conexión
                  </Button>
                </div>
                <Button type="submit" variant="primary" loading={savingUser}>
                  {hasUserToken ? 'Actualizar' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
