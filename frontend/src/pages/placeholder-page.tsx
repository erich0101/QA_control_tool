import { Construction, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LEGACY_APP_URL } from '@/lib/env';

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

/**
 * Página temporal para los tabs que todavía no se migraron.
 * Durante el strangler la UI vieja sigue disponible en /.
 */
export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <EmptyState
        icon={<Construction />}
        title={`${title} · en migración`}
        description={
          description ??
          'Esta sección ya está ruteada en la nueva arquitectura pero su UI todavía vive en la versión anterior de la app.'
        }
        action={
          <Button variant="secondary" asChild>
            <a href={LEGACY_APP_URL}>
              Abrir en la versión anterior
              <ExternalLink />
            </a>
          </Button>
        }
      />
    </div>
  );
}
