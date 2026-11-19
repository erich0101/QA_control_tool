import { useState } from 'react';
import { Bug, CircleCheck, CircleX, CircleSlash, Rocket, Save, SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ReadField } from '@/components/ui/read-field';
import { Textarea } from '@/components/ui/input';
import type { BugDraft, ExecutionStatus, TestCase } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { useExecutionMutations } from '../use-execution';
import { useTcStatusHistory } from '../use-status-history';
import { StatusHistoryTimeline } from './status-history-timeline';
import { BugDrafts, emptyBugDraft } from './bug-drafts';
import { EvidenceSection } from './evidence-section';
import { JiraTicketDialog } from '@/features/jira-tickets/jira-ticket-dialog';
import { JiraTraceBadge } from '@/features/jira-tickets/jira-trace-badge';

interface ExecutionDetailProps {
  testCase: TestCase;
  projectId: number | null;
}

const STATUS_BUTTONS: Array<{
  value: ExecutionStatus;
  label: string;
  icon: typeof CircleCheck;
  className: string;
}> = [
  {
    value: 'PASS',
    label: 'PASS',
    icon: CircleCheck,
    className: 'border-ok/40 text-ok hover:bg-ok-soft data-[active=true]:bg-ok data-[active=true]:text-white',
  },
  {
    value: 'FAIL',
    label: 'FAIL',
    icon: CircleX,
    className:
      'border-fail/40 text-fail hover:bg-fail-soft data-[active=true]:bg-fail data-[active=true]:text-white',
  },
  {
    value: 'BLOCK',
    label: 'BLOCK',
    icon: CircleSlash,
    className:
      'border-warn/40 text-warn hover:bg-warn-soft data-[active=true]:bg-warn data-[active=true]:text-white',
  },
  {
    value: 'SKIP',
    label: 'SKIP',
    icon: SkipForward,
    className:
      'border-border-strong text-fg-muted hover:bg-fill-soft data-[active=true]:bg-fg-muted data-[active=true]:text-bg',
  },
];

/**
 * Detalle de ejecución de un test case.
 * Un solo guardado persiste status + justificación + resultado real + bugs.
 */
