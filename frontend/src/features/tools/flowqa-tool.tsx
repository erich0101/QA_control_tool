import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, FilePlus2, Save, Trash2, Upload, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-provider';
import type { FlowDiagramPayload, FlowLinkEntityType } from '@/lib/api/flow-diagrams';
import { formatDate } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { FlowQaEditor } from './flowqa/flowqa-editor';
import {
  FLOWQA_IMPORT_ACCEPT,
  FLOWQA_IMPORT_MAX_BYTES,
  parseFlowQaJson,
} from './flowqa/import';
import { DEFAULT_SETTINGS, type FlowState } from './flowqa/model';
import {
  useFlowDiagram,
  useFlowDiagramMutations,
  useFlowDiagrams,
  useFlowLinkTargets,
} from './use-flow-diagrams';

const EMPTY_STATE: FlowState = { nodes: [], edges: [], settings: DEFAULT_SETTINGS };

export function FlowQaTool() {
  const projectId = useUiStore((state) => state.activeProjectId);
  const confirm = useConfirm();
  const { data: diagrams = [], isLoading } = useFlowDiagrams(projectId);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [name, setName] = useState('Nuevo diagrama');
  const [description, setDescription] = useState('');
  const [entity, setEntity] = useState('none');
  const [dirty, setDirty] = useState(false);
  const stateRef = useRef<FlowState>(EMPTY_STATE);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { data: activeDiagram, isLoading: isLoadingDiagram } = useFlowDiagram(activeId);
  const { data: linkTargets = [] } = useFlowLinkTargets(projectId);
  const { create, update, remove } = useFlowDiagramMutations(projectId);

  useEffect(() => {
    setActiveId(null);
    setEditorKey((key) => key + 1);
    setName('Nuevo diagrama');
    setDescription('');
    setEntity('none');
    setDirty(false);
    stateRef.current = EMPTY_STATE;
  }, [projectId]);

  useEffect(() => {
    if (!activeDiagram) return;
    setName(activeDiagram.name);
    setDescription(activeDiagram.description ?? '');
    setEntity(
      activeDiagram.entity_type && activeDiagram.entity_id
        ? `${activeDiagram.entity_type}:${activeDiagram.entity_id}`
        : 'none',
    );
    setDirty(false);
    // Solo sincroniza cuando llega una versión nueva del servidor; no pisa
    // cambios locales de nombre/descripción ante un refetch cualquiera.
  }, [activeDiagram?.id, activeDiagram?.version]);

  const onChange = useCallback((state: FlowState) => {
    stateRef.current = state;
  }, []);

  const onDirty = useCallback(() => setDirty(true), []);

  const resetToNew = () => {
    setActiveId(null);
    setEditorKey((key) => key + 1);
    setName('Nuevo diagrama');
    setDescription('');
    setEntity('none');
    setDirty(false);
    stateRef.current = EMPTY_STATE;
  };

  const confirmDiscard = async () => {
    if (!dirty) return true;
    return confirm({
      title: 'Cambios sin guardar',
      description: 'Si continuás vas a perder los cambios del diagrama actual.',
      confirmLabel: 'Descartar cambios',
      destructive: true,
    });
  };

  const selectDiagram = async (value: string) => {
    if (!(await confirmDiscard())) return;
    if (value === 'new') {
      resetToNew();
      return;
    }
    setActiveId(Number(value));
    setDirty(false);
  };

  const newDiagram = async () => {
    if (!(await confirmDiscard())) return;
    resetToNew();
  };

  const entityLink = () => {
    if (entity === 'none') return { entity_type: null, entity_id: null };
    const [type, rawId] = entity.split(':');
    return {
      entity_type: type as FlowLinkEntityType,
      entity_id: Number(rawId) || null,
    };
  };

  const saveDiagram = async () => {
    if (!projectId) return;
    if (!name.trim()) {
      toast.warning('Poné un nombre al diagrama antes de guardar');
      return;
    }
    const payload: FlowDiagramPayload = {
      name: name.trim(),
      description: description.trim() || null,
      nodes: stateRef.current.nodes,
      edges: stateRef.current.edges,
      settings: stateRef.current.settings,
      ...entityLink(),
    };
    if (activeId) {
      await update.mutateAsync({ id: activeId, payload });
    } else {
      const created = await create.mutateAsync(payload);
      setActiveId(created.id);
    }
    setDirty(false);
  };

  const duplicateDiagram = async () => {
    if (!projectId) return;
    const payload: FlowDiagramPayload = {
      name: `${name.trim() || 'Diagrama'} (copia)`,
      description: description.trim() || null,
      nodes: stateRef.current.nodes,
      edges: stateRef.current.edges,
      settings: stateRef.current.settings,
    };
    const created = await create.mutateAsync(payload);
    setActiveId(created.id);
    setDirty(false);
  };

  const importDiagram = async (file: File) => {
    if (!projectId) return;
    if (file.size > FLOWQA_IMPORT_MAX_BYTES) {
      toast.error('El archivo supera el máximo permitido de 2 MB.');
      return;
    }
    if (!(await confirmDiscard())) return;

    try {
      const parsed = parseFlowQaJson(
        await file.text(),
        file.name.replace(/\.json$/i, '') || 'Diagrama importado',
      );

      // El vínculo solo se conserva si la entidad existe en este proyecto.
      const validLink = parsed.entity_type && parsed.entity_id
        ? linkTargets.find(
            (target) => target.type === parsed.entity_type && target.id === parsed.entity_id,
          )
        : null;

      const baseName = parsed.name.trim() || 'Diagrama importado';
      const nameTaken = diagrams.some(
        (diagram) => diagram.name.toLowerCase() === baseName.toLowerCase(),
      );
      const finalName = (nameTaken ? `${baseName} (importado)` : baseName).slice(0, 160);

      const created = await create.mutateAsync({
        name: finalName,
        description: parsed.description,
        nodes: parsed.nodes,
        edges: parsed.edges,
        settings: parsed.settings,
        entity_type: validLink?.type ?? null,
        entity_id: validLink?.id ?? null,
      });

      setActiveId(created.id);
      setDirty(false);
      toast.success(
        `Diagrama importado: ${parsed.nodes.length} nodo(s) y ${parsed.edges.length} conexión(es)`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo importar el diagrama.');
    }
  };

  const deleteDiagram = async () => {
    if (!activeId) return;
    const ok = await confirm({
      title: 'Eliminar diagrama',
      description: `¿Eliminar “${name}”? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    await remove.mutateAsync(activeId);
    resetToNew();
  };

  if (!projectId) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Workflow />}
          title="Seleccioná un proyecto"
          description="Los diagramas se guardan por proyecto. Usá el selector de la barra superior."
        />
      </div>
    );
  }

  const options = [
    { value: 'new', label: 'Nuevo diagrama' },
    ...diagrams.map((diagram) => ({
      value: String(diagram.id),
      label: `${diagram.name} · v${diagram.version}`,
    })),
  ];
  const linkOptions = [
    { value: 'none', label: 'Sin vínculo' },
    ...linkTargets.map((target) => ({
      value: `${target.type}:${target.id}`,
      label: target.label,
    })),
  ];
  const linkedLabel = linkTargets.find((target) => `${target.type}:${target.id}` === entity)?.label;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <header className="shrink-0 space-y-2 border-b border-border bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-caption font-bold uppercase tracking-wider text-fg-subtle">
            <Workflow className="size-3.5" />
            FlowQA Studio
          </span>
          <Badge tone={activeId ? 'ok' : 'neutral'}>
            {activeId ? `Diagrama #${activeId}` : 'Sin guardar'}
          </Badge>
          {activeDiagram ? (
            <Badge tone="neutral">
              v{activeDiagram.version} · {activeDiagram.updated_by_name || 'sin editor'} ·{' '}
              {formatDate(activeDiagram.updated_at)}
            </Badge>
          ) : (
            <Badge tone="neutral">Nuevo</Badge>
          )}
          {dirty ? <Badge tone="warn">Cambios sin guardar</Badge> : null}
          {entity !== 'none' ? (
            <Badge tone="brand" className="max-w-72 truncate" title={linkedLabel}>
              {linkedLabel || entity.replace(':', ' #')}
            </Badge>
          ) : null}

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => importInputRef.current?.click()}
            loading={create.isPending}
            title="Importar un JSON nativo exportado por FlowQA Studio"
          >
            <Upload />
            Importar
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept={FLOWQA_IMPORT_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importDiagram(file);
            }}
          />
          <Button variant="ghost" size="sm" onClick={newDiagram}>
            <FilePlus2 />
            Nuevo
          </Button>
          <Button variant="ghost" size="sm" onClick={duplicateDiagram} disabled={create.isPending}>
            <Copy />
            Duplicar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-fail"
            onClick={deleteDiagram}
            disabled={!activeId || remove.isPending}
          >
            <Trash2 />
            Eliminar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={saveDiagram}
            loading={create.isPending || update.isPending}
          >
            <Save />
            Guardar
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Field label="Diagrama" htmlFor="flowqa-diagram" className="w-64">
            <Combobox
              id="flowqa-diagram"
              value={activeId ? String(activeId) : 'new'}
              onValueChange={selectDiagram}
              options={options.length ? options : [{ value: 'new', label: 'Nuevo diagrama' }]}
              placeholder="Seleccioná un diagrama"
              searchPlaceholder="Buscar diagrama…"
              aria-label="Diagrama guardado"
            />
          </Field>
          <Field label="Nombre" htmlFor="flowqa-name" className="w-64">
            <Input
              id="flowqa-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setDirty(true);
              }}
              maxLength={160}
              placeholder="Ej: Login con token JWT"
            />
          </Field>
          <Field label="Descripción" htmlFor="flowqa-description" className="min-w-56 flex-1">
            <Input
              id="flowqa-description"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setDirty(true);
              }}
              maxLength={500}
              placeholder="Opcional: alcance, HU, épica o nota de la evidencia"
            />
          </Field>
          <Field label="Vincular a" htmlFor="flowqa-link" className="w-80">
            <Combobox
              id="flowqa-link"
              value={entity}
              onValueChange={(value) => {
                setEntity(value);
                setDirty(true);
              }}
              options={linkOptions}
              placeholder="Sin vínculo"
              searchPlaceholder="Buscar CU, HU, TC, suite, bug o sesión…"
              aria-label="Vincular diagrama a una entidad"
            />
          </Field>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {activeId && (isLoadingDiagram || !activeDiagram) ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <FlowQaEditor
            key={activeId ?? `new-${editorKey}`}
            initial={activeDiagram ?? null}
            onChange={onChange}
            onDirty={onDirty}
            diagramName={name}
            diagramDescription={description}
            entityType={entity === 'none' ? null : entity.split(':')[0]}
            entityId={entity === 'none' ? null : Number(entity.split(':')[1]) || null}
            onToast={(message, type) =>
              type === 'error'
                ? toast.error(message)
                : type === 'success'
                  ? toast.success(message)
                  : toast.info(message)
            }
          />
        )}
      </div>
    </div>
  );
}
