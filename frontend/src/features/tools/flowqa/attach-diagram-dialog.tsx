import { useEffect, useMemo, useState } from 'react';
import { FileImage, Link2, Loader2, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { FlowDiagramSummary, FlowLinkEntityType } from '@/lib/api/flow-diagrams';
import { cn } from '@/lib/utils';
import { useFlowDiagram, useFlowDiagrams } from '../use-flow-diagrams';
import { renderPngFile, renderSvgFile } from './export';
import type { FlowState } from './model';

type DiagramFormat = 'svg' | 'png';

interface AttachDiagramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number | null;
  entityType: FlowLinkEntityType;
  entityId: number | null;
  onAttach: (file: File, category: string) => void | Promise<void>;
  isUploading?: boolean;
}

function plainState(diagram: { nodes: unknown[]; edges: unknown[]; settings: Record<string, unknown> }): FlowState {
  return {
    nodes: diagram.nodes as FlowState['nodes'],
    edges: diagram.edges as FlowState['edges'],
    settings: {
      snapToGrid: Boolean((diagram.settings as { snapToGrid?: boolean }).snapToGrid ?? true),
      mermaidDir: (diagram.settings as { mermaidDir?: 'TD' | 'LR' }).mermaidDir === 'LR' ? 'LR' : 'TD',
    },
  };
}

function safeName(name: string) {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'diagrama'
  );
}

export function AttachDiagramDialog({
  open,
  onOpenChange,
  projectId,
  entityType,
  entityId,
  onAttach,
  isUploading,
}: AttachDiagramDialogProps) {
  const { data: diagrams = [], isLoading } = useFlowDiagrams(projectId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [format, setFormat] = useState<DiagramFormat>('svg');
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => {
    const linked = (diagram: FlowDiagramSummary) =>
      diagram.entity_type === entityType && diagram.entity_id === entityId;
    return [...diagrams].sort((a, b) => Number(linked(b)) - Number(linked(a)));
  }, [diagrams, entityType, entityId]);

  const selected = sorted.find((diagram) => diagram.id === selectedId) ?? null;
  const { data: detail, isLoading: isLoadingDetail } = useFlowDiagram(open ? selectedId : null);

  useEffect(() => {
    if (!open) return;
    const linked = sorted.find(
      (diagram) => diagram.entity_type === entityType && diagram.entity_id === entityId,
    );
    setSelectedId(linked?.id ?? sorted[0]?.id ?? null);
  }, [open, entityType, entityId, sorted]);

  useEffect(() => {
    if (!selected) return;
    setFormat(selected.node_count > 20 ? 'svg' : 'png');
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const attach = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const state = plainState(detail);
      const fileName = `diagrama-${safeName(detail.name)}`;
      const file =
        format === 'svg'
          ? renderSvgFile(state, document.documentElement.dataset.theme === 'dark', fileName)
          : await renderPngFile(state, document.documentElement.dataset.theme === 'dark', fileName);
      if (!file) return;
      await onAttach(file, 'DIAGRAM');
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const hasLinked = sorted.some(
    (diagram) => diagram.entity_type === entityType && diagram.entity_id === entityId,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adjuntar diagrama de flujo</DialogTitle>
          <DialogDescription>
            Se adjunta como evidencia. Es opcional y podés elegir cualquier diagrama del proyecto.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : sorted.length === 0 ? (
            <EmptyState
              icon={<Workflow />}
              title="Todavía no hay diagramas"
              description="Creá un diagrama en FlowQA Studio y luego volvé para adjuntarlo como evidencia."
              action={
                <Button variant="secondary" asChild>
                  <Link to="/tools?tool=flowqa">Abrir FlowQA Studio</Link>
                </Button>
              }
            />
          ) : (
            <>
              <div>
                <p className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-fg-subtle">
                  Diagrama
                </p>
                <ul className="scrollbar-apple max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                  {sorted.map((diagram) => {
                    const linked = diagram.entity_type === entityType && diagram.entity_id === entityId;
                    return (
                      <li key={diagram.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(diagram.id)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors',
                            selectedId === diagram.id ? 'border-brand bg-brand-soft' : 'hover:bg-fill-soft',
                          )}
                        >
                          <Workflow className="size-4 shrink-0 text-brand" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-footnote font-semibold text-fg">
                              {diagram.name}
                            </span>
                            <span className="block text-caption text-fg-subtle">
                              {diagram.node_count} nodos · {diagram.edge_count} conexiones · v{diagram.version}
                            </span>
                          </span>
                          {linked ? (
                            <Badge tone="brand" className="shrink-0">
                              <Link2 className="size-3" />
                              Vinculado
                            </Badge>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {hasLinked ? (
                  <p className="mt-1 text-caption text-fg-subtle">
                    Los diagramas vinculados a esta entidad aparecen primero.
                  </p>
                ) : null}
              </div>

              <div>
                <p className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-fg-subtle">
                  Formato
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setFormat('svg')}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors',
                      format === 'svg' ? 'border-brand bg-brand-soft' : 'border-border hover:bg-fill-soft',
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-footnote font-semibold text-fg">
                      <FileImage className="size-3.5" />
                      SVG · vector
                    </span>
                    <span className="mt-0.5 block text-caption text-fg-subtle">
                      Recomendado para diagramas extensos: zoom sin pérdida.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat('png')}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors',
                      format === 'png' ? 'border-brand bg-brand-soft' : 'border-border hover:bg-fill-soft',
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-footnote font-semibold text-fg">
                      <FileImage className="size-3.5" />
                      PNG · 2.5x
                    </span>
                    <span className="mt-0.5 block text-caption text-fg-subtle">
                      Imagen de alta resolución, más compatible con visores.
                    </span>
                  </button>
                </div>
              </div>

              {selected ? (
                <p className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-caption text-fg-subtle">
                  Se adjuntará: <strong className="text-fg-muted">{selected.name}</strong> ·{' '}
                  {format.toUpperCase()}
                  {isLoadingDetail ? ' · preparando…' : ''}
                </p>
              ) : null}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={attach}
            disabled={!detail || busy || isUploading}
            loading={busy || isUploading}
          >
            {busy || isUploading ? <Loader2 /> : <Workflow />}
            Adjuntar diagrama
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
