export interface PermissionItem {
  key:
    | 'can_create_cu'
    | 'can_create_hu'
    | 'can_create_suite'
    | 'can_create_test'
    | 'can_assign_cu'
    | 'can_assign_hu'
    | 'can_assign_suite'
    | 'can_execute_test'
    | 'can_manage_projects'
    | 'can_manage_users'
    | 'can_configure_jira';
  label: string;
  short: string;
}

export interface PermissionGroup {
  title: string;
  items: PermissionItem[];
}

/**
 * Agrupación única de permisos.
 * La usan las tarjetas del equipo y el diálogo de alta/edición:
 * una sola fuente para que no se desincronicen etiquetas ni checkboxes.
 */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'Crear',
    items: [
      { key: 'can_create_cu', label: 'Casos de uso', short: 'Crear CU' },
      { key: 'can_create_hu', label: 'Historias de usuario', short: 'Crear HU' },
      { key: 'can_create_suite', label: 'Test suites', short: 'Crear suite' },
      { key: 'can_create_test', label: 'Test cases', short: 'Crear test' },
    ],
  },
  {
    title: 'Asignar',
    items: [
      { key: 'can_assign_cu', label: 'Casos de uso', short: 'Asignar CU' },
      { key: 'can_assign_hu', label: 'Historias de usuario', short: 'Asignar HU' },
      { key: 'can_assign_suite', label: 'Test suites', short: 'Asignar suite' },
    ],
  },
  {
    title: 'Gestión',
    items: [
      { key: 'can_execute_test', label: 'Ejecutar pruebas', short: 'Ejecutar' },
      { key: 'can_manage_projects', label: 'Gestionar proyectos', short: 'Proyectos' },
      { key: 'can_manage_users', label: 'Gestionar usuarios', short: 'Usuarios' },
      { key: 'can_configure_jira', label: 'Configurar Jira', short: 'Jira' },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.items);

export const ROLES = ['Tester', 'Analista QA', 'Lider Tecnico', 'Project Manager', 'Admin'];
