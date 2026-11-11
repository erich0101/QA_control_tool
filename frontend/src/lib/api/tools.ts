import { apiFetch } from './client';

export interface ExecRequestPayload {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  bodyType: string;
  files: Array<{ fieldName: string; filename: string; type: string; base64: string }>;
}

export interface ExecResponse {
  ok: true;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timeMs: number;
  sizeBytes: number;
  truncated: boolean;
}

export type ExecResult = ExecResponse | { ok: false; error: string };

export const toolsApi = {
  /**
   * Ejecuta la request desde el backend (proxy) para evitar CORS.
   * El backend valida método, URL y bodyType, y trunca la respuesta a 5 MB.
   */
  execRequest: (payload: ExecRequestPayload) =>
    apiFetch<ExecResult>('/api/tools/request-builder/exec', {
      method: 'POST',
      body: payload,
    }),
};
