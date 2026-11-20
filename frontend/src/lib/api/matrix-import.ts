import { apiFetch } from './client';

export interface MatrixImportOptions {
  create_use_cases: boolean;
  create_user_stories: boolean;
  group_by_hu: boolean;
  existing_use_case_id?: number | null;
  existing_suite_id?: number | null;
  conflict_policy: 'skip' | 'update' | 'duplicate';
  cu_mapping?: Record<string, { use_case_id: number } | { key: string; title: string }>;
}

export interface MatrixImportUseCaseValue {
  raw: string;
  key?: string | null;
  title?: string | null;
  count: number;
  action: string;
  valid: boolean;
  mapped_use_case_id?: number | null;
}

export interface MatrixImportSummary {
  rows: number;
  valid_rows: number;
  errors: number;
  warnings: number;
  use_cases: number;
  user_stories: number;
  suites_to_create: number;
  test_cases: { total: number; create: number; update: number; skip: number };
}

export interface MatrixImportIssue {
  row?: number | null;
  field?: string;
  message: string;
}

export interface MatrixImportPreview {
  ok: true;
  dry_run: true;
  filename?: string | null;
  headers: string[];
  summary: MatrixImportSummary;
  use_case_values: MatrixImportUseCaseValue[];
  user_story_values: Array<{ key?: string | null; title?: string | null; count: number; valid: boolean }>;
  errors: MatrixImportIssue[];
  warnings: MatrixImportIssue[];
}

export interface MatrixImportResult {
  ok: true;
  dry_run: false;
  summary: MatrixImportSummary;
  result: {
    use_cases_created: number;
    user_stories_created: number;
    suites_created: number;
    test_cases_created: number;
    test_cases_updated: number;
    test_cases_skipped: number;
    scenarios_created: number;
  };
}

function buildForm(file: File, options: MatrixImportOptions) {
  const form = new FormData();
  form.append('xlsx', file);
  form.append('create_use_cases', String(options.create_use_cases));
  form.append('create_user_stories', String(options.create_user_stories));
  form.append('group_by_hu', String(options.group_by_hu));
  form.append('conflict_policy', options.conflict_policy);
  if (options.existing_use_case_id) {
    form.append('existing_use_case_id', String(options.existing_use_case_id));
  }
  if (options.existing_suite_id) {
    form.append('existing_suite_id', String(options.existing_suite_id));
  }
  if (options.cu_mapping && Object.keys(options.cu_mapping).length > 0) {
    form.append('cu_mapping', JSON.stringify(options.cu_mapping));
  }
  return form;
}

export const matrixImportApi = {
  preview: (projectId: number, file: File, options: MatrixImportOptions) =>
    apiFetch<MatrixImportPreview>(`/api/projects/${projectId}/import-matrix/preview`, {
      method: 'POST',
      body: buildForm(file, options),
    }),

  commit: (projectId: number, file: File, options: MatrixImportOptions) =>
    apiFetch<MatrixImportResult>(`/api/projects/${projectId}/import-matrix/commit`, {
      method: 'POST',
      body: buildForm(file, options),
    }),
};
