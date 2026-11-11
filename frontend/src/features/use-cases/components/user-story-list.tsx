import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { UserStory } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { StoryPriorityBadge, StoryStatusBadge } from './story-badges';

interface UserStoryListProps {
  stories: UserStory[];
  isLoading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function UserStoryList({ stories, isLoading, selectedId, onSelect }: UserStoryListProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return stories;
    return stories.filter(
      (story) =>
        (story.title ?? '').toLowerCase().includes(term) ||
        (story.key_id ?? '').toLowerCase().includes(term),
    );
  }, [stories, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative p-3 pb-2">
        <Search className="pointer-events-none absolute left-5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar historia…"
          className="h-8 pl-8 text-footnote"
          aria-label="Buscar historia de usuario"
        />
      </div>

      <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="space-y-1.5 rounded-md p-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2.5 w-12" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-center text-footnote text-fg-subtle">
            {stories.length === 0 ? 'Este caso de uso todavía no tiene HUs.' : 'Sin resultados.'}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((story) => {
              const isActive = story.id === selectedId;
              return (
                <li key={story.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(story.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'w-full rounded-md border border-transparent px-2.5 py-2 text-left transition-colors',
                      isActive
                        ? 'border-brand/30 bg-brand-soft'
                        : 'hover:bg-fill-soft',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'font-mono text-caption font-semibold',
                          isActive ? 'text-brand' : 'text-fg-subtle',
                        )}
                      >
                        {story.key_id}
                      </span>
                      <StoryStatusBadge status={story.status} />
                    </div>

                    <p
                      className={cn(
                        'mt-1 line-clamp-2 text-footnote leading-snug',
                        isActive ? 'text-fg' : 'text-fg-muted',
                      )}
                    >
                      {story.title}
                    </p>

                    <div className="mt-1.5 flex items-center gap-2">
                      <StoryPriorityBadge priority={story.priority} />
                      {(story.scenarios?.length ?? 0) > 0 ? (
                        <span className="text-caption text-fg-subtle">
                          {story.scenarios?.length} esc.
                        </span>
                      ) : null}
                      {(story.test_count ?? 0) > 0 ? (
                        <span className="text-caption text-fg-subtle">
                          {story.test_count} tests
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="border-t border-border px-3 py-1.5 text-caption text-fg-subtle">
        {stories.length} HU · {stories.reduce((acc, s) => acc + (s.scenarios?.length ?? 0), 0)} escenarios
      </p>
    </div>
  );
}
