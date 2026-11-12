import { useState } from 'react';
import { KeyRound, Settings2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { JiraConfigDialog } from '@/features/projects/jira-config-dialog';
import { JiraTokenDialog } from '@/features/projects/jira-token-dialog';
import { useProjects } from '@/features/projects/use-projects';
import { useSessionStore } from '@/stores/session';

/** Código de error de Jira que devuelve el backend (o el payload de ApiError). */
export function getJiraErrorCode(error: unknown): string | null {
  if (!error) return null;
  const payload = (error as { payload?: { code?: string; error_code?: string } }).payload;
  const code = payload?.code ?? payload?.error_code;
  if (code) return code;
  return (error as { code?: string }).code ?? null;
}

type SetupIssue = 'project' | 'token' | 'other';

function classify(code: string | null, message: string | null): SetupIssue {
  if (code === 'NO_PROJECT_CONFIG') return 'project';
  if (code === 'NO_USER_TOKEN') return 'token';
  if (message) {
    if (/no configurado para este proyecto/i.test(message)) return 'project';
    if (/configura tu token|token de jira en tu perfil/i.test(message)) return 'token';
  }
  return 'other';
}

interface JiraSetupStateProps {
  projectId: number | null;
  /** `NO_PROJECT_CONFIG` / `NO_USER_TOKEN` si el backend lo informó. */
  code?: string | null;
  /** Mensaje original del backend (se muestra igual). */
  message?: string | null;
  icon?: React.ReactNode;
}

/**
 * Estado accionable para pantallas que dependen de Jira.
 *
 * En vez de un genérico "Configuración pendiente", distingue los dos casos
 * reales (proyecto sin dominio/key vs. usuario sin token) y ofrece el botón
 * que resuelve cada uno reutilizando los diálogos de configuración.
 */
export function JiraSetupState({ projectId, code, message, icon }: JiraSetupStateProps) {
  const { data: projects = [] } = useProjects();
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const canConfigure = useSessionStore((s) => s.can('can_configure_jira'));
  const [configOpen, setConfigOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);

  const projectName = projects.find((project) => project.id === projectId)?.name;
  const issue = classify(code ?? null, message ?? null);

  if (issue === 'project') {
    return (
      <>
        <EmptyState
          icon={icon ?? <Settings2 />}
          title={`Jira no está configurado${projectName ? ` en «${projectName}»` : ''}`}
          description={
            isAdmin || canConfigure
              ? 'Cargá el dominio y la key de Jira del proyecto. Después cada usuario agrega su token personal.'
              : 'Pedile a un administrador (o a alguien con permiso de configurar Jira) que cargue el dominio y la key del proyecto.'
          }
          action={
            isAdmin || canConfigure ? (
              <Button variant="primary" onClick={() => setConfigOpen(true)}>
                <Settings2 />
                Configurar Jira
              </Button>
            ) : undefined
          }
        />
        <JiraConfigDialog open={configOpen} onOpenChange={setConfigOpen} projectId={projectId} />
      </>
    );
  }

  if (issue === 'token') {
    return (
      <>
        <EmptyState
          icon={icon ?? <KeyRound />}
          title="Falta tu token de Jira"
          description={
            `${projectName ? `«${projectName}» ya tiene` : 'El proyecto ya tiene'} dominio y key, pero faltan tus credenciales personales. ` +
            'Cargá tu email y API token para consultar Jira con tu usuario.'
          }
          action={
            <Button variant="primary" onClick={() => setTokenOpen(true)}>
              <KeyRound />
              Cargar mi token
            </Button>
          }
        />
        <JiraTokenDialog open={tokenOpen} onOpenChange={setTokenOpen} projectId={projectId} />
      </>
    );
  }

  return (
    <EmptyState
      icon={icon ?? <TriangleAlert />}
      title="No se pudo consultar Jira"
      description={message ?? 'Revisá la configuración de Jira del proyecto y tu token.'}
    />
  );
}
