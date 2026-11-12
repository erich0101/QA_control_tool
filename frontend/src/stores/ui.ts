import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

interface UiState {
  theme: Theme;
  activeProjectId: number | null;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setActiveProjectId: (id: number | null) => void;
}

/** Clave que también usa la UI legacy: mantenerlas sincronizadas. */
const LEGACY_PROJECT_KEY = 'activeProjectId';

function writeLegacyProject(id: number | null) {
  if (id == null) localStorage.removeItem(LEGACY_PROJECT_KEY);
  else localStorage.setItem(LEGACY_PROJECT_KEY, String(id));
}

function readLegacyProject(): number | null {
  const raw = localStorage.getItem(LEGACY_PROJECT_KEY);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Estado de UI persistido. Usamos las mismas claves de localStorage que la
 * versión legacy (theme / activeProjectId) y escribimos ambas en cada cambio:
 * así el proyecto activo sobrevive al cambio de UI, a un reload o a un
 * `git pull`, y nadie "pierde" el contexto (ni la config de Jira asociada).
 */
export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: (localStorage.getItem('theme') as Theme) || 'dark',
      activeProjectId: readLegacyProject(),

      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },

      toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),

      setActiveProjectId: (id) => {
        writeLegacyProject(id);
        set({ activeProjectId: id });
      },
    }),
    {
      name: 'qa_ui_state',
      partialize: (state) => ({
        theme: state.theme,
        activeProjectId: state.activeProjectId,
      }),
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<UiState>;
        // Migración desde la UI legacy: si dejó un proyecto, se respeta.
        // (Después del cambio, ambas claves se escriben siempre igual.)
        return {
          ...current,
          ...stored,
          activeProjectId: readLegacyProject() ?? stored.activeProjectId ?? current.activeProjectId,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) writeLegacyProject(state.activeProjectId);
      },
    },
  ),
);

/** Sincroniza el atributo que consumen los tokens Apple (`[data-theme]`). */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.add('theme-transition');
  root.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  window.setTimeout(() => root.classList.remove('theme-transition'), 350);
}
