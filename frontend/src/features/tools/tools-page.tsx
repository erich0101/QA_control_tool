import { useSearchParams } from 'react-router-dom';
import {
  Binary,
  Construction,
  IdCard,
  KeyRound,
  Rocket,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LEGACY_APP_URL } from '@/lib/env';
import { cn } from '@/lib/utils';
import { Base64Tool } from './components/base64-tool';
import { CuitTool } from './components/cuit-tool';

interface ToolDefinition {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  ready: boolean;
}

/**
 * Registro ÚNICO de herramientas.
 * El sidebar y el router interno salen de acá: agregar una tool es una línea.
 */
const TOOLS: ToolDefinition[] = [
  { id: 'base64', label: 'Base64', description: 'Encode / Decode', icon: Binary, ready: true },
  { id: 'cuit-generator', label: 'CUIT Generator', description: 'CUITs válidos', icon: IdCard, ready: true },
  {
    id: 'token-decoder',
    label: 'Token Decoder',
    description: 'JWT y tokens opacos',
    icon: KeyRound,
    ready: false,
  },
  {
    id: 'request-builder',
    label: 'Request Builder',
    description: 'HTTP requests',
    icon: Rocket,
    ready: false,
  },
];

export function ToolsPage() {
  const [params, setParams] = useSearchParams();

  const requested = params.get('tool');
  const active = TOOLS.find((tool) => tool.id === requested) ?? TOOLS[0];

  const select = (id: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id === TOOLS[0].id) next.delete('tool');
        else next.set('tool', id);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
        <div className="border-b border-border px-3 py-2.5">
          <p className="flex items-center gap-2 text-caption font-bold uppercase tracking-wider text-fg-subtle">
            <Wrench className="size-3.5" />
            Tools
          </p>
          <p className="mt-0.5 text-caption text-fg-subtle">Utilidades del equipo QA</p>
        </div>

        <nav className="scrollbar-apple min-h-0 flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              const isActive = tool.id === active.id;

              return (
                <li key={tool.id}>
                  <button
                    type="button"
                    onClick={() => select(tool.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md border border-transparent border-l-[3px] px-2.5 py-2 text-left transition-colors',
                      isActive
                        ? 'border-l-brand bg-brand-soft'
                        : 'border-l-transparent hover:bg-fill-soft',
                    )}
                  >
                    <Icon
                      className={cn('size-4 shrink-0', isActive ? 'text-brand' : 'text-fg-subtle')}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-footnote font-medium',
                          isActive ? 'text-fg' : 'text-fg-muted',
                        )}
                      >
                        {tool.label}
                      </span>
                      <span className="block truncate text-caption text-fg-subtle">
                        {tool.description}
                      </span>
                    </span>
                    {!tool.ready ? (
                      <span className="shrink-0 rounded bg-warn-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-warn">
                        Pronto
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <section className="scrollbar-apple min-w-0 flex-1 overflow-y-auto p-5">
        {active.id === 'base64' ? <Base64Tool /> : null}
        {active.id === 'cuit-generator' ? <CuitTool /> : null}
        {!active.ready ? (
          <EmptyState
            icon={<Construction />}
            title={`${active.label} · en migración`}
            description="Esta herramienta todavía vive en la versión anterior de la app. Se migra en el próximo corte de Tools."
            action={
              <Button variant="secondary" asChild>
                <a href={LEGACY_APP_URL}>Abrir en la versión anterior</a>
              </Button>
            }
          />
        ) : null}
      </section>
    </div>
  );
}
