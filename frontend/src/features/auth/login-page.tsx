import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { FlaskConical, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api/client';
import { LEGACY_APP_URL } from '@/lib/env';
import { useLogin } from './use-auth';

interface LoginForm {
  email: string;
  password: string;
}

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ defaultValues: { email: '', password: '' } });

  const errorMessage =
    login.error instanceof ApiError ? login.error.message : login.error ? 'Error inesperado' : null;

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/use-cases', { replace: true });
    } catch {
      // El error se muestra abajo; no hace falta hacer nada más.
    }
  });

  return (
    <div className="flex min-h-full items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-apple-lg">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <FlaskConical className="size-6" />
          </div>
          <h1 className="text-title3 font-semibold text-fg">Manual QA</h1>
          <p className="text-footnote text-fg-muted">JIRA Edition · Iniciá sesión para continuar</p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="tu@email.com"
              aria-invalid={Boolean(errors.email)}
              {...register('email', { required: 'Ingresá tu email' })}
            />
            {errors.email ? <p className="text-caption text-fail">{errors.email.message}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={Boolean(errors.password)}
              {...register('password', { required: 'Ingresá tu contraseña' })}
            />
            {errors.password ? (
              <p className="text-caption text-fail">{errors.password.message}</p>
            ) : null}
          </div>

          {errorMessage ? (
            <p role="alert" className="rounded-md bg-fail-soft px-3 py-2 text-footnote text-fail">
              {errorMessage}
            </p>
          ) : null}

          <Button type="submit" variant="primary" className="w-full" loading={login.isPending}>
            <LogIn />
            Iniciar Sesión
          </Button>
        </form>

        <p className="mt-6 text-center text-caption text-fg-subtle">
          ¿Problemas con la nueva UI?{' '}
          <a href={LEGACY_APP_URL} className="text-brand hover:underline">
            Abrir versión anterior
          </a>
        </p>
      </div>
    </div>
  );
}
