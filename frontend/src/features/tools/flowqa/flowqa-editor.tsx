import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  Copy,
  Download,
  Grid3X3,
  Image,
  Layers,
  MousePointer2,
  Redo2,
  RotateCcw,
  Sparkles,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import type { FlowDiagram } from '@/lib/api/flow-diagrams';
import { cn } from '@/lib/utils';
import {
  ACCENT_COLORS,
  DEFAULT_SETTINGS,
  EDGE_COLORS,
  GRID_SIZE,
  NODE_DEFAULTS,
  NODE_TYPES,
  QA_STATUSES,
  QUICK_LABELS,
  computeEdgeGeometry,
  demoFlowState,
  getClosestPort,
  getPortCoords,
  snapValue,
  uid,
  type FlowEdge,
  type FlowEdgeColor,
  type FlowEdgeStyle,
  type FlowNode,
  type FlowNodeType,
  type FlowPort,
  type FlowQaStatus,
  type FlowSettings,
  type FlowState,
} from './model';
import { downloadJson, exportPng, exportSvg, generateMermaid } from './export';

interface FlowQaEditorProps {
  initial?: FlowDiagram | null;
  onChange: (state: FlowState) => void;
  onDirty?: () => void;
  onToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface Selection {
  type: 'node' | 'edge';
  id: string;
}

interface Snapshot {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface DragState {
  mode: 'pan' | 'drag' | 'connect';
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPanX: number;
  startPanY: number;
  nodeId?: string;
  nodeStartX: number;
  nodeStartY: number;
  moved: boolean;
  snapshot?: Snapshot;
  sourcePort?: FlowPort;
  sourceId?: string;
}

interface ConnectPreview {
  sourceId: string;
  sourcePort: FlowPort;
  targetId: string | null;
  targetPort: FlowPort;
  point: { x: number; y: number };
}

const PORTS: FlowPort[] = ['top', 'right', 'bottom', 'left'];

function diagramNodes(diagram?: FlowDiagram | null): FlowNode[] {
  if (!diagram || !Array.isArray(diagram.nodes)) return [];
  return (diagram.nodes as Array<Record<string, unknown>>).map((raw) => {
    const type = (raw.type as FlowNodeType) in NODE_DEFAULTS ? (raw.type as FlowNodeType) : 'process';
    const def = NODE_DEFAULTS[type];
    return {
      id: String(raw.id ?? uid('n')),
      type,
      x: Number(raw.x ?? 0),
      y: Number(raw.y ?? 0),
      width: Number(raw.width ?? def.width),
      height: Number(raw.height ?? def.height),
      title: String(raw.title ?? def.title),
      note: String(raw.note ?? ''),
      color: String(raw.color ?? def.color),
      qaStatus: (raw.qaStatus as FlowQaStatus) in QA_STATUSES ? (raw.qaStatus as FlowQaStatus) : 'NONE',
    };
  });
}

function diagramEdges(diagram?: FlowDiagram | null): FlowEdge[] {
  if (!diagram || !Array.isArray(diagram.edges)) return [];
  const ports: FlowPort[] = ['top', 'right', 'bottom', 'left'];
  return (diagram.edges as Array<Record<string, unknown>>).map((raw) => ({
    id: String(raw.id ?? uid('e')),
    source: String(raw.source ?? ''),
    target: String(raw.target ?? ''),
    sourcePort: ports.includes(raw.sourcePort as FlowPort) ? (raw.sourcePort as FlowPort) : 'bottom',
    targetPort: ports.includes(raw.targetPort as FlowPort) ? (raw.targetPort as FlowPort) : 'top',
    label: String(raw.label ?? ''),
    style: raw.style === 'dashed' ? 'dashed' : 'solid',
    color: ['default', 'green', 'red', 'amber', 'blue'].includes(raw.color as string)
      ? (raw.color as FlowEdgeColor)
      : 'default',
  }));
}

function diagramSettings(diagram?: FlowDiagram | null): FlowSettings {
  const raw = (diagram?.settings ?? {}) as Partial<FlowSettings>;
  return {
    snapToGrid: raw.snapToGrid ?? DEFAULT_SETTINGS.snapToGrid,
    mermaidDir: raw.mermaidDir === 'LR' ? 'LR' : 'TD',
  };
}

export function FlowQaEditor({ initial, onChange, onDirty, onToast }: FlowQaEditorProps) {
  const [nodes, setNodes] = useState<FlowNode[]>(() => diagramNodes(initial));
  const [edges, setEdges] = useState<FlowEdge[]>(() => diagramEdges(initial));
  const [settings, setSettings] = useState<FlowSettings>(() => diagramSettings(initial));
  const [selected, setSelected] = useState<Selection | null>(null);
  const [pan, setPan] = useState({ x: 80, y: 40 });
  const [zoom, setZoom] = useState(1);
  const [connectPreview, setConnectPreview] = useState<ConnectPreview | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [showMermaid, setShowMermaid] = useState(false);
  const [mermaidCode, setMermaidCode] = useState('');

  const viewportRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const settingsRef = useRef(settings);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const interactionRef = useRef<DragState | null>(null);
  const historyRef = useRef<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] });
  const editingRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    settingsRef.current = settings;
    panRef.current = pan;
    zoomRef.current = zoom;
    onChange({ nodes, edges, settings });
  }, [nodes, edges, settings, pan, zoom, onChange]);

  const selectedNode =
    selected?.type === 'node' ? nodes.find((node) => node.id === selected.id) ?? null : null;
  const selectedEdge =
    selected?.type === 'edge' ? edges.find((edge) => edge.id === selected.id) ?? null : null;

  const stats = useMemo(() => {
    return {
      nodes: nodes.length,
      edges: edges.length,
      pass: nodes.filter((node) => node.qaStatus === 'PASS').length,
      fail: nodes.filter((node) => node.qaStatus === 'FAIL').length,
      blocked: nodes.filter((node) => node.qaStatus === 'BLOCKED').length,
      pending: nodes.filter((node) => node.qaStatus === 'PENDING').length,
    };
  }, [nodes, edges]);

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  void historyVersion;
  void canUndo;
  void canRedo;

  const toast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    onToast?.(message, type);
  };

  const snapshot = (): Snapshot => ({ nodes: nodesRef.current, edges: edgesRef.current });

  const pushPast = (state: Snapshot) => {
    const history = historyRef.current;
    history.past.push(state);
    if (history.past.length > 50) history.past.shift();
    history.future = [];
    setHistoryVersion((version) => version + 1);
  };

  const markChanged = () => {
    pushPast(snapshot());
    onDirty?.();
  };

  const beginEdit = () => {
    if (editingRef.current) return;
    editingRef.current = true;
    pushPast(snapshot());
    onDirty?.();
  };

  const endEdit = () => {
    editingRef.current = false;
  };

  const undo = () => {
    const history = historyRef.current;
    const previous = history.past.pop();
    if (!previous) return;
    history.future.unshift(snapshot());
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setSelected(null);
    setHistoryVersion((version) => version + 1);
    onDirty?.();
  };

  const redo = () => {
    const history = historyRef.current;
    const next = history.future.shift();
    if (!next) return;
    history.past.push(snapshot());
    setNodes(next.nodes);
    setEdges(next.edges);
    setSelected(null);
    setHistoryVersion((version) => version + 1);
    onDirty?.();
  };

  const updateNode = (id: string, patch: Partial<FlowNode>) => {
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, ...patch } : node)));
  };

  const updateEdge = (id: string, patch: Partial<FlowEdge>) => {
    setEdges((current) => current.map((edge) => (edge.id === id ? { ...edge, ...patch } : edge)));
  };

  const addNode = (type: FlowNodeType, worldX?: number, worldY?: number) => {
    markChanged();
    const def = NODE_DEFAULTS[type];
    let x: number;
    let y: number;
    if (worldX !== undefined && worldY !== undefined) {
      x = snapValue(worldX - def.width / 2, settingsRef.current.snapToGrid);
      y = snapValue(worldY - def.height / 2, settingsRef.current.snapToGrid);
    } else {
      const rect = viewportRef.current?.getBoundingClientRect();
      const center = rect
        ? {
            x: (rect.width / 2 - panRef.current.x) / zoomRef.current,
            y: (rect.height / 2 - panRef.current.y) / zoomRef.current,
          }
        : { x: 300, y: 220 };
      const jitter = (nodesRef.current.length % 5) * 16;
      x = snapValue(center.x - def.width / 2 + jitter, settingsRef.current.snapToGrid);
      y = snapValue(center.y - def.height / 2 + jitter, settingsRef.current.snapToGrid);
    }
    const node: FlowNode = {
      id: uid('n'),
      type,
      x,
      y,
      width: def.width,
      height: def.height,
      title: def.title,
      note: def.note,
      color: def.color,
      qaStatus: def.qaStatus ?? 'NONE',
    };
    setNodes((current) => [...current, node]);
    setSelected({ type: 'node', id: node.id });
  };

  const deleteSelected = () => {
    if (!selected) return;
    markChanged();
    if (selected.type === 'node') {
      setNodes((current) => current.filter((node) => node.id !== selected.id));
      setEdges((current) =>
        current.filter((edge) => edge.source !== selected.id && edge.target !== selected.id),
      );
    } else {
      setEdges((current) => current.filter((edge) => edge.id !== selected.id));
    }
    setSelected(null);
  };

  const duplicateSelected = () => {
    if (!selectedNode) return;
    markChanged();
    const copy: FlowNode = {
      ...selectedNode,
      id: uid('n'),
      x: snapValue(selectedNode.x + 40, settingsRef.current.snapToGrid),
      y: snapValue(selectedNode.y + 40, settingsRef.current.snapToGrid),
      title: `${selectedNode.title} (copia)`,
    };
    setNodes((current) => [...current, copy]);
    setSelected({ type: 'node', id: copy.id });
  };

  const loadDemo = () => {
    markChanged();
    const demo = demoFlowState();
    setNodes(demo.nodes);
    setEdges(demo.edges);
    setSettings((current) => ({ ...demo.settings, snapToGrid: current.snapToGrid }));
    setSelected(null);
    setHistoryVersion((version) => version + 1);
    fitNodes(demo.nodes);
    toast('Plantilla de ejemplo QA cargada', 'success');
  };

  const clearCanvas = () => {
    markChanged();
    setNodes([]);
    setEdges([]);
    setSelected(null);
    toast('Lienzo limpio');
  };

  const updateCamera = (nextPan: { x: number; y: number }, nextZoom: number) => {
    panRef.current = nextPan;
    zoomRef.current = nextZoom;
    setPan(nextPan);
    setZoom(nextZoom);
  };

  const fitNodes = (list: FlowNode[]) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (list.length === 0) {
      updateCamera({ x: 60, y: 40 }, 1);
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of list) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
    const pad = 60;
    const contentW = Math.max(100, maxX - minX);
    const contentH = Math.max(100, maxY - minY);
    const nextZoom = Math.min(
      Math.max(Math.min((rect.width - pad * 2) / contentW, (rect.height - pad * 2) / contentH, 1.15), 0.35),
      1.5,
    );
    updateCamera(
      {
        x: (rect.width - contentW * nextZoom) / 2 - minX * nextZoom,
        y: (rect.height - contentH * nextZoom) / 2 - minY * nextZoom,
      },
      nextZoom,
    );
  };

  const fitToView = () => fitNodes(nodesRef.current);

  useEffect(() => {
    const list = diagramNodes(initial);
    if (list.length === 0) return;
    const frame = requestAnimationFrame(() => fitNodes(list));
    return () => cancelAnimationFrame(frame);
    // Solo al montar el diagrama cargado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomBy = (factor: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const nextZoom = Math.min(2.5, Math.max(0.25, zoomRef.current * factor));
    const ratio = nextZoom / zoomRef.current;
    updateCamera(
      {
        x: cx - (cx - panRef.current.x) * ratio,
        y: cy - (cy - panRef.current.y) * ratio,
      },
      nextZoom,
    );
  };

  const clientToWorld = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (clientY - rect.top - panRef.current.y) / zoomRef.current,
    };
  };

  const onViewportPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-node-id]') || target.closest('[data-edge-hit]') || target.closest('[data-canvas-ui]')) {
      return;
    }
    setSelected(null);
    interactionRef.current = {
      mode: 'pan',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: panRef.current.x,
      startPanY: panRef.current.y,
      nodeStartX: 0,
      nodeStartY: 0,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onNodePointerDown = (event: React.PointerEvent, node: FlowNode) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.stopPropagation();
    const port = (event.target as HTMLElement).dataset.port as FlowPort | undefined;
    setSelected({ type: 'node', id: node.id });
    if (port) {
      interactionRef.current = {
        mode: 'connect',
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: 0,
        startPanY: 0,
        nodeStartX: 0,
        nodeStartY: 0,
        moved: false,
        snapshot: snapshot(),
        sourceId: node.id,
        sourcePort: port,
      };
      const point = clientToWorld(event.clientX, event.clientY);
      setConnectPreview({ sourceId: node.id, sourcePort: port, targetId: null, targetPort: 'top', point });
    } else {
      interactionRef.current = {
        mode: 'drag',
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: 0,
        startPanY: 0,
        nodeId: node.id,
        nodeStartX: node.x,
        nodeStartY: node.y,
        moved: false,
        snapshot: snapshot(),
      };
    }
    viewportRef.current?.setPointerCapture(event.pointerId);
  };

  const onViewportPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction) return;

    if (interaction.mode === 'pan') {
      updateCamera(
        {
          x: interaction.startPanX + (event.clientX - interaction.startClientX),
          y: interaction.startPanY + (event.clientY - interaction.startClientY),
        },
        zoomRef.current,
      );
      return;
    }

    if (interaction.mode === 'drag' && interaction.nodeId) {
      const dx = (event.clientX - interaction.startClientX) / zoomRef.current;
      const dy = (event.clientY - interaction.startClientY) / zoomRef.current;
      const nextX = snapValue(interaction.nodeStartX + dx, settingsRef.current.snapToGrid);
      const nextY = snapValue(interaction.nodeStartY + dy, settingsRef.current.snapToGrid);
      interaction.moved = interaction.moved || nextX !== interaction.nodeStartX || nextY !== interaction.nodeStartY;
      setNodes((current) =>
        current.map((node) =>
          node.id === interaction.nodeId ? { ...node, x: nextX, y: nextY } : node,
        ),
      );
      return;
    }

    if (interaction.mode === 'connect' && interaction.sourceId && interaction.sourcePort) {
      const point = clientToWorld(event.clientX, event.clientY);
      let target: FlowNode | null = null;
      for (let index = nodesRef.current.length - 1; index >= 0; index -= 1) {
        const node = nodesRef.current[index];
        if (node.id === interaction.sourceId) continue;
        if (
          point.x >= node.x - 10 &&
          point.x <= node.x + node.width + 10 &&
          point.y >= node.y - 10 &&
          point.y <= node.y + node.height + 10
        ) {
          target = node;
          break;
        }
      }
      setConnectPreview({
        sourceId: interaction.sourceId,
        sourcePort: interaction.sourcePort,
        targetId: target?.id ?? null,
        targetPort: target ? getClosestPort(target, point.x, point.y) : 'top',
        point,
      });
    }
  };

  const onViewportPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    if (interaction.pointerId !== event.pointerId) return;

    if (interaction.mode === 'drag' && interaction.moved && interaction.snapshot) {
      pushPast(interaction.snapshot);
      onDirty?.();
    }

    if (interaction.mode === 'connect' && interaction.sourceId && interaction.sourcePort && connectPreview) {
      const target = connectPreview.targetId
        ? nodesRef.current.find((node) => node.id === connectPreview.targetId)
        : null;
      if (target && target.id !== interaction.sourceId) {
        const targetPort = connectPreview.targetPort;
        const exists = edgesRef.current.some(
          (edge) =>
            edge.source === interaction.sourceId &&
            edge.target === target.id &&
            edge.sourcePort === interaction.sourcePort &&
            edge.targetPort === targetPort,
        );
        if (!exists) {
          if (interaction.snapshot) pushPast(interaction.snapshot);
          const edge: FlowEdge = {
            id: uid('e'),
            source: interaction.sourceId,
            sourcePort: interaction.sourcePort,
            target: target.id,
            targetPort,
            label: '',
            style: 'solid',
            color: 'default',
          };
          setEdges((current) => [...current, edge]);
          setSelected({ type: 'edge', id: edge.id });
          onDirty?.();
        }
      }
    }

    if (interaction.mode === 'pan') {
      // sin cambios persistentes
    }
    interactionRef.current = null;
    setConnectPreview(null);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const tag = (target?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (typing) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelected();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if (event.key === 'Escape') {
        setSelected(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const nextZoom = Math.min(
        2.5,
        Math.max(0.25, zoomRef.current * (event.deltaY < 0 ? 1.1 : 0.9)),
      );
      const ratio = nextZoom / zoomRef.current;
      updateCamera(
        {
          x: mouseX - (mouseX - panRef.current.x) * ratio,
          y: mouseY - (mouseY - panRef.current.y) * ratio,
        },
        nextZoom,
      );
    };
    element.addEventListener('wheel', handler, { passive: false });
    return () => element.removeEventListener('wheel', handler);
  }, []);

  const openMermaid = () => {
    setMermaidCode(generateMermaid({ nodes, edges, settings }));
    setShowMermaid(true);
  };

  const copyMermaid = async () => {
    try {
      await navigator.clipboard.writeText(mermaidCode);
      toast('Código Mermaid copiado', 'success');
    } catch {
      toast('No se pudo copiar el código', 'error');
    }
  };

  const isDark =
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={undo} disabled={!canUndo} aria-label="Deshacer" title="Deshacer (Ctrl+Z)">
            <Undo2 />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={redo} disabled={!canRedo} aria-label="Rehacer" title="Rehacer (Ctrl+Y)">
            <Redo2 />
          </Button>
        </div>

        <Button
          variant={settings.snapToGrid ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => {
            const next = { ...settings, snapToGrid: !settings.snapToGrid };
            setSettings(next);
            onDirty?.();
          }}
        >
          <Grid3X3 />
          Cuadrícula: {settings.snapToGrid ? 'ON' : 'OFF'}
        </Button>

        <Button variant="ghost" size="sm" onClick={loadDemo}>
          <Sparkles />
          Ejemplo QA
        </Button>
        <Button variant="ghost" size="sm" onClick={clearCanvas}>
          <Trash2 />
          Limpiar
        </Button>

        <div className="flex-1" />

        <Button variant="ghost" size="sm" onClick={() => downloadJson({ nodes, edges, settings })}>
          <Download />
          JSON
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { if (!exportSvg({ nodes, edges, settings }, isDark)) toast('El lienzo está vacío', 'error'); }}>
          SVG
        </Button>
        <Button variant="secondary" size="sm" onClick={async () => { try { const ok = await exportPng({ nodes, edges, settings }, isDark); if (!ok) toast('El lienzo está vacío', 'error'); else toast('PNG descargado', 'success'); } catch { toast('No se pudo exportar el PNG', 'error'); } }}>
          <Image />
          PNG
        </Button>
        <Button variant="secondary" size="sm" onClick={openMermaid}>
          <Layers />
          Mermaid
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)_18rem]">
        <aside className="scrollbar-apple min-h-0 overflow-y-auto border-r border-border bg-surface p-3">
          <p className="text-caption font-bold uppercase tracking-wider text-fg-subtle">
            Elementos de flujo
          </p>
          <p className="mt-0.5 text-caption text-fg-subtle">Clic para agregar al lienzo</p>
          <ul className="mt-3 space-y-2">
            {NODE_TYPES.map((item) => (
              <li key={item.type}>
                <button
                  type="button"
                  onClick={() => addNode(item.type)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-left transition-colors hover:border-brand hover:bg-brand-soft"
                >
                  <NodeGlyph type={item.type} />
                  <span className="min-w-0">
                    <span className="block truncate text-footnote font-semibold text-fg">{item.label}</span>
                    <span className="block truncate text-caption text-fg-subtle">{item.hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 rounded-lg border border-border bg-surface-2 p-2.5 text-caption text-fg-subtle">
            <p className="flex items-center gap-1.5 font-semibold text-fg-muted">
              <MousePointer2 className="size-3.5" />
              Atajos
            </p>
            <p className="mt-1.5">Arrastrá desde los puntos para conectar.</p>
            <p>Doble clic en una flecha para seleccionarla.</p>
            <p>Supr elimina; Ctrl+Z deshace.</p>
          </div>

          <div className="mt-4 space-y-1.5 rounded-lg border border-border bg-surface-2 p-2.5">
            <p className="text-caption font-bold uppercase tracking-wide text-fg-subtle">Métricas QA</p>
            <div className="grid grid-cols-2 gap-1.5">
              <Metric label="Nodos" value={stats.nodes} />
              <Metric label="Conexiones" value={stats.edges} />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Metric label="PASS" value={stats.pass} tone="ok" />
              <Metric label="FAIL" value={stats.fail} tone="fail" />
              <Metric label="BLOCKED" value={stats.blocked} tone="warn" />
              <Metric label="PENDING" value={stats.pending} tone="brand" />
            </div>
          </div>
        </aside>

        <div
          ref={viewportRef}
          className="relative min-h-0 overflow-hidden bg-bg"
          style={{
            backgroundImage:
              'radial-gradient(circle, var(--apple-label-quaternary) 1.25px, transparent 1.25px)',
            backgroundSize: `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
            touchAction: 'none',
            cursor: interactionRef.current?.mode === 'pan' ? 'grabbing' : 'grab',
          }}
          onPointerDown={onViewportPointerDown}
          onPointerMove={onViewportPointerMove}
          onPointerUp={onViewportPointerUp}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, width: 1, height: 1 }}
          >
            <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
              <defs>
                {Object.entries(EDGE_COLORS).map(([key, color]) => (
                  <marker key={key} id={`fa-arrow-${key}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 1.2 L 9 5 L 0 8.8 z" fill={color.hex} />
                  </marker>
                ))}
                <marker id="fa-arrow-selected" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
                  <path d="M 0 1.2 L 9 5 L 0 8.8 z" fill="var(--apple-blue)" />
                </marker>
              </defs>

              {edges.map((edge) => {
                const source = nodes.find((node) => node.id === edge.source);
                const target = nodes.find((node) => node.id === edge.target);
                if (!source || !target) return null;
                const p1 = getPortCoords(source, edge.sourcePort);
                const p2 = getPortCoords(target, edge.targetPort);
                const { d, midX, midY } = computeEdgeGeometry(p1, edge.sourcePort, p2, edge.targetPort);
                const isSelected = selected?.type === 'edge' && selected.id === edge.id;
                const color = EDGE_COLORS[edge.color].hex;
                return (
                  <g key={edge.id}>
                    <path
                      data-edge-hit={edge.id}
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={24}
                      style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setSelected({ type: 'edge', id: edge.id });
                      }}
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke={isSelected ? 'var(--apple-blue)' : color}
                      strokeWidth={isSelected ? 3.2 : 2.2}
                      strokeDasharray={edge.style === 'dashed' ? '6,5' : undefined}
                      markerEnd={`url(#fa-arrow-${isSelected ? 'selected' : edge.color})`}
                      style={{ pointerEvents: 'none' }}
                    />
                    <g
                      transform={`translate(${midX}, ${midY})`}
                      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setSelected({ type: 'edge', id: edge.id });
                      }}
                    >
                      <rect
                        x={-Math.max(24, edge.label.length * 3.4 + 10)}
                        y={-11}
                        width={Math.max(48, edge.label.length * 6.8 + 20)}
                        height={22}
                        rx={7}
                        fill="var(--apple-bg-elevated)"
                        stroke={isSelected ? 'var(--apple-blue)' : color}
                        strokeWidth={1.2}
                      />
                      <text
                        textAnchor="middle"
                        y={4}
                        fontSize={11}
                        fontWeight={600}
                        fill={isSelected ? 'var(--apple-blue)' : color}
                      >
                        {edge.label || '+ Texto'}
                      </text>
                    </g>
                  </g>
                );
              })}

              {connectPreview
                ? (() => {
                    const source = nodes.find((node) => node.id === connectPreview.sourceId);
                    if (!source) return null;
                    const p1 = getPortCoords(source, connectPreview.sourcePort);
                    const target = connectPreview.targetId
                      ? nodes.find((node) => node.id === connectPreview.targetId)
                      : null;
                    const p2 = target ? getPortCoords(target, connectPreview.targetPort) : connectPreview.point;
                    const { d } = computeEdgeGeometry(p1, connectPreview.sourcePort, p2, connectPreview.targetPort);
                    return (
                      <path
                        d={d}
                        fill="none"
                        stroke="var(--apple-blue)"
                        strokeWidth={2.5}
                        strokeDasharray="6,4"
                        markerEnd="url(#fa-arrow-selected)"
                      />
                    );
                  })()
                : null}
            </svg>

            {nodes.map((node) => (
              <div
                key={node.id}
                data-node-id={node.id}
                className={cn(
                  'absolute cursor-move select-none',
                  selected?.type === 'node' && selected.id === node.id && 'z-20',
                  connectPreview?.targetId === node.id && 'z-30',
                )}
                style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
                onPointerDown={(event) => onNodePointerDown(event, node)}
              >
                <NodeView node={node} selected={selected?.type === 'node' && selected.id === node.id} connectTarget={connectPreview?.targetId === node.id} />
                {PORTS.map((port) => (
                  <span
                    key={port}
                    data-port={port}
                    title="Arrastrá para conectar"
                    className={cn(
                      'absolute size-3 rounded-full border-2 border-brand bg-surface opacity-60 transition-transform hover:scale-125 hover:opacity-100',
                      port === 'top' && '-top-1.5 left-1/2 -ml-1.5',
                      port === 'bottom' && '-bottom-1.5 left-1/2 -ml-1.5',
                      port === 'left' && '-left-1.5 top-1/2 -mt-1.5',
                      port === 'right' && '-right-1.5 top-1/2 -mt-1.5',
                    )}
                  />
                ))}
              </div>
            ))}
          </div>

          <div data-canvas-ui className="absolute bottom-3 left-3 flex items-center gap-1 rounded-xl border border-border bg-surface p-1 shadow-apple-md">
            <Button variant="ghost" size="icon-sm" onClick={() => zoomBy(0.85)} aria-label="Alejar">
              <ZoomOut />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => updateCamera({ x: pan.x, y: pan.y }, 1)}>
              {Math.round(zoom * 100)}%
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => zoomBy(1.15)} aria-label="Acercar">
              <ZoomIn />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={fitToView} aria-label="Ajustar a pantalla">
              <RotateCcw />
            </Button>
          </div>

          <div data-canvas-ui className="absolute right-3 top-3 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-caption text-fg-subtle shadow-apple-sm">
            {stats.nodes} nodos · {stats.edges} conexiones
          </div>
        </div>

        <aside className="scrollbar-apple min-h-0 overflow-y-auto border-l border-border bg-surface p-3">
          {selectedNode ? (
            <NodeProperties
              key={selectedNode.id}
              node={selectedNode}
              onUpdate={(patch) => updateNode(selectedNode.id, patch)}
              onBeginEdit={beginEdit}
              onEndEdit={endEdit}
              onDelete={deleteSelected}
              onDuplicate={duplicateSelected}
              titleRef={titleInputRef}
            />
          ) : selectedEdge ? (
            <EdgeProperties
              key={selectedEdge.id}
              edge={selectedEdge}
              onUpdate={(patch) => updateEdge(selectedEdge.id, patch)}
              onBeginEdit={beginEdit}
              onEndEdit={endEdit}
              onDelete={deleteSelected}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-caption font-bold uppercase tracking-wider text-fg-subtle">
                Resumen del flujo
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Nodos" value={stats.nodes} />
                <Metric label="Conexiones" value={stats.edges} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="PASS" value={stats.pass} tone="ok" />
                <Metric label="FAIL" value={stats.fail} tone="fail" />
                <Metric label="BLOCKED" value={stats.blocked} tone="warn" />
                <Metric label="PENDING" value={stats.pending} tone="brand" />
              </div>
              <p className="rounded-lg border border-border bg-surface-2 p-2.5 text-caption text-fg-subtle">
                Seleccioná un nodo o una conexión para editar su texto, color, nota o estado QA.
              </p>
            </div>
          )}
        </aside>
      </div>

      {showMermaid ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={() => setShowMermaid(false)}>
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-apple-lg" role="dialog" aria-label="Exportar a Mermaid" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-footnote font-semibold text-fg">Exportar a Mermaid.js</p>
                <p className="text-caption text-fg-subtle">Listo para GitHub, GitLab, Notion o Confluence</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowMermaid(false)}>
                Cerrar
              </Button>
            </div>
            <div className="flex items-center gap-2 px-4 pt-3">
              <Button variant={settings.mermaidDir === 'TD' ? 'primary' : 'secondary'} size="sm" onClick={() => { const next = { ...settings, mermaidDir: 'TD' as const }; setSettings(next); onDirty?.(); setMermaidCode(generateMermaid({ nodes, edges, settings: next })); }}>
                Vertical (TD)
              </Button>
              <Button variant={settings.mermaidDir === 'LR' ? 'primary' : 'secondary'} size="sm" onClick={() => { const next = { ...settings, mermaidDir: 'LR' as const }; setSettings(next); onDirty?.(); setMermaidCode(generateMermaid({ nodes, edges, settings: next })); }}>
                Horizontal (LR)
              </Button>
              <div className="flex-1" />
              <Button variant="secondary" size="sm" onClick={copyMermaid}>
                <Copy />
                Copiar
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <pre className="whitespace-pre-wrap rounded-xl bg-surface-2 p-4 font-mono text-caption text-fg-muted">{mermaidCode}</pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NodeGlyph({ type }: { type: FlowNodeType }) {
  const color = NODE_DEFAULTS[type].color;
  if (type === 'start_end') {
    return <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: color }}><span className="size-2 rounded-full" style={{ background: color }} /></span>;
  }
  if (type === 'decision') {
    return <span className="flex h-7 w-9 shrink-0 items-center justify-center"><span className="size-4 rotate-45 rounded-sm border-2" style={{ borderColor: color }} /></span>;
  }
  if (type === 'data') {
    return <span className="flex h-7 w-9 shrink-0 -skew-x-12 items-center justify-center rounded-sm border-2" style={{ borderColor: color }} />;
  }
  if (type === 'note') {
    return <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded-sm border border-dashed" style={{ borderColor: color }} />;
  }
  if (type === 'qa') {
    return <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded-md border-2 text-[9px] font-bold" style={{ borderColor: color, color }}>QA</span>;
  }
  return <span className="h-7 w-9 shrink-0 rounded-md border-2" style={{ borderColor: color }} />;
}

