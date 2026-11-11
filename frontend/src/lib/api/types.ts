/**
 * Tipos del dominio. Se van ampliando a medida que se migra cada tab.
 * Los nombres reflejan las columnas reales de la base (snake_case) para
 * evitar mapeos manuales en cada componente.
 */

export type Perfil = 'admin' | 'user';

export interface UserPermissions {
  user_id: number;
  can_create_cu?: boolean;
  can_create_hu?: boolean;
  can_create_suite?: boolean;
  can_create_test?: boolean;
  can_assign_cu?: boolean;
  can_assign_hu?: boolean;
  can_assign_suite?: boolean;
  can_execute_test?: boolean;
  can_manage_projects?: boolean;
  can_manage_users?: boolean;
  can_configure_jira?: boolean;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  perfil: Perfil;
  permissions?: UserPermissions | null;
}

export interface Project {
  id: number;
  name: string;
  description?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | string;
  created_at?: string;
  [key: string]: unknown;
}

export type UseCaseStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | string;

export interface UseCase {
  id: number;
  project_id: number;
  key_id: string;
  title: string;
  description?: string | null;
  status?: UseCaseStatus;
  us_count?: number;
  created_at?: string;
  [key: string]: unknown;
}

export const STORY_STATUSES = ['En Análisis', 'Finalizada', 'Deprecada', 'Rechazada'] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

export const STORY_PRIORITIES = ['Alta', 'Media', 'Baja'] as const;
export type StoryPriority = (typeof STORY_PRIORITIES)[number];

export const INCONSISTENCY_SEVERITIES = ['Alta', 'Media', 'Baja'] as const;
export type InconsistencySeverity = (typeof INCONSISTENCY_SEVERITIES)[number];

export interface Scenario {
  id: number;
  us_id: number;
  title: string;
  description?: string | null;
  order_index?: number;
}

export interface Inconsistency {
  id: number;
  title: string;
  description?: string | null;
  severity?: InconsistencySeverity;
}

export interface Recommendation {
  title?: string;
  description?: string;
}

export interface UserStory {
  id: number;
  use_case_id: number;
  key_id: string;
  title: string;
  status: StoryStatus | string;
  priority: StoryPriority | string;
  hu_detallada?: string | null;
  escenarios_prueba?: string | null;
  reglas_negocio?: string | null;
  precondiciones?: string | null;
  /** JSON serializado: { url, md } (legacy guardaba solo la URL como string) */
  link_documentacion?: string | null;
  /** Puede venir como JSON string o ya parseado según el endpoint. */
  recommendations?: string | Recommendation[] | null;
  scenarios?: Scenario[];
  inconsistencies?: Inconsistency[];
  test_count?: number;
  created_at?: string;
  [key: string]: unknown;
}

export interface TestSuite {
  id: number;
  project_id: number;
  use_case_id?: number | null;
  key_id?: string;
  title: string;
  description?: string | null;
  is_active?: boolean;
  jira_epic_key?: string | null;
  active_run_id?: number | null;
  assigned_to_name?: string | null;
  test_cases?: TestCase[];
  test_cases_count?: number;
  inconsistencies?: Inconsistency[];
  activeRun?: ExecutionRun | null;
  [key: string]: unknown;
}

export interface TestCase {
  id: number;
  suite_id?: number;
  us_id?: number | null;
  scenario_id?: number | null;
  assigned_to?: number | null;
  key_id: string;
  title: string;
  steps?: string | null;
  /** Alias legacy: algunas filas traen `description` en lugar de `steps`. */
  description?: string | null;
  expected_result?: string | null;
  preconditions?: string | null;
  test_data?: string | null;
  assumptions?: string | null;
  acceptance_criteria?: string | null;
  priority?: StoryPriority | string;
  jira_epic_key?: string | null;
  is_smoke?: boolean;
  is_regression?: boolean;
  is_integration?: boolean;
  is_exploratory?: boolean;
  status?: string;
  execution_id?: number | null;
  last_execution_at?: string | null;
  observations?: string | null;
  obtained_result?: string | null;
  attachments?: Attachment[];
  defects?: Defect[];
  [key: string]: unknown;
}

export interface ExecutionRun {
  id: number;
  status: 'RUNNING' | 'PAUSED' | 'ACTIVE' | string;
  run_type?: string;
  accumulated_seconds?: number;
  last_resume_at?: string | null;
  parent_run_id?: number | null;
}

export interface Attachment {
  id: number;
  category?: string;
  src: string;
}

export interface Defect {
  id: number;
  title: string;
  description?: string | null;
  severity?: string;
  status?: string;
  jira_key?: string | null;
  jira_url?: string | null;
  jira_status?: string | null;
  created_at?: string;
  tc_key?: string | null;
  tc_title?: string | null;
  tester_name?: string | null;
  run_id?: number | null;
  execution_id?: number | null;
  steps_to_reproduce?: string | null;
  expected_result?: string | null;
  actual_result?: string | null;
  frequency?: string | null;
  business_impact?: string | null;
  observations?: string | null;
  [key: string]: unknown;
}

export interface RunStats {
  total: number;
  pass: number;
  fail: number;
  warn: number;
  block: number;
  skipped: number;
}

export interface TestRun {
  id: number;
  suite_id: number;
  suite_title: string;
  tester_name?: string | null;
  run_type?: string;
  status?: string;
  started_at?: string | null;
  finished_at?: string | null;
  stats: RunStats;
  [key: string]: unknown;
}

export interface HistoryPage {
  runs: TestRun[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type ExecutionStatus = 'PENDING' | 'PASS' | 'FAIL' | 'BLOCK' | 'SKIP';

export interface BugDraft {
  title: string;
  description: string;
  severity: string;
  steps_to_reproduce: string;
  expected_result: string;
  actual_result: string;
  frequency: string;
  business_impact: string;
  observations: string;
}

export type TestCasePatch = Partial<
  Pick<
    TestCase,
    | 'us_id'
    | 'scenario_id'
    | 'title'
    | 'steps'
    | 'expected_result'
    | 'assigned_to'
    | 'priority'
    | 'is_smoke'
    | 'is_regression'
    | 'is_integration'
    | 'preconditions'
    | 'jira_epic_key'
    | 'assumptions'
    | 'test_data'
    | 'acceptance_criteria'
  >
>;

export interface ApiListResponse<T> {
  rows?: T[];
  total?: number;
  page?: number;
  limit?: number;
}
