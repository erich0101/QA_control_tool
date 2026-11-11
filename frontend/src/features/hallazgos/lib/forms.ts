import type { Hallazgo, Suggestion } from '@/lib/api/types';
import type { HallazgoPatch, SuggestionPatch } from '@/lib/api/hallazgos';

export interface HallazgoFormValues {
  title: string;
  description: string;
  steps_to_reproduce: string;
  expected_result: string;
  actual_result: string;
  preconditions: string;
  observations: string;
  severity: string;
  frequency: string;
  business_impact: string;
  assigned_to: string;
  component: string;
  jira_epic_key: string;
}

export function hallazgoToForm(hallazgo?: Hallazgo | null): HallazgoFormValues {
  return {
    title: hallazgo?.title ?? '',
    description: hallazgo?.description ?? '',
    steps_to_reproduce: hallazgo?.steps_to_reproduce ?? '',
    expected_result: hallazgo?.expected_result ?? '',
    actual_result: hallazgo?.actual_result ?? '',
    preconditions: hallazgo?.preconditions ?? '',
    observations: hallazgo?.observations ?? '',
    severity: hallazgo?.severity ?? 'Media',
    frequency: hallazgo?.frequency ?? 'Siempre',
    business_impact: (hallazgo?.business_impact as string) ?? '',
    assigned_to: hallazgo?.assigned_to ? String(hallazgo.assigned_to) : '',
    component: hallazgo?.component ?? '',
    jira_epic_key: hallazgo?.jira_epic_key ?? '',
  };
}

/** Convierte el form al payload del backend (assign vacío → null). */
export function buildHallazgoPayload(values: HallazgoFormValues) {
  return {
    title: values.title.trim(),
    description: values.description,
    steps_to_reproduce: values.steps_to_reproduce,
    expected_result: values.expected_result,
    actual_result: values.actual_result,
    preconditions: values.preconditions,
    observations: values.observations,
    severity: values.severity,
    frequency: values.frequency,
    business_impact: values.business_impact,
    assigned_to: values.assigned_to ? Number(values.assigned_to) : null,
    component: values.component,
    jira_epic_key: values.jira_epic_key,
  };
}

/** Solo los campos modificados (guardado por diff). */
export function buildHallazgoPatch(
  values: HallazgoFormValues,
  dirty: Partial<Record<keyof HallazgoFormValues, boolean>>,
): HallazgoPatch {
  const full = buildHallazgoPayload(values);
  const patch: Record<string, unknown> = {};

  for (const key of Object.keys(dirty) as Array<keyof HallazgoFormValues>) {
    if (!dirty[key]) continue;
    const payloadKey = key as keyof typeof full;
    if (payloadKey in full) patch[payloadKey] = full[payloadKey];
  }

  return patch as HallazgoPatch;
}

export interface SuggestionFormValues {
  title: string;
  category: string;
  description: string;
  proposed_solution: string;
  priority: string;
  assigned_to: string;
}

export function suggestionToForm(suggestion?: Suggestion | null): SuggestionFormValues {
  return {
    title: suggestion?.title ?? '',
    category: suggestion?.category ?? 'UX',
    description: suggestion?.description ?? '',
    proposed_solution: suggestion?.proposed_solution ?? '',
    priority: suggestion?.priority ?? 'Media',
    assigned_to: suggestion?.assigned_to ? String(suggestion.assigned_to) : '',
  };
}

export function buildSuggestionPayload(values: SuggestionFormValues) {
  return {
    title: values.title.trim(),
    category: values.category,
    description: values.description,
    proposed_solution: values.proposed_solution,
    priority: values.priority,
    assigned_to: values.assigned_to ? Number(values.assigned_to) : null,
  };
}

export function buildSuggestionPatch(
  values: SuggestionFormValues,
  dirty: Partial<Record<keyof SuggestionFormValues, boolean>>,
): SuggestionPatch {
  const full = buildSuggestionPayload(values);
  const patch: Record<string, unknown> = {};

  for (const key of Object.keys(dirty) as Array<keyof SuggestionFormValues>) {
    if (!dirty[key]) continue;
    const payloadKey = key as keyof typeof full;
    if (payloadKey in full) patch[payloadKey] = full[payloadKey];
  }

  return patch as SuggestionPatch;
}
