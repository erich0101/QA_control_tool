import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** Etiqueta de estado. Centraliza los colores de OK/FAIL/WARN para no repetirlos. */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-fill-soft text-fg-muted',
        brand: 'border-transparent bg-brand-soft text-brand',
        ok: 'border-transparent bg-ok-soft text-ok',
        warn: 'border-transparent bg-warn-soft text-warn',
        fail: 'border-transparent bg-fail-soft text-fail',
        outline: 'border-border-strong bg-transparent text-fg-muted',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.ComponentProps<'span'>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
