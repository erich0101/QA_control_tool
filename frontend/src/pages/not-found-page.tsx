import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { NAV_ITEMS } from '@/lib/navigation';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg p-10">
      <EmptyState
        icon={<Compass />}
        title="Página no encontrada"
        description="La ruta que buscás no existe en la nueva UI."
        action={
          <Button variant="primary" asChild>
            <Link to={`/${NAV_ITEMS[0].path}`}>Ir a {NAV_ITEMS[0].label}</Link>
          </Button>
        }
      />
    </div>
  );
}
