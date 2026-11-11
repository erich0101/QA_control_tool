import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { CirclePlay, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { STORY_PRIORITIES, type TestCase, type TestSuite, type User, type UserStory } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { useTestCaseMutations } from '../use-test-suites';

interface TestCaseDetailProps {
  testCase: TestCase;
  suite: TestSuite;
  suites: TestSuite[];
  stories: UserStory[];
  team: User[];
  epics: Array<{ key: string; name: string }>;
  projectId: number | null;
  canManage: boolean;
  onClose: () => void;
  onRun: () => void;
  onDelete: () => void;
}

interface FormValues {
  title: string;
  us_id: string;
  assigned_to: string;
  priority: string;
  jira_epic_key: string;
  preconditions: string;
  steps: string;
  test_data: string;
  expected_result: string;
  acceptance_criteria: string;
  assumptions: string;
  is_smoke: boolean;
  is_regression: boolean;
  is_integration: boolean;
}

const PRIORITY_OPTIONS = STORY_PRIORITIES.map((value) => ({ value, label: value }));

function toForm(tc: TestCase): FormValues {
  return {
    title: tc.title ?? '',
    us_id: tc.us_id ? String(tc.us_id) : '',
    assigned_to: tc.assigned_to ? String(tc.assigned_to) : '',
    priority: (tc.priority as string) ?? 'Media',
    jira_epic_key: tc.jira_epic_key ?? '',
    preconditions: tc.preconditions ?? '',
    steps: tc.steps ?? tc.description ?? '',
    test_data: tc.test_data ?? '',
    expected_result: tc.expected_result ?? '',
    acceptance_criteria: tc.acceptance_criteria ?? '',
    assumptions: tc.assumptions ?? '',
    is_smoke: Boolean(tc.is_smoke),
    is_regression: Boolean(tc.is_regression),
    is_integration: Boolean(tc.is_integration),
  };
}

/**
 * Detalle expandido de un test case.
 * Modo lectura por defecto (como en la UI legacy); "Editar" habilita los campos
 * y "Guardar" envía solo lo modificado.
 */
export function TestCaseDetail({
  testCase,
  suite,
  suites,
  stories,
  team,
  epics,
  projectId,
  canManage,
  onClose,
  onRun,
  onDelete,
}: TestCaseDetailProps) {
  const { update, move } = useTestCaseMutations(projectId);
  const [editing, setEditing] = useState(false);
  const { register, control, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    defaultValues: toForm(testCase),
  });

  const isReadOnly = !editing || update.isPending;

  // Importante: leer `isDirty`/`dirtyFields` durante el render para que RHF
  // mantenga el estado de campos modificados (si solo se leen en el handler,
  // quedan vacíos y nunca se envía el patch).
  const { isDirty, dirtyFields } = formState;

  const linkedUs = stories.find((story) => Number(story.id) === Number(testCase.us_id));
  const otherSuites = suites.filter(
    (item) => item.id !== suite.id && item.use_case_id === suite.use_case_id,
  );

  const onSubmit = handleSubmit(async (values) => {
    const patch: Record<string, unknown> = {};

    (Object.keys(dirtyFields) as Array<keyof FormValues>).forEach((key) => {
      const value = values[key];
      if (key === 'us_id' || key === 'assigned_to') {
        patch[key] = value ? Number(value) : null;
      } else if (key === 'jira_epic_key' || key === 'priority') {
        patch[key] = value || '';
      } else {
        patch[key] = value;
      }
    });

    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }

    await update.mutateAsync({ id: testCase.id, patch });
    reset(values);
    setEditing(false);
  });

  const handleCancel = () => {
    reset(toForm(testCase));
    setEditing(false);
  };

  const handleMove = async (suiteId: string) => {
    if (!suiteId) return;
    await move.mutateAsync({ id: testCase.id, suiteId: Number(suiteId) });
    onClose();
  };

  return (
    <form
      className="space-y-3 px-5 py-3"
      onSubmit={onSubmit}
      noValidate
    >
      <div className="flex items-center gap-2">
        <Badge tone="brand" className="font-mono">
          {testCase.key_id}
        </Badge>

        {editing ? (
          <Input
            className="h-8 flex-1"
            placeholder="Título del test case"
            aria-label="Título del test case"
            {...register('title', { required: true })}
          />
        ) : (
          <h3 className="flex-1 truncate text-footnote font-semibold text-fg">{testCase.title}</h3>
        )}

        <Badge tone={testCase.status === 'FAIL' ? 'fail' : testCase.status === 'OK' ? 'ok' : 'neutral'}>
          {testCase.status ?? 'PENDING'}
        </Badge>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Cerrar detalle"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      <Tabs defaultValue="steps">
        <TabsList>
          <TabsTrigger value="steps">Pasos</TabsTrigger>
          <TabsTrigger value="expected">Esperado</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>

        <div className="space-y-4 py-3">
          <TabsContent value="steps" className="space-y-3">
            <Field label="Precondiciones" htmlFor={`pre-${testCase.id}`}>
              <Textarea id={`pre-${testCase.id}`} className="min-h-16" disabled={isReadOnly} {...register('preconditions')} />
            </Field>
            <Field label="Pasos del test" htmlFor={`steps-${testCase.id}`} hint="Un paso por línea.">
              <Textarea id={`steps-${testCase.id}`} className="min-h-32 font-mono text-footnote" disabled={isReadOnly} {...register('steps')} />
            </Field>
            <Field label="Datos de prueba" htmlFor={`data-${testCase.id}`}>
              <Textarea id={`data-${testCase.id}`} className="min-h-16" disabled={isReadOnly} {...register('test_data')} />
            </Field>
          </TabsContent>

          <TabsContent value="expected" className="space-y-3">
            <Field label="Resultado esperado" htmlFor={`expected-${testCase.id}`}>
              <Textarea id={`expected-${testCase.id}`} className="min-h-20" disabled={isReadOnly} {...register('expected_result')} />
            </Field>
            <Field label="Criterios de aceptación" htmlFor={`ac-${testCase.id}`}>
              <Textarea id={`ac-${testCase.id}`} className="min-h-20" disabled={isReadOnly} {...register('acceptance_criteria')} />
            </Field>
            <Field label="Suposiciones" htmlFor={`assump-${testCase.id}`}>
              <Textarea id={`assump-${testCase.id}`} className="min-h-16" disabled={isReadOnly} {...register('assumptions')} />
            </Field>
          </TabsContent>

          <TabsContent value="metadata" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Controller
                control={control}
                name="us_id"
                render={({ field }) => (
                  <Field label="Historia de usuario" htmlFor={`us-${testCase.id}`}>
                    <SelectField
                      id={`us-${testCase.id}`}
                      value={field.value}
                      onValueChange={field.onChange}
                      allowEmpty
                      placeholder="No vinculada"
                      disabled={isReadOnly}
                      options={stories.map((story) => ({
                        value: String(story.id),
                        label: `${story.key_id} · ${story.title}`,
                      }))}
                    />
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="assigned_to"
                render={({ field }) => (
                  <Field label="Asignado a" htmlFor={`assignee-${testCase.id}`}>
                    <SelectField
                      id={`assignee-${testCase.id}`}
                      value={field.value}
                      onValueChange={field.onChange}
                      allowEmpty
                      placeholder="Sin asignar"
                      disabled={isReadOnly}
                      options={team.map((user) => ({ value: String(user.id), label: user.name }))}
                    />
                  </Field>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Field label="Prioridad" htmlFor={`priority-${testCase.id}`}>
                    <SelectField
                      id={`priority-${testCase.id}`}
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isReadOnly}
                      options={PRIORITY_OPTIONS}
                    />
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="jira_epic_key"
                render={({ field }) => (
                  <Field label="Épica de Jira" htmlFor={`epic-${testCase.id}`}>
                    <SelectField
                      id={`epic-${testCase.id}`}
                      value={field.value}
                      onValueChange={field.onChange}
                      allowEmpty
                      placeholder="Sin épica"
                      disabled={isReadOnly || epics.length === 0}
                      options={epics.map((epic) => ({
                        value: epic.key,
                        label: `${epic.key} · ${epic.name}`,
                      }))}
                    />
                  </Field>
                )}
              />
            </div>

            <div className="flex flex-wrap gap-4 rounded-md bg-fill-soft px-3 py-2.5">
              {(
                [
                  ['is_smoke', 'Smoke'],
                  ['is_regression', 'Regresión'],
                  ['is_integration', 'Integración'],
                ] as const
              ).map(([name, label]) => (
                <label key={name} className={cn('flex items-center gap-2 text-footnote', isReadOnly && 'opacity-70')}>
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-brand)]"
                    disabled={isReadOnly}
                    checked={Boolean(watch(name))}
                    onChange={(event) => setValue(name, event.target.checked, { shouldDirty: true })}
                  />
                  {label}
                </label>
              ))}
            </div>

            {linkedUs ? (
              <Button variant="ghost" size="sm" asChild className="text-brand">
                <Link to={`/use-cases?cu=${suite.use_case_id}&hu=${linkedUs.id}`}>
                  Ver HU {linkedUs.key_id}
                </Link>
              </Button>
            ) : null}

            {otherSuites.length > 0 ? (
              <Field
                label="Mover a otra suite"
                htmlFor={`move-${testCase.id}`}
                hint={testCase.us_id ? 'Desvinculá la HU antes de mover el test.' : undefined}
              >
                <SelectField
                  id={`move-${testCase.id}`}
                  value=""
                  onValueChange={handleMove}
                  allowEmpty
                  placeholder={`Suite actual: ${suite.title}`}
                  disabled={Boolean(testCase.us_id) || Boolean(suite.active_run_id) || move.isPending}
                  options={otherSuites.map((item) => ({
                    value: String(item.id),
                    label: `#${item.id} · ${item.title}`,
                  }))}
                />
              </Field>
            ) : null}
          </TabsContent>
        </div>
      </Tabs>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-fail"
          onClick={onDelete}
          disabled={!canManage || Boolean(suite.active_run_id)}
        >
          <Trash2 />
          Eliminar
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRun}
          disabled={Boolean(suite.active_run_id)}
        >
          <CirclePlay />
          Ejecutar
        </Button>

        <div className="flex-1" />

        {editing ? (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
              <RotateCcw />
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={update.isPending} disabled={!isDirty}>
              <Save />
              Guardar
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setEditing(true)}
            disabled={!canManage}
          >
            Editar
          </Button>
        )}
      </div>
    </form>
  );
}
