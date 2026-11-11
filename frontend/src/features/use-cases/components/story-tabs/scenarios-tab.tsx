import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-provider';
import type { Scenario, UserStory } from '@/lib/api/types';
import { useStoryChildren } from '../../use-use-cases';

interface ScenariosTabProps {
  story: UserStory;
  projectId: number | null;
  useCaseId: number | null;
}

function ScenarioRow({
  scenario,
  index,
  onRename,
  onDelete,
  isDeleting,
}: {
  scenario: Scenario;
  index: number;
  onRename: (title: string) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [title, setTitle] = useState(scenario.title);

  useEffect(() => setTitle(scenario.title), [scenario.title]);

  const commit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(scenario.title);
      return;
    }
    if (trimmed !== scenario.title) onRename(trimmed);
  };

  return (
    <li className="group flex items-center gap-3 border-b border-border py-1.5 last:border-0">
      <span className="w-8 shrink-0 text-center text-caption font-bold text-brand">E{index + 1}</span>
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setTitle(scenario.title);
            event.currentTarget.blur();
          }
        }}
        className="h-8 flex-1 border-transparent bg-transparent px-2 text-footnote shadow-none hover:border-border focus-visible:border-brand"
        aria-label={`Título del escenario E${index + 1}`}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-fail opacity-0 transition-opacity group-hover:opacity-100"
        aria-label={`Eliminar escenario E${index + 1}`}
        disabled={isDeleting}
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

export function ScenariosTab({ story, projectId, useCaseId }: ScenariosTabProps) {
  const confirm = useConfirm();
  const { createScenario, updateScenario, deleteScenario } = useStoryChildren(projectId, useCaseId);
  const scenarios = story.scenarios ?? [];

  const handleAdd = () => {
    createScenario.mutate({
      us_id: story.id,
      title: `Nuevo escenario ${scenarios.length + 1}`,
      order_index: scenarios.length,
    });
  };

  const handleDelete = async (scenario: Scenario) => {
    const ok = await confirm({
      title: 'Eliminar escenario',
      description: `¿Eliminar “${scenario.title}”? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (ok) deleteScenario.mutate(scenario.id);
  };

  return (
    <div className="space-y-2">
      {scenarios.length === 0 ? (
        <p className="py-6 text-center text-footnote text-fg-subtle">
          No hay escenarios vinculados a esta HU.
        </p>
      ) : (
        <ul>
          {scenarios.map((scenario, index) => (
            <ScenarioRow
              key={scenario.id}
              scenario={scenario}
              index={index}
              isDeleting={deleteScenario.isPending}
              onRename={(title) => updateScenario.mutate({ id: scenario.id, title })}
              onDelete={() => handleDelete(scenario)}
            />
          ))}
        </ul>
      )}

      <Button
        variant="ghost"
        className="w-full border border-dashed border-border text-fg-muted"
        onClick={handleAdd}
        loading={createScenario.isPending}
      >
        <Plus />
        Añadir escenario
      </Button>
    </div>
  );
}
