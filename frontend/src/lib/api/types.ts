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
  /** Proyectos asignados (ids). */
  projects?: number[];
  /** Permisos aplanados tal como los devuelve GET /api/users. */
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

export interface Hallazgo {
  id: number;
  project_id: number;
  title: string;
  description?: string | null;
  severity?: string;
  status?: string;
  steps_to_reproduce?: string | null;
  expected_result?: string | null;
  actual_result?: string | null;
  frequency?: string | null;
  business_impact?: string | null;
  preconditions?: string | null;
  observations?: string | null;
  assigned_to?: number | null;
  assignee_name?: string | null;
  reporter_name?: string | null;
  jira_key?: string | null;
  jira_url?: string | null;
  jira_epic_key?: string | null;
  component?: string | null;
  created_at?: string;
  evidence_count?: number;
  converted_to_tc?: boolean;
  converted_tc_id?: number | null;
  converted_to_bug?: boolean;
  converted_bug_id?: number | null;
  origin_tc_id?: number | null;
  origin_tc_key?: string | null;
  origin_tc_title?: string | null;
  [key: string]: unknown;
}

export const HALLZGO_STATUSES = ['OPEN', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'WONT_FIX'] as const;
export const HALLZGO_SEVERITIES = ['Baja', 'Media', 'Alta', 'Crítica'] as const;
export const FREQUENCIES = ['Siempre', 'Casi Siempre', 'A veces', 'Rara vez'] as const;
export const IMPACTS = ['', 'Bajo', 'Medio', 'Alto', 'Crítico'] as const;

export interface Suggestion {
  id: number;
  project_id: number;
  title: string;
  category?: string;
  description?: string | null;
  proposed_solution?: string | null;
  priority?: string;
  status?: string;
  assigned_to?: number | null;
  assignee_name?: string | null;
  creator_name?: string | null;
  created_at?: string;
  evidence_count?: number;
  [key: string]: unknown;
}

export const SUGGESTION_CATEGORIES = ['UX', 'Performance', 'Seguridad', 'Accesibilidad', 'Otro'] as const;
export const SUGGESTION_STATUSES = ['OPEN', 'IN_REVIEW', 'ACCEPTED', 'REJECTED', 'DONE'] as const;
export const SUGGESTION_PRIORITIES = ['Baja', 'Media', 'Alta'] as const;

export interface EvidenceItem {
  id: number;
  file_name: string;
  mime_type?: string;
  evidence_category?: string;
  created_at?: string;
}

export type ExecutionStatus = 'PENDING' | 'PASS' | 'FAIL' | 'BLOCK' | 'SKIP';

// ── Testing exploratorio ──────────────────────────────────────
export interface ExploratorySession {
  id: number;
  name?: string | null;
  charter?: string | null;
  timebox_minutes?: number | null;
  status: string;
  started_at?: string | null;
  finished_at?: string | null;
  creator_name?: string | null;
  flow_count?: number;
  ok_count?: number;
  fail_count?: number;
  warning_count?: number;
  block_count?: number;
  skip_count?: number;
  pending_count?: number;
  total_flows?: number;
  /** Hallazgos creados dentro de la sesión. */
  hallazgo_count?: number;
  suite_id?: number;
  project_id?: number;
  accumulated_seconds?: number;
  last_resume_at?: string | null;
}

export interface ExploratoryFlow {
  id: number;
  title: string;
  steps?: string | null;
  expected_result?: string | null;
  key_id?: string | null;
  assigned_to?: number | null;
  created_at?: string;
}

export interface ExploratoryExecution {
  id: number;
  tc_id: number;
  status: string;
  observations?: string | null;
  obtained_result?: string | null;
  executed_at?: string | null;
  tester?: string | null;
}

export interface ExploratoryAttachment {
  id: number;
  execution_id?: number | null;
  defect_id?: number | null;
  file_name?: string;
  mime_type?: string;
  evidence_category?: string;
  created_at?: string;
}

export interface ExploratoryDetail {
  run: ExploratorySession;
  flows: ExploratoryFlow[];
  executions: ExploratoryExecution[];
  defects: Defect[];
  attachments: ExploratoryAttachment[];
  /** Hallazgos (qa_defects sin ejecución) creados en la sesión. */
  hallazgos: ExploratoryHallazgo[];
}

export interface ExploratoryHallazgo {
  id: number;
  title: string;
  description?: string | null;
  severity?: string | null;
  status: string;
  created_at?: string;
  steps_to_reproduce?: string | null;
  expected_result?: string | null;
  actual_result?: string | null;
  jira_key?: string | null;
  jira_url?: string | null;
  assigned_to?: number | null;
  created_by?: number | null;
  reporter_name?: string | null;
  assignee_name?: string | null;
}

export const EXPLORATORY_STATUSES = ['OK', 'FAIL', 'WARNING', 'BLOCK', 'SKIP'] as const;
export type ExploratoryStatus = (typeof EXPLORATORY_STATUSES)[number];

// ── Jira ──────────────────────────────────────────────────────
export interface JiraComment {
  author?: string;
  created?: string;
  body?: string;
  isMention?: boolean;
}

export interface JiraTicket {
  key: string;
  id?: string;
  summary?: string;
  status?: string;
  statusCategory?: string;
  priority?: string;
  assignee?: string;
  reporter?: string;
  created?: string;
  updated?: string;
  issueType?: string;
  parent?: string | null;
  mentions?: JiraComment[] | null;
  comments?: JiraComment[] | null;
}

export type MyJiraFilter = 'assigned' | 'created' | 'mentions';

export interface JiraTrackingItem {
  id: number;
  title: string;
  jira_key: string;
  jira_url?: string | null;
  created_at?: string;
  jira_status: string;
  jira_assignee: string;
  jira_avatar?: string | null;
  jira_priority?: string;
  jira_epic_key: string;
  jira_epic_name: string;
}

export interface JiraIssueComment {
  id?: string;
  author: {
    displayName: string;
    accountId?: string;
    avatarUrls?: Record<string, string>;
  };
  created: string;
  /** Cuerpo en formato ADF (Atlassian Document Format). */
  body: unknown;
}

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
