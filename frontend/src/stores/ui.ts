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

/**
 * Estado de UI persistido. Usamos las mismas claves de localStorage que la
 * versión legacy (theme / activeProjectId) para que la transición entre
 * ambas UIs no pierda el contexto del usuario.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: (localStorage.getItem('theme') as Theme) || 'dark',
      activeProjectId: Number(localStorage.getItem('activeProjectId')) || null,

      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },

      toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),

      setActiveProjectId: (id) => set({ activeProjectId: id }),
    }),
    {
      name: 'qa_ui_state',
      partialize: (state) => ({
        theme: state.theme,
        activeProjectId: state.activeProjectId,
      }),
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
