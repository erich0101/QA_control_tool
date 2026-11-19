import { apiFetch } from './client';

export interface FlowDiagramSummary {
  id: number;
  project_id: number;
  name: string;
  description?: string | null;
  version: number;
  node_count: number;
  edge_count: number;
  created_at?: string;
  updated_at?: string;
  updated_by_name?: string | null;
}

export interface FlowDiagram extends FlowDiagramSummary {
  nodes: unknown[];
  edges: unknown[];
  settings: Record<string, unknown>;
  created_by?: number | null;
  updated_by?: number | null;
  created_by_name?: string | null;
}

export interface FlowDiagramPayload {
  name: string;
  description?: string | null;
  nodes: unknown[];
  edges: unknown[];
  settings?: unknown;
}

export const flowDiagramsApi = {
  list: async (projectId: number) => {
    const res = await apiFetch<{ diagrams: FlowDiagramSummary[] }>('/api/flow-diagrams', {
      query: { project_id: projectId },
    });
    return res.diagrams;
  },
  get: async (id: number) => {
    const res = await apiFetch<{ diagram: FlowDiagram }>(`/api/flow-diagrams/${id}`);
    return res.diagram;
  },
  create: async (projectId: number, payload: FlowDiagramPayload) => {
    const res = await apiFetch<{ diagram: FlowDiagram }>('/api/flow-diagrams', {
      method: 'POST',
      body: { project_id: projectId, ...payload },
    });
    return res.diagram;
  },
  update: async (id: number, payload: FlowDiagramPayload) => {
    const res = await apiFetch<{ diagram: FlowDiagram }>(`/api/flow-diagrams/${id}`, {
      method: 'PUT',
      body: payload,
    });
    return res.diagram;
  },
  remove: async (id: number) => {
    await apiFetch<{ ok: true }>(`/api/flow-diagrams/${id}`, { method: 'DELETE' });
  },
};
