import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useLogout } from '@/features/auth/use-auth';
import { initials } from '@/lib/utils';
import { useSessionStore } from '@/stores/session';
import { useUiStore } from '@/stores/ui';
import { LogOut, Moon, Sun } from 'lucide-react';

export function UserMenu() {
  const user = useSessionStore((s) => s.user);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const logout = useLogout();

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-fill-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        aria-label="Menú de usuario"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-brand text-caption font-bold text-white">
          {initials(user.name)}
        </span>
        <span className="max-w-32 truncate text-footnote font-medium text-fg">{user.name}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Cuenta</DropdownMenuLabel>
        <div className="px-2 pb-2">
          <p className="truncate text-sm font-medium text-fg">{user.name}</p>
          <p className="truncate text-caption text-fg-subtle">{user.email}</p>
          <div className="mt-1.5 flex gap-1">
            <Badge tone={user.perfil === 'admin' ? 'brand' : 'neutral'}>{user.perfil}</Badge>
            <Badge tone="outline">{user.role}</Badge>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={toggleTheme}>
          {theme === 'dark' ? <Sun /> : <Moon />}
          {theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-fail focus:bg-fail-soft"
          onSelect={() => logout.mutate()}
        >
          <LogOut />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
