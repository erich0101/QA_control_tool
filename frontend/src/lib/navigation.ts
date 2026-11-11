import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  ClipboardList,
  Clock3,
  Compass,
  FlaskConical,
  Search,
  Target,
  UserRound,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

/**
 * Definición ÚNICA de la navegación.
 * De acá salen el tabbar y las rutas: no puede haber dos listas de tabs
 * desincronizadas (era uno de los problemas de la UI vanilla).
 */
export interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  requiresAdmin?: boolean;
  /** Query key para el badge contador, si aplica. */
  badge?: 'useCases' | 'testSuites';
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'use-cases', path: 'use-cases', label: 'Casos de Uso', icon: ClipboardList, badge: 'useCases' },
  { id: 'test-suites', path: 'test-suites', label: 'Test Suites', icon: FlaskConical, badge: 'testSuites' },
  { id: 'execution', path: 'execution', label: 'Ejecución', icon: Zap },
  { id: 'history', path: 'history', label: 'Historial', icon: Clock3 },
  { id: 'jira-tracking', path: 'jira-tracking', label: 'Seguimiento Jira', icon: Target },
  { id: 'dashboard', path: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'hallazgos', path: 'hallazgos', label: 'Hallazgos', icon: Search },
  { id: 'exploratoria', path: 'exploratoria', label: 'Exploratoria', icon: Compass },
  { id: 'mi-jira', path: 'mi-jira', label: 'Mi JIRA', icon: UserRound },
  { id: 'team', path: 'team', label: 'Gestión de Equipo', icon: Users, requiresAdmin: true },
  { id: 'tools', path: 'tools', label: 'Tools', icon: Wrench },
];
