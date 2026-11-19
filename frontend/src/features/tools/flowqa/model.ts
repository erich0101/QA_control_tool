export type FlowNodeType = 'start_end' | 'process' | 'decision' | 'qa' | 'data' | 'note';
export type FlowQaStatus = 'NONE' | 'PASS' | 'FAIL' | 'BLOCKED' | 'PENDING';
export type FlowEdgeColor = 'default' | 'green' | 'red' | 'amber' | 'blue';
export type FlowEdgeStyle = 'solid' | 'dashed';
export type FlowPort = 'top' | 'right' | 'bottom' | 'left';

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  note: string;
  color: string;
  qaStatus: FlowQaStatus;
}

export interface FlowEdge {
  id: string;
  source: string;
  sourcePort: FlowPort;
  target: string;
  targetPort: FlowPort;
  label: string;
  style: FlowEdgeStyle;
  color: FlowEdgeColor;
}

export interface FlowSettings {
  snapToGrid: boolean;
  mermaidDir: 'TD' | 'LR';
}

export interface FlowState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  settings: FlowSettings;
}

export const GRID_SIZE = 20;

export const DEFAULT_SETTINGS: FlowSettings = { snapToGrid: true, mermaidDir: 'TD' };

export const ACCENT_COLORS = [
  { id: 'blue', hex: '#3b82f6', label: 'Azul' },
  { id: 'emerald', hex: '#10b981', label: 'Esmeralda' },
  { id: 'amber', hex: '#f59e0b', label: 'Ámbar' },
  { id: 'purple', hex: '#8b5cf6', label: 'Violeta' },
  { id: 'cyan', hex: '#06b6d4', label: 'Cian' },
  { id: 'rose', hex: '#f43f5e', label: 'Rojo' },
  { id: 'slate', hex: '#64748b', label: 'Gris' },
];

export const QA_STATUSES: Record<
  FlowQaStatus,
  { label: string; className: string }
> = {
  NONE: { label: 'Sin estado', className: 'border-border bg-fill-soft text-fg-subtle' },
  PASS: { label: 'PASS', className: 'border-ok/30 bg-ok-soft text-ok' },
  FAIL: { label: 'FAIL', className: 'border-fail/30 bg-fail-soft text-fail' },
  BLOCKED: { label: 'BLOCKED', className: 'border-warn/30 bg-warn-soft text-warn' },
  PENDING: { label: 'PENDING', className: 'border-brand/30 bg-brand-soft text-brand' },
};

export const NODE_DEFAULTS: Record<
  FlowNodeType,
  { width: number; height: number; color: string; title: string; note: string; qaStatus?: FlowQaStatus }
> = {
  start_end: { width: 170, height: 56, color: '#10b981', title: 'Inicio / Fin', note: '' },
  process: { width: 200, height: 76, color: '#3b82f6', title: 'Nuevo paso', note: '' },
  decision: { width: 176, height: 112, color: '#f59e0b', title: '¿Condición?', note: '' },
  qa: {
    width: 224,
    height: 94,
    color: '#8b5cf6',
    title: 'Validación QA',
    note: 'Verificar resultado esperado',
    qaStatus: 'PENDING',
  },
  data: {
    width: 214,
    height: 80,
    color: '#06b6d4',
    title: 'Request API / Datos',
    note: 'POST /api/endpoint',
  },
  note: {
    width: 210,
    height: 78,
    color: '#f59e0b',
    title: 'Nota explicativa',
    note: 'Texto libre o aclaración entre pasos',
  },
};

export const EDGE_COLORS: Record<
  FlowEdgeColor,
  { hex: string; label: string }
> = {
  default: { hex: '#64748b', label: 'Por defecto' },
  green: { hex: '#10b981', label: 'Verde (PASS)' },
  red: { hex: '#ef4444', label: 'Rojo (FAIL)' },
  amber: { hex: '#f59e0b', label: 'Ámbar (Alerta)' },
  blue: { hex: '#3b82f6', label: 'Azul (Info)' },
};

export const NODE_TYPES: Array<{ type: FlowNodeType; label: string; hint: string }> = [
  { type: 'start_end', label: 'Inicio / Fin', hint: 'Terminal del flujo' },
  { type: 'process', label: 'Paso / Proceso', hint: 'Acción o tarea' },
  { type: 'decision', label: 'Decisión', hint: 'Condición Sí / No' },
  { type: 'qa', label: 'Validación QA', hint: 'Badge PASS / FAIL' },
  { type: 'data', label: 'API / Datos', hint: 'Request, DB o input' },
  { type: 'note', label: 'Nota', hint: 'Anotación entre pasos' },
];

