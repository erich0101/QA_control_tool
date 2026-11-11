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
  name: string;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface ApiListResponse<T> {
  rows?: T[];
  total?: number;
  page?: number;
  limit?: number;
}
