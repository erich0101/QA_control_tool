import {
  DEFAULT_SETTINGS,
  NODE_DEFAULTS,
  type FlowEdge,
  type FlowEdgeColor,
  type FlowEdgeStyle,
  type FlowNode,
  type FlowNodeType,
  type FlowPort,
  type FlowQaStatus,
  type FlowSettings,
} from './model';

/** Formatos que acepta el input de importación. */
export const FLOWQA_IMPORT_ACCEPT = '.json,application/json';

/** Límite alineado con el backend (normalizeDiagramPayload). */
export const FLOWQA_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

const NODE_TYPES: FlowNodeType[] = ['start_end', 'process', 'decision', 'qa', 'data', 'note'];
const NODE_TYPE_SET = new Set<string>(NODE_TYPES);
const EDGE_COLORS: FlowEdgeColor[] = ['default', 'green', 'red', 'amber', 'blue'];
const EDGE_COLOR_SET = new Set<string>(EDGE_COLORS);
const EDGE_STYLES: FlowEdgeStyle[] = ['solid', 'dashed'];
const EDGE_STYLE_SET = new Set<string>(EDGE_STYLES);
const PORTS: FlowPort[] = ['top', 'right', 'bottom', 'left'];
const PORT_SET = new Set<string>(PORTS);
const QA_STATUSES: FlowQaStatus[] = ['NONE', 'PASS', 'FAIL', 'BLOCKED', 'PENDING'];
const QA_STATUS_SET = new Set<string>(QA_STATUSES);

export interface ParsedFlowQaJson {
  name: string;
  description: string | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  settings: FlowSettings;
  entity_type?: string | null;
  entity_id?: number | null;
}

function text(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeNode(raw: unknown, index: number): FlowNode {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`El nodo #${index + 1} no es un objeto válido.`);
  }
  const source = raw as Record<string, unknown>;
  const id = text(source.id).trim();
  if (!id) throw new Error(`El nodo #${index + 1} no tiene "id".`);

  const type = text(source.type).trim();
  if (!NODE_TYPE_SET.has(type)) {
    throw new Error(
      `El nodo "${id}" tiene un tipo inválido ("${type}"). Usá: ${NODE_TYPES.join(', ')}.`,
    );
  }
  const nodeType = type as FlowNodeType;
  const defaults = NODE_DEFAULTS[nodeType];

  const qaStatus = text(source.qaStatus).toUpperCase();
  const color = text(source.color).trim();

  return {
    id,
    type: nodeType,
    x: finite(source.x) ?? 0,
    y: finite(source.y) ?? 0,
    width: Math.max(40, finite(source.width) ?? defaults.width),
    height: Math.max(32, finite(source.height) ?? defaults.height),
    title: text(source.title).trim() || defaults.title,
    note: text(source.note),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : defaults.color,
    qaStatus: QA_STATUS_SET.has(qaStatus) ? (qaStatus as FlowQaStatus) : 'NONE',
  };
}

function normalizeEdge(raw: unknown, index: number, nodeIds: Set<string>): FlowEdge {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`La conexión #${index + 1} no es un objeto válido.`);
  }
  const source = raw as Record<string, unknown>;
  const sourceId = text(source.source).trim();
  const targetId = text(source.target).trim();
  if (!sourceId || !targetId) {
    throw new Error(`La conexión #${index + 1} debe tener "source" y "target".`);
  }
  if (!nodeIds.has(sourceId)) {
    throw new Error(`La conexión #${index + 1} apunta a un nodo inexistente: "${sourceId}".`);
  }
  if (!nodeIds.has(targetId)) {
    throw new Error(`La conexión #${index + 1} apunta a un nodo inexistente: "${targetId}".`);
  }

  const sourcePort = text(source.sourcePort).trim();
  const targetPort = text(source.targetPort).trim();
  const style = text(source.style).trim();
  const color = text(source.color).trim();

  return {
    id: text(source.id).trim() || `e_import_${index + 1}`,
    source: sourceId,
    sourcePort: PORT_SET.has(sourcePort) ? (sourcePort as FlowPort) : 'bottom',
    target: targetId,
    targetPort: PORT_SET.has(targetPort) ? (targetPort as FlowPort) : 'top',
    label: text(source.label),
    style: EDGE_STYLE_SET.has(style) ? (style as FlowEdgeStyle) : 'solid',
    color: EDGE_COLOR_SET.has(color) ? (color as FlowEdgeColor) : 'default',
  };
}

function normalizeSettings(raw: unknown): FlowSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
  const settings = raw as Record<string, unknown>;
  return {
    snapToGrid:
      typeof settings.snapToGrid === 'boolean'
        ? settings.snapToGrid
        : DEFAULT_SETTINGS.snapToGrid,
    mermaidDir: settings.mermaidDir === 'LR' ? 'LR' : 'TD',
  };
}

/**
 * Parsea y valida un archivo JSON nativo de FlowQA Studio.
 * Acepta el wrapper exportado por la app ({ app, version, nodes, edges, settings })
 * y también un objeto mínimo ({ nodes, edges }).
 */
export function parseFlowQaJson(rawText: string, fallbackName: string): ParsedFlowQaJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('El JSON debe ser un objeto con "nodes" y "edges".');
  }

  const root = parsed as Record<string, unknown>;
  if (root.app != null && root.app !== 'FlowQA Studio') {
    throw new Error('El archivo no fue exportado por FlowQA Studio.');
  }
  if (root.version != null && Number(root.version) > 1) {
    throw new Error(`Versión de archivo no soportada: ${String(root.version)}.`);
  }

  const rawNodes = root.nodes;
  const rawEdges = root.edges;
  if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) {
    throw new Error('El JSON debe incluir "nodes" y "edges" como arrays.');
  }

  const nodes = rawNodes.map(normalizeNode);
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error(`Hay dos nodos con el mismo id: "${node.id}".`);
    ids.add(node.id);
  }

  const edges = rawEdges.map((edge, index) => normalizeEdge(edge, index, ids));
  const edgeIds = new Set<string>();
  for (let index = 0; index < edges.length; index += 1) {
    const edge = edges[index];
    if (edgeIds.has(edge.id)) edge.id = `e_import_${index + 1}_${edgeIds.size}`;
    edgeIds.add(edge.id);
  }

  const name = (text(root.name).trim() || fallbackName).slice(0, 160);
  const description = text(root.description).trim().slice(0, 500) || null;
  const entityId = finite(root.entity_id);

  return {
    name,
    description,
    nodes,
    edges,
    settings: normalizeSettings(root.settings),
    entity_type: root.entity_type == null ? null : text(root.entity_type).trim() || null,
    entity_id: entityId != null && entityId > 0 ? Math.trunc(entityId) : null,
  };
}
