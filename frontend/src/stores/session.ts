import { create } from 'zustand';
import type { User } from '@/lib/api/types';

/**
 * Sesión del usuario. Deliberadamente pequeño: los datos del servidor viven
 * en TanStack Query, acá solo guardamos "quién soy" y su estado.
 */
export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

interface SessionState {
  status: SessionStatus;
  user: User | null;
  setUser: (user: User) => void;
  clear: () => void;
  isAdmin: () => boolean;
  /** Roles con permisos de gestión (equivalente a `requireAdmin` del backend). */
  canManage: () => boolean;
  can: (permission: keyof NonNullable<User['permissions']>) => boolean;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  status: 'loading',
  user: null,

  setUser: (user) => set({ user, status: 'authenticated' }),

  clear: () => set({ user: null, status: 'anonymous' }),

  // El backend marca admin con el campo `perfil` (no con `role`).
  isAdmin: () => get().user?.perfil === 'admin',

  canManage: () => {
    const role = get().user?.role;
    return role === 'Admin' || role === 'Analista QA';
  },

  can: (permission) => {
    const user = get().user;
    if (!user) return false;
    if (user.perfil === 'admin') return true;
    return Boolean(user.permissions?.[permission]);
  },
}));
