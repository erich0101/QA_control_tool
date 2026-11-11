import { apiFetch } from './client';
import type { User, UserPermissions } from './types';

export interface UserInput {
  name: string;
  email: string;
  role: string;
  perfil: 'admin' | 'user';
  password?: string;
  permissions: Required<Omit<UserPermissions, 'user_id'>>;
  projects: number[];
}

export const usersApi = {
  list: () => apiFetch<{ users: User[] }>('/api/users'),

  create: (input: UserInput) =>
    apiFetch<{ ok: true; id: number }>('/api/users', { method: 'POST', body: input }),

  update: (id: number, input: UserInput) =>
    apiFetch<{ ok: true }>(`/api/users/${id}`, { method: 'PUT', body: input }),
};
