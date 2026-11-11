import { Skeleton } from '@/components/ui/skeleton';

/** Fallback mientras se carga el chunk de una página (code splitting). */
export function PageSkeleton() {
  return (
    <div className="space-y-4 p-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3 w-80" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
