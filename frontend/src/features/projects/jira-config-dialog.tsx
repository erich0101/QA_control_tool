import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { KeyRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { JiraTokenPanel } from './components/jira-token-panel';
import { useJiraConfig, useSaveJiraConfig } from './use-jira-config';

interface JiraConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number | null;
}

interface ProjectForm {
  jira_domain: string;
  jira_project_key: string;
}

/**
 * Configuración de Jira en dos pasos, igual que el legacy:
 *  1. Proyecto: dominio + key (lo comparte todo el equipo).
 *  2. Mi token: credenciales personales (componente reutilizado en el menú
 *     de usuario, para que cualquier tester pueda cargar su token).
 */
export function JiraConfigDialog({ open, onOpenChange, projectId }: JiraConfigDialogProps) {
  const { data, isLoading } = useJiraConfig(open ? projectId : null);
  const saveProjectConfig = useSaveJiraConfig(projectId);

  const projectForm = useForm<ProjectForm>({
    defaultValues: { jira_domain: '', jira_project_key: '' },
  });

  const hasUserToken = Boolean(data?.userHasToken);
  const [tab, setTab] = useState('project');
  // Evita re-inicializar el form en cada refetch del contexto.
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
  }, [open, data, projectId, projectForm]);

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
                <Button type="submit" variant="primary" loading={saveProjectConfig.isPending}>
                  Guardar proyecto
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="user" className="pt-4">
            <JiraTokenPanel
              projectId={projectId}
              onSaved={() => onOpenChange(false)}
              onDeleted={() => setTab('project')}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