export const QUICK_LABELS = ['Sí', 'No', 'PASS', 'FAIL', '200 OK', 'Error', 'Reintentar'];

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function snapValue(value: number, enabled: boolean) {
  return enabled ? Math.round(value / GRID_SIZE) * GRID_SIZE : Math.round(value);
}

export function getPortCoords(node: FlowNode, port: FlowPort) {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  switch (port) {
    case 'top':
      return { x: cx, y: node.y };
    case 'bottom':
      return { x: cx, y: node.y + node.height };
    case 'left':
      return { x: node.x, y: cy };
    case 'right':
      return { x: node.x + node.width, y: cy };
    default:
      return { x: cx, y: node.y + node.height };
  }
}

export function getClosestPort(node: FlowNode, x: number, y: number): FlowPort {
  const ports: FlowPort[] = ['top', 'bottom', 'left', 'right'];
  let best: FlowPort = 'top';
  let bestDist = Number.POSITIVE_INFINITY;
  for (const port of ports) {
    const point = getPortCoords(node, port);
    const dist = Math.hypot(point.x - x, point.y - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = port;
    }
  }
  return best;
}

export function computeEdgeGeometry(
  p1: { x: number; y: number },
  port1: FlowPort,
  p2: { x: number; y: number },
  port2: FlowPort,
) {
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const offset = Math.max(36, Math.min(130, dist * 0.42));
  const dir: Record<FlowPort, { x: number; y: number }> = {
    top: { x: 0, y: -1 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const v1 = dir[port1];
  const v2 = dir[port2];
  const c1 = { x: p1.x + v1.x * offset, y: p1.y + v1.y * offset };
  const c2 = { x: p2.x + v2.x * offset, y: p2.y + v2.y * offset };
  const midX = 0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x;
  const midY = 0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y;
  const d = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  return { d, midX, midY };
}

export function demoFlowState(): FlowState {
  return {
    settings: { ...DEFAULT_SETTINGS },
    nodes: [
      { id: 'n_start', type: 'start_end', x: 340, y: 40, width: 180, height: 54, title: 'Inicio prueba login', note: '', color: '#10b981', qaStatus: 'NONE' },
      { id: 'n_req', type: 'data', x: 320, y: 140, width: 220, height: 80, title: 'Ejecutar request login', note: 'POST /api/v1/auth/login', color: '#06b6d4', qaStatus: 'NONE' },
      { id: 'n_cond', type: 'decision', x: 340, y: 270, width: 180, height: 112, title: '¿Status 200?', note: '', color: '#f59e0b', qaStatus: 'NONE' },
      { id: 'n_pass', type: 'qa', x: 100, y: 440, width: 230, height: 96, title: 'Validar token JWT', note: 'Verificar firma, rol y expiración', color: '#10b981', qaStatus: 'PASS' },
      { id: 'n_fail', type: 'qa', x: 530, y: 440, width: 230, height: 96, title: 'Registrar bug y captura', note: 'Adjuntar traceId y respuesta JSON', color: '#f43f5e', qaStatus: 'FAIL' },
      { id: 'n_end_ok', type: 'start_end', x: 125, y: 600, width: 180, height: 54, title: 'Fin — Evidencia OK', note: '', color: '#10b981', qaStatus: 'NONE' },
      { id: 'n_end_err', type: 'start_end', x: 555, y: 600, width: 180, height: 54, title: 'Fin — Bug reportado', note: '', color: '#f43f5e', qaStatus: 'NONE' },
    ],
    edges: [
      { id: 'e_1', source: 'n_start', sourcePort: 'bottom', target: 'n_req', targetPort: 'top', label: 'Credenciales', style: 'solid', color: 'blue' },
      { id: 'e_2', source: 'n_req', sourcePort: 'bottom', target: 'n_cond', targetPort: 'top', label: 'Response API', style: 'solid', color: 'default' },
      { id: 'e_3', source: 'n_cond', sourcePort: 'left', target: 'n_pass', targetPort: 'top', label: 'Sí — 200 OK', style: 'solid', color: 'green' },
      { id: 'e_4', source: 'n_cond', sourcePort: 'right', target: 'n_fail', targetPort: 'top', label: 'No — 401 / Error', style: 'dashed', color: 'red' },
      { id: 'e_5', source: 'n_pass', sourcePort: 'bottom', target: 'n_end_ok', targetPort: 'top', label: 'PASS', style: 'solid', color: 'green' },
      { id: 'e_6', source: 'n_fail', sourcePort: 'bottom', target: 'n_end_err', targetPort: 'top', label: 'FAIL', style: 'dashed', color: 'red' },
    ],
  };
}
