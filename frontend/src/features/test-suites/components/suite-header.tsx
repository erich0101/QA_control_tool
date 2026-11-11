import { Link } from 'react-router-dom';
import {
  Ban,
  CheckCircle2,
  CirclePlay,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TestSuite, User } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface SuiteHeaderProps {
  suite: TestSuite;
  team: User[];
  canManage: boolean;
  canCreateTest: boolean;
  isRunning?: boolean;
  isAssigning?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRun: () => void;
  onNewTestCase: () => void;
  onAssignAll: (userId: number | null) => void;
  onToggleActive: (isActive: boolean) => void;
  onAiTool: () => void;
}

export function SuiteHeader({
  suite,
  team,
  canManage,
  canCreateTest,
  isRunning,
  isAssigning,
  onEdit,
  onDelete,
  onRun,
  onNewTestCase,
  onAssignAll,
  onToggleActive,
  onAiTool,
}: SuiteHeaderProps) {
  const isIncluded = suite.is_active !== false;

  return (
    <header className="shrink-0 border-b border-border bg-surface">
      <div className="flex items-center gap-2 px-5 pt-2.5">
        <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
          Test suites
        </span>
        <span className="text-caption text-fg-subtle">›</span>
        <span className="font-mono text-caption font-bold text-brand">
          #{suite.id}
          {suite.key_id ? ` · ${suite.key_id}` : ''}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 pb-2.5 pt-1">
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fg">{suite.title}</h2>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={!canManage}
                onClick={() => onToggleActive(!isIncluded)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-caption font-bold uppercase tracking-wide transition-colors',
                  isIncluded
                    ? 'border-transparent bg-ok-soft text-ok hover:bg-ok/20'
                    : 'border-warn/40 bg-warn-soft text-warn hover:bg-warn/20',
                  !canManage && 'cursor-not-allowed opacity-70',
                )}
              >
                {isIncluded ? <CheckCircle2 className="size-3.5" /> : <Ban className="size-3.5" />}
                {isIncluded ? 'Activa' : 'Fuera del gap'}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {isIncluded
                ? 'La suite cuenta en las métricas de cobertura'
                : 'La suite no se contabiliza en cobertura'}
              {!canManage ? ' · Solo Admin/Analista QA puede cambiarlo' : ''}
            </TooltipContent>
          </Tooltip>

          {suite.jira_epic_key ? <Badge tone="brand">{suite.jira_epic_key}</Badge> : null}

          <Button variant="ghost" size="sm" onClick={onEdit} disabled={!canManage}>
            <Pencil />
            Editar
          </Button>

          <Button variant="ghost" size="sm" className="text-fail" onClick={onDelete} disabled={!canManage}>
            <Trash2 />
            Eliminar
          </Button>

          <div className="mx-1 h-5 w-px bg-border" aria-hidden />

          <Button variant="primary" size="sm" onClick={onRun} loading={isRunning}>
            <CirclePlay />
            Ejecutar
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="sm" onClick={onAiTool}>
                <Sparkles />
                AI Tool
              </Button>
            </TooltipTrigger>
            <TooltipContent>Generación de tests con IA (pendiente de migración)</TooltipContent>
          </Tooltip>

          <Button variant="secondary" size="sm" onClick={onNewTestCase} disabled={!canCreateTest}>
            <Plus />
            Nuevo TC
          </Button>

          <div className="w-44">
            <SelectField
              value=""
              onValueChange={(value) => onAssignAll(value ? Number(value) : null)}
              placeholder="Asignar todos…"
              aria-label="Asignar todos los tests de la suite"
              disabled={isAssigning || !canManage}
              options={[
                { value: '0', label: '— Sin asignar —' },
                ...team.map((user) => ({ value: String(user.id), label: user.name })),
              ]}
            />
          </div>
        </div>
      </div>

      {suite.description ? (
        <p className="border-t border-border px-5 py-1.5 text-caption text-fg-muted">
          {String(suite.description)}
        </p>
      ) : null}

      <div className="flex items-center gap-3 border-t border-border px-5 py-1.5 text-caption text-fg-subtle">
        <span className="inline-flex items-center gap-1">
          <UserCheck className="size-3" />
          {suite.test_cases?.length ?? 0} tests
        </span>
        {suite.active_run_id ? (
          <Badge tone="ok">Ciclo en curso · run #{suite.active_run_id}</Badge>
        ) : null}
        <Link to="/execution" className="ml-auto text-brand hover:underline">
          Ir a Ejecución →
        </Link>
      </div>
    </header>
  );
}