function NodeView({ node, selected, connectTarget }: { node: FlowNode; selected: boolean; connectTarget: boolean }) {
  const qa = QA_STATUSES[node.qaStatus];
  const ring = selected
    ? 'ring-2 ring-brand ring-offset-2 ring-offset-bg'
    : connectTarget
      ? 'ring-2 ring-ok ring-offset-2 ring-offset-bg'
      : '';

  if (node.type === 'start_end') {
    return (
      <div className={cn('flex h-full w-full items-center justify-center gap-2 rounded-full border-2 bg-surface px-3 shadow-apple-sm', ring)} style={{ borderColor: node.color }}>
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: node.color }} />
        <span className="truncate text-footnote font-bold text-fg">{node.title || 'Sin título'}</span>
        {node.qaStatus !== 'NONE' ? <Badge tone="neutral" className={cn('shrink-0', qa.className)}>{qa.label}</Badge> : null}
      </div>
    );
  }

  if (node.type === 'decision') {
    return (
      <div className={cn('relative flex h-full w-full items-center justify-center rounded-lg', ring)}>
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${node.width} ${node.height}`}>
          <polygon points={`${node.width / 2},2 ${node.width - 2},${node.height / 2} ${node.width / 2},${node.height - 2} 2,${node.height / 2}`} fill="var(--apple-bg-elevated)" stroke={node.color} strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
        <div className="relative z-10 flex max-w-full flex-col items-center px-6 py-2 text-center">
          {node.qaStatus !== 'NONE' ? <Badge tone="neutral" className={cn('mb-1', qa.className)}>{qa.label}</Badge> : null}
          <span className="break-words text-caption font-bold leading-tight text-fg">{node.title || 'Sin título'}</span>
          {node.note ? <span className="mt-0.5 line-clamp-1 text-[10px] text-fg-subtle">{node.note}</span> : null}
        </div>
      </div>
    );
  }

  if (node.type === 'data') {
    return (
      <div className={cn('relative flex h-full w-full items-center rounded-lg', ring)}>
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${node.width} ${node.height}`}>
          <polygon points={`16,2 ${node.width - 2},2 ${node.width - 16},${node.height - 2} 2,${node.height - 2}`} fill="var(--apple-bg-elevated)" stroke={node.color} strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
        <div className="relative z-10 flex w-full min-w-0 items-center gap-2 px-4">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${node.color}22`, color: node.color }}>
            <Layers className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-caption font-bold text-fg">{node.title || 'Sin título'}</span>
              {node.qaStatus !== 'NONE' ? <Badge tone="neutral" className={cn('shrink-0', qa.className)}>{qa.label}</Badge> : null}
            </div>
            {node.note ? <p className="line-clamp-2 text-[10px] text-fg-subtle">{node.note}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  if (node.type === 'qa') {
    return (
      <div className={cn('flex h-full w-full flex-col justify-between overflow-hidden rounded-xl border border-border bg-surface shadow-apple-sm', ring)} style={{ borderTop: `4px solid ${node.color}` }}>
        <div className="flex items-center justify-between gap-2 px-3 pt-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">Evidencia QA</span>
          <Badge tone="neutral" className={cn(qa.className)}>{qa.label}</Badge>
        </div>
        <div className="min-w-0 px-3 pb-2">
          <p className="truncate text-caption font-bold text-fg">{node.title || 'Sin título'}</p>
          {node.note ? <p className="line-clamp-2 text-[10px] text-fg-subtle">{node.note}</p> : null}
        </div>
      </div>
    );
  }

  if (node.type === 'note') {
    return (
      <div className={cn('flex h-full w-full flex-col justify-center rounded-xl border border-dashed px-3 py-2 shadow-apple-sm', ring)} style={{ background: `${node.color}18`, borderColor: `${node.color}88` }}>
        <div className="flex items-center justify-between gap-1.5">
          <span className="truncate text-caption font-semibold text-fg">{node.title || 'Sin título'}</span>
          {node.qaStatus !== 'NONE' ? <Badge tone="neutral" className={cn(qa.className)}>{qa.label}</Badge> : null}
        </div>
        {node.note ? <p className="line-clamp-2 text-[10px] text-fg-subtle">{node.note}</p> : null}
      </div>
    );
  }

  return (
    <div className={cn('flex h-full w-full items-center overflow-hidden rounded-xl border border-border bg-surface shadow-apple-sm', ring)} style={{ borderLeft: `5px solid ${node.color}` }}>
      <div className="w-full min-w-0 px-3 py-2">
        <div className="flex items-center justify-between gap-1.5">
          <span className="truncate text-caption font-bold text-fg">{node.title || 'Sin título'}</span>
          {node.qaStatus !== 'NONE' ? <Badge tone="neutral" className={cn(qa.className)}>{qa.label}</Badge> : null}
        </div>
        {node.note ? <p className="line-clamp-2 text-[10px] text-fg-subtle">{node.note}</p> : null}
      </div>
    </div>
  );
}

function NodeProperties({
  node,
  onUpdate,
  onBeginEdit,
  onEndEdit,
  onDelete,
  onDuplicate,
  titleRef,
}: {
  node: FlowNode;
  onUpdate: (patch: Partial<FlowNode>) => void;
  onBeginEdit: () => void;
  onEndEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  titleRef: RefObject<HTMLInputElement | null>;
}) {
  const apply = (patch: Partial<FlowNode>) => {
    onBeginEdit();
    onUpdate(patch);
    onEndEdit();
  };
  return (
    <div className="space-y-3">
      <p className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Propiedades del nodo</p>
      <Field label="Tipo de nodo" htmlFor="flow-node-type">
        <SelectField
          id="flow-node-type"
          value={node.type}
          onValueChange={(value) => {
            const type = value as FlowNodeType;
            const def = NODE_DEFAULTS[type];
            apply({ type, width: def.width, height: def.height, color: def.color });
          }}
          options={NODE_TYPES.map((item) => ({ value: item.type, label: item.label }))}
        />
      </Field>
      <Field label="Título" htmlFor="flow-node-title">
        <Input
          ref={titleRef}
          id="flow-node-title"
          value={node.title}
          onFocus={onBeginEdit}
          onBlur={onEndEdit}
          onChange={(event) => onUpdate({ title: event.target.value })}
        />
      </Field>
      <Field label="Nota / detalle" htmlFor="flow-node-note">
        <Textarea
          id="flow-node-note"
          className="min-h-16"
          value={node.note}
          onFocus={onBeginEdit}
          onBlur={onEndEdit}
          onChange={(event) => onUpdate({ note: event.target.value })}
        />
      </Field>
      <div>
        <p className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Estado de validación QA</p>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(QA_STATUSES) as FlowQaStatus[]).map((status) => (
            <Button
              key={status}
              type="button"
              variant={node.qaStatus === status ? 'secondary' : 'ghost'}
              size="sm"
              className={cn('h-7 text-[11px]', node.qaStatus === status && QA_STATUSES[status].className)}
              onClick={() => apply({ qaStatus: status })}
            >
              {status === 'NONE' ? 'Ninguno' : status}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Color de acento</p>
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              title={color.label}
              aria-label={`Color ${color.label}`}
              onClick={() => apply({ color: color.hex })}
              className={cn('size-7 rounded-full border-2 border-transparent transition-transform hover:scale-110', node.color === color.hex && 'border-fg ring-2 ring-brand ring-offset-2 ring-offset-surface')}
              style={{ background: color.hex }}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2 border-t border-border pt-3">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onDuplicate}>
          <Copy />
          Duplicar
        </Button>
        <Button variant="ghost" size="sm" className="flex-1 text-fail" onClick={onDelete}>
          <Trash2 />
          Eliminar
        </Button>
      </div>
    </div>
  );
}

function EdgeProperties({
  edge,
  onUpdate,
  onBeginEdit,
  onEndEdit,
  onDelete,
}: {
  edge: FlowEdge;
  onUpdate: (patch: Partial<FlowEdge>) => void;
  onBeginEdit: () => void;
  onEndEdit: () => void;
  onDelete: () => void;
}) {
  const apply = (patch: Partial<FlowEdge>) => {
    onBeginEdit();
    onUpdate(patch);
    onEndEdit();
  };
  return (
    <div className="space-y-3">
      <p className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Propiedades de conexión</p>
      <Field label="Etiqueta / transición" htmlFor="flow-edge-label">
        <Input
          id="flow-edge-label"
          value={edge.label}
          onFocus={onBeginEdit}
          onBlur={onEndEdit}
          onChange={(event) => onUpdate({ label: event.target.value })}
          placeholder="Sí, No, 200 OK, Error…"
        />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_LABELS.map((label) => (
          <Button key={label} variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => apply({ label })}>
            {label}
          </Button>
        ))}
      </div>
      <Field label="Estilo de línea" htmlFor="flow-edge-style">
        <SelectField
          id="flow-edge-style"
          value={edge.style}
          onValueChange={(value) => apply({ style: value as FlowEdgeStyle })}
          options={[
            { value: 'solid', label: 'Sólida' },
            { value: 'dashed', label: 'Punteada' },
          ]}
        />
      </Field>
      <div>
        <p className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Color de flecha</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(EDGE_COLORS) as FlowEdgeColor[]).map((color) => (
            <Button
              key={color}
              variant={edge.color === color ? 'secondary' : 'ghost'}
              size="sm"
              className="justify-start"
              onClick={() => apply({ color })}
            >
              <span className="size-3 rounded-full" style={{ background: EDGE_COLORS[color].hex }} />
              {EDGE_COLORS[color].label}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 border-t border-border pt-3">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() =>
            apply({
              source: edge.target,
              target: edge.source,
              sourcePort: edge.targetPort,
              targetPort: edge.sourcePort,
            })
          }
        >
          Invertir ⇄
        </Button>
        <Button variant="ghost" size="sm" className="flex-1 text-fail" onClick={onDelete}>
          <Trash2 />
          Eliminar
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'fail' | 'warn' | 'brand' }) {
  const toneClass =
    tone === 'ok' ? 'text-ok' : tone === 'fail' ? 'text-fail' : tone === 'warn' ? 'text-warn' : tone === 'brand' ? 'text-brand' : 'text-fg';
  return (
    <div className="rounded-lg border border-border bg-surface px-2 py-1.5 text-center">
      <p className={cn('text-footnote font-bold tabular-nums', toneClass)}>{value}</p>
      <p className="text-[10px] text-fg-subtle">{label}</p>
    </div>
  );
}
