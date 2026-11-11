import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import type { Project, User } from '@/lib/api/types';
import type { UserInput } from '@/lib/api/users';
import { cn } from '@/lib/utils';
import { PERMISSION_GROUPS, ROLES } from '../lib/permissions';

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: User | null;
  projects: Project[];
  isPending?: boolean;
  onSubmit: (input: UserInput) => Promise<void>;
}

type PermissionKey = (typeof PERMISSION_GROUPS)[number]['items'][number]['key'];

interface FormValues {
  name: string;
  email: string;
  role: string;
  perfil: 'admin' | 'user';
  password: string;
  permissions: Record<PermissionKey, boolean>;
  projects: string[];
}

const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: role }));
const PERFIL_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
];

function toDefaults(user?: User | null): FormValues {
  const permissions = {} as Record<PermissionKey, boolean>;
  for (const group of PERMISSION_GROUPS) {
    for (const item of group.items) {
      permissions[item.key] = Boolean(user?.[item.key]);
    }
  }

  return {
    name: user?.name ?? '',
    email: user?.email ?? '',
    role: user?.role ?? 'Tester',
    perfil: (user?.perfil as 'admin' | 'user') ?? 'user',
    password: '',
    permissions,
    projects: (user?.projects ?? []).map(String),
  };
}

export function UserDialog({
  open,
  onOpenChange,
  user,
  projects,
  isPending,
  onSubmit,
}: UserDialogProps) {
  const isEdit = Boolean(user);
  const { register, control, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: toDefaults(user),
  });

  useEffect(() => {
    if (open) reset(toDefaults(user));
  }, [open, user, reset]);

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      name: values.name.trim(),
      email: values.email.trim(),
      role: values.role,
      perfil: values.perfil,
      ...(values.password ? { password: values.password } : {}),
      permissions: values.permissions,
      projects: (values.projects ?? []).map(Number),
    });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Modificá los datos, permisos y proyectos del usuario.'
              : 'Configurá un nuevo integrante del equipo y sus permisos.'}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={submit} noValidate>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nombre completo" htmlFor="user-name" error={formState.errors.name?.message}>
              <Input
                id="user-name"
                autoFocus
                placeholder="Ana García"
                {...register('name', { required: 'El nombre es obligatorio' })}
              />
            </Field>

            <Field label="Email" htmlFor="user-email" error={formState.errors.email?.message}>
              <Input
                id="user-email"
                type="email"
                placeholder="ana@empresa.com"
                {...register('email', { required: 'El email es obligatorio' })}
              />
            </Field>

            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Field label="Rol" htmlFor="user-role">
                  <SelectField
                    id="user-role"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={ROLE_OPTIONS}
                  />
                </Field>
              )}
            />

            <Controller
              control={control}
              name="perfil"
              render={({ field }) => (
                <Field
                  label="Perfil"
                  htmlFor="user-perfil"
                  hint="Admin gestiona el equipo y accede a todos los permisos."
                >
                  <SelectField
                    id="user-perfil"
                    value={field.value}
                    onValueChange={(value) => field.onChange(value as 'admin' | 'user')}
                    options={PERFIL_OPTIONS}
                  />
                </Field>
              )}
            />
          </div>

          <Field
            label={isEdit ? 'Contraseña (opcional)' : 'Contraseña'}
            htmlFor="user-password"
            hint={isEdit ? 'Dejala vacía para no cambiarla.' : undefined}
            error={formState.errors.password?.message}
          >
            <Input
              id="user-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              {...register('password', {
                validate: (value) => isEdit || Boolean(value) || 'La contraseña es obligatoria',
              })}
            />
          </Field>

          <div>
            <p className="mb-2 text-caption font-bold uppercase tracking-wide text-fg-subtle">
              Permisos granulares
            </p>
            <div className="grid gap-4 rounded-lg border border-border bg-surface-2 p-3 md:grid-cols-3">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="mb-1.5 text-caption font-semibold text-fg-muted">{group.title}</p>
                  <ul className="space-y-1.5">
                    {group.items.map((item) => (
                      <li key={item.key}>
                        <label className="flex cursor-pointer items-center justify-between gap-2 text-footnote text-fg">
                          <span>{item.label}</span>
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--color-brand)]"
                            {...register(`permissions.${item.key}`)}
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-caption font-bold uppercase tracking-wide text-fg-subtle">
              Proyectos asignados
            </p>
            <ul className="flex flex-wrap gap-2">
              {projects.map((project) => (
                <li key={project.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1 text-footnote',
                      'hover:border-brand/60',
                    )}
                  >
                    <input
                      type="checkbox"
                      value={project.id}
                      className="size-3.5 accent-[var(--color-brand)]"
                      {...register('projects')}
                    />
                    {project.name}
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              {isEdit ? 'Guardar cambios' : 'Crear usuario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
