import { apiFetch } from './client';
import type { User, UserPermissions } from './types';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  ok: true;
  user: Pick<User, 'id' | 'name' | 'role' | 'perfil'>;
}

export interface MeResponse {
  user: User;
  permissions: UserPermissions | null;
}

export const authApi = {
  login: (payload: LoginPayload) =>
    apiFetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: payload,
      silentAuth: true,
    }),

  me: () => apiFetch<MeResponse>('/api/auth/me', { silentAuth: true }),

  logout: () => apiFetch<{ ok: true }>('/api/auth/logout', { method: 'POST', silentAuth: true }),
};
