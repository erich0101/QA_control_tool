import { Controller, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { STORY_PRIORITIES, type TestSuite } from '@/lib/api/types';
import { useUserStories } from '@/features/use-cases/use-use-cases';
import { useTeam, useTestCaseMutations } from '../use-test-suites';

interface TestCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number | null;
  suite: TestSuite;
  epics: Array<{ key: string; name: string }>;
  onCreated?: (id: number) => void;
}

interface FormValues {
  title: string;
  us_id: string;
  assigned_to: string;
  priority: string;
  jira_epic_key: string;
  preconditions: string;
  steps: string;
  expected_result: string;
}

const PRIORITY_OPTIONS = STORY_PRIORITIES.map((value) => ({ value, label: value }));

export function TestCaseDialog({
  open,
  onOpenChange,
  projectId,
  suite,
  epics,
  onCreated,
}: TestCaseDialogProps) {
  const { create } = useTestCaseMutations(projectId);
  const { data: stories = [] } = useUserStories(suite.use_case_id ?? null);
  const { data: team = [] } = useTeam();

  const { register, control, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: {
      title: '',
      us_id: '',
      assigned_to: '',
      priority: 'Media',
      jira_epic_key: '',
      preconditions: '',
      steps: '',
      expected_result: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await create.mutateAsync({
        suite_id: suite.id,
        title: values.title.trim(),
        us_id: values.us_id ? Number(values.us_id) : null,
        assigned_to: values.assigned_to ? Number(values.assigned_to) : null,
        priority: values.priority,
        jira_epic_key: values.jira_epic_key,
        preconditions: values.preconditions.trim(),
        steps: values.steps.trim(),
        expected_result: values.expected_result.trim(),
      });
      reset();
      onOpenChange(false);
      onCreated?.(result.id);
    } catch {
      // Toast manejado por el hook.
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo test case</DialogTitle>
          <DialogDescription>
            Se agrega a <span className="font-medium text-fg">{suite.title}</span>.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <Field label="Título" htmlFor="tc-title" error={formState.errors.title?.message}>
            <Input
              id="tc-title"
              autoFocus
              placeholder="Ej: Login con credenciales válidas"
              aria-invalid={Boolean(formState.errors.title)}
              {...register('title', { required: 'El título es obligatorio' })}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Controller
              control={control}
              name="us_id"
              render={({ field }) => (
                <Field label="Historia de usuario" htmlFor="tc-us">
                  <SelectField
                    id="tc-us"
                    value={field.value}
                    onValueChange={field.onChange}
                    allowEmpty
                    placeholder="No vinculada"
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
                <Field label="Asignado a" htmlFor="tc-assignee">
                  <SelectField
                    id="tc-assignee"
                    value={field.value}
                    onValueChange={field.onChange}
                    allowEmpty
                    placeholder="Sin asignar"
                    options={team.map((user) => ({
                      value: String(user.id),
                      label: user.name,
                    }))}
                  />
                </Field>
              )}
            />

            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <Field label="Prioridad" htmlFor="tc-priority">
                  <SelectField
                    id="tc-priority"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={PRIORITY_OPTIONS}
                  />
                </Field>
              )}
            />
          </div>

          {epics.length > 0 ? (
            <Controller
              control={control}
              name="jira_epic_key"
              render={({ field }) => (
                <Field label="Épica de Jira" htmlFor="tc-epic">
                  <SelectField
                    id="tc-epic"
                    value={field.value}
                    onValueChange={field.onChange}
                    allowEmpty
                    placeholder="Sin épica"
                    options={epics.map((epic) => ({
                      value: epic.key,
                      label: `${epic.key} · ${epic.name}`,
                    }))}
                  />
                </Field>
              )}
            />
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Precondiciones" htmlFor="tc-preconditions">
              <Textarea id="tc-preconditions" className="min-h-20" {...register('preconditions')} />
            </Field>
            <Field label="Resultado esperado" htmlFor="tc-expected">
              <Textarea id="tc-expected" className="min-h-20" {...register('expected_result')} />
            </Field>
          </div>

          <Field label="Pasos" htmlFor="tc-steps" hint="Un paso por línea (1. …, 2. …)">
            <Textarea id="tc-steps" className="min-h-28" {...register('steps')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Crear test case
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
