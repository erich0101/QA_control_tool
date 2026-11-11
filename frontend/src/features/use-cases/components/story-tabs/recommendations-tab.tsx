import { Lightbulb } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export function RecommendationsTab({ recommendations }: { recommendations: string[] }) {
  if (recommendations.length === 0) {
    return (
      <EmptyState
        icon={<Lightbulb />}
        title="Sin recomendaciones"
        description="Las recomendaciones de prueba se generan a partir del análisis de la HU."
      />
    );
  }

  return (
    <ul className="space-y-0">
      {recommendations.map((item, index) => (
        <li
          key={`${index}-${item.slice(0, 12)}`}
          className="flex items-start gap-3 border-b border-border py-2 last:border-0"
        >
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-brand" />
          <span className="text-footnote leading-relaxed text-fg">{item}</span>
        </li>
      ))}
    </ul>
  );
}
