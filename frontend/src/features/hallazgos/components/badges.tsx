import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const HALLZGO_STATUS: Record<string, { label: string; tone: 'fail' | 'warn' | 'ok' | 'neutral' }> = {
  OPEN: { label: 'OPEN', tone: 'fail' },
  IN_PROGRESS: { label: 'EN CURSO', tone: 'warn' },
  FIXED: { label: 'FIXED', tone: 'ok' },
  CLOSED: { label: 'CLOSED', tone: 'neutral' },
  WONT_FIX: { label: 'WONT FIX', tone: 'neutral' },
};

const SEVERITY: Record<string, 'fail' | 'warn' | 'ok' | 'neutral'> = {
  Crítica: 'fail',
  Alta: 'fail',
  Media: 'warn',
  Baja: 'ok',
};

const SUGGESTION_STATUS: Record<string, { label: string; tone: 'brand' | 'warn' | 'ok' | 'neutral' }> = {
  OPEN: { label: 'OPEN', tone: 'brand' },
  IN_REVIEW: { label: 'EN REVISIÓN', tone: 'warn' },
  ACCEPTED: { label: 'ACEPTADA', tone: 'ok' },
  DONE: { label: 'HECHA', tone: 'ok' },
  REJECTED: { label: 'RECHAZADA', tone: 'neutral' },
};

const CATEGORY: Record<string, 'brand' | 'fail' | 'warn' | 'neutral'> = {
  UX: 'brand',
  Performance: 'warn',
  Seguridad: 'fail',
  Accesibilidad: 'brand',
  Otro: 'neutral',
};

export function HallazgoStatusBadge({ status, className }: { status?: string; className?: string }) {
  const meta = HALLZGO_STATUS[status ?? 'OPEN'] ?? HALLZGO_STATUS.OPEN;
  return (
    <Badge tone={meta.tone} className={cn(className)}>
      {meta.label}
    </Badge>
  );
}

export function SeverityBadge({ severity, className }: { severity?: string; className?: string }) {
  const value = severity ?? 'Media';
  return (
    <Badge tone={SEVERITY[value] ?? 'warn'} className={cn(className)}>
      {value}
    </Badge>
  );
}

export function SuggestionStatusBadge({ status }: { status?: string }) {
  const meta = SUGGESTION_STATUS[status ?? 'OPEN'] ?? SUGGESTION_STATUS.OPEN;
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function CategoryBadge({ category }: { category?: string }) {
  const value = category ?? 'Otro';
  return <Badge tone={CATEGORY[value] ?? 'neutral'}>{value}</Badge>;
}