export function ExecutionDetail({ testCase, projectId }: ExecutionDetailProps) {
  const { saveResult, uploadEvidence, deleteEvidence } = useExecutionMutations(projectId);
  const { data: statusHistory = [] } = useTcStatusHistory(testCase.id);

  const initialStatus = (testCase.status as ExecutionStatus) || 'PENDING';
  const [status, setStatus] = useState<ExecutionStatus>(initialStatus);
  const [observations, setObservations] = useState(testCase.observations ?? '');
  const [obtained, setObtained] = useState(testCase.obtained_result ?? '');
  const [drafts, setDrafts] = useState<BugDraft[]>([]);
  const [jiraDefectId, setJiraDefectId] = useState<number | null>(null);

  const needsJustification = status === 'BLOCK' || status === 'SKIP';
  const existingDefects = testCase.defects ?? [];
  const jiraDefect = existingDefects.find((defect) => defect.id === jiraDefectId) ?? null;

  const handleSave = async () => {
    if (status === 'PENDING') {
      toast.warning('Seleccioná un resultado (PASS / FAIL / BLOCK / SKIP)');
      return;
    }

    if (needsJustification && !observations.trim()) {
      toast.warning(
        `La justificación del ${status === 'SKIP' ? 'salto' : 'bloqueo'} es obligatoria`,
      );
      return;
    }

    const bugs = drafts.filter((draft) => draft.title.trim());

    await saveResult.mutateAsync({
      id: testCase.id,
      input: {
        status,
        ...(needsJustification ? { observations: observations.trim() } : {}),
        ...(obtained.trim() ? { obtained_result: obtained.trim() } : {}),
        ...(status === 'FAIL' && bugs.length > 0 ? { bugs } : {}),
      },
    });

    setDrafts([]);
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="grid gap-3 md:grid-cols-2">
        <ReadField
          label="Instrucciones / Pasos"
          value={testCase.steps || testCase.description}
          empty="Sin pasos."
          mono
        />
        <ReadField
          label="Resultado esperado"
          value={testCase.expected_result}
          empty="Sin resultado esperado definido."
        />
      </div>

      {existingDefects.length > 0 ? (
        <div className="space-y-2">
          <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
            Defectos reportados ({existingDefects.length})
          </span>
          {existingDefects.map((defect) => (
            <div
              key={defect.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-fail/30 bg-fail-soft/40 px-3 py-2"
            >
              <Bug className="size-3.5 shrink-0 text-fail" />
              <span className="min-w-0 flex-1 truncate text-footnote font-medium text-fg">
                {defect.title}
              </span>
              <Badge tone="fail">{defect.severity ?? 'Media'}</Badge>
              <JiraTraceBadge
                jiraKey={defect.jira_key}
                jiraUrl={defect.jira_url}
                jiraStatus={defect.jira_status}
              />
              {defect.jira_key ? null : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7"
                  disabled={defect.status === 'DISMISSED'}
                  title={
                    defect.status === 'DISMISSED'
                      ? 'El bug está descartado: reabrilo para exportarlo a Jira'
                      : 'Crear un ticket de error en Jira a partir de este bug'
                  }
                  onClick={() => setJiraDefectId(defect.id)}
                >
                  <Rocket />
                  Ticket Jira
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <EvidenceSection
        testCase={testCase}
        projectId={projectId}
        isUploading={uploadEvidence.isPending}
        onUpload={(file, category) =>
          uploadEvidence.mutate({ file, testCaseId: testCase.id, category })
        }
        onDelete={(attachment) => deleteEvidence.mutate(attachment.id)}
      />

      {needsJustification ? (
        <Field
          label={status === 'SKIP' ? 'Justificación del salto' : 'Justificación del bloqueo'}
          htmlFor={`block-${testCase.id}`}
          hint="Obligatoria para guardar este resultado."
        >
          <Textarea
            id={`block-${testCase.id}`}
            className="min-h-20"
            value={observations}
            onChange={(event) => setObservations(event.target.value)}
            placeholder={
              status === 'SKIP'
                ? 'Indicá por qué se salta este test…'
                : 'Indicá por qué no se pudo ejecutar este test…'
            }
          />
        </Field>
      ) : null}

      <Field label="Resultado real (opcional)" htmlFor={`obtained-${testCase.id}`}>
        <Textarea
          id={`obtained-${testCase.id}`}
          className="min-h-16"
          value={obtained}
          onChange={(event) => setObtained(event.target.value)}
          placeholder="Describí brevemente lo observado. Aparece en el reporte HTML."
        />
      </Field>

      {status === 'FAIL' ? (
        drafts.length === 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDrafts([emptyBugDraft(testCase.expected_result ?? '')])}
          >
            <Bug />
            Reportar defecto
          </Button>
        ) : (
          <BugDrafts
            drafts={drafts}
            baseSteps={testCase.steps ?? ''}
            baseExpected={testCase.expected_result ?? ''}
            onChange={setDrafts}
          />
        )
      ) : null}

      <StatusHistoryTimeline entries={statusHistory} />

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
          Resultado
        </span>

        <div className="flex gap-1">
          {STATUS_BUTTONS.map((button) => {
            const Icon = button.icon;
            return (
              <button
                key={button.value}
                type="button"
                data-active={status === button.value}
                onClick={() => setStatus(button.value)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-caption font-bold transition-colors',
                  button.className,
                )}
              >
                <Icon className="size-3.5" />
                {button.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {initialStatus !== 'PENDING' ? (
          <span className="text-caption text-fg-subtle">
            Resultado ya registrado — podés corregirlo
          </span>
        ) : null}

        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleSave}
          loading={saveResult.isPending}
          disabled={status === 'PENDING'}
        >
          <Save />
          Guardar
        </Button>
      </div>

      <JiraTicketDialog
        open={jiraDefect != null}
        onOpenChange={(open) => {
          if (!open) setJiraDefectId(null);
        }}
        projectId={projectId}
        kind="defect"
        items={
          jiraDefect
            ? [
                {
                  id: jiraDefect.id,
                  title: jiraDefect.title || 'Sin título',
                  severity: jiraDefect.severity,
                  jira_key: jiraDefect.jira_key,
                },
              ]
            : []
        }
      />
    </div>
  );
}
