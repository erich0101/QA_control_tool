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

export interface UseCase {
  id: number;
  project_id: number;
  name: string;
  description?: string | null;
  [key: string]: unknown;
}

export interface UserStory {
  id: number;
  use_case_id: number;
  title: string;
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
