import type { ExecResponse, ExecRequestPayload } from '@/lib/api/tools';

export type BodyType = 'none' | 'json' | 'form-data' | 'x-www-form-urlencoded' | 'raw' | 'binary';

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export const BODY_TYPES: Array<{ value: BodyType; label: string }> = [
  { value: 'none', label: 'Sin body' },
  { value: 'json', label: 'JSON' },
  { value: 'form-data', label: 'Form Data' },
  { value: 'x-www-form-urlencoded', label: 'URL-encoded' },
  { value: 'raw', label: 'Raw' },
  { value: 'binary', label: 'Binary' },
];

export interface KvRow {
  key: string;
  value: string;
  enabled: boolean;
}

export interface AttachedFile {
  fieldName: string;
  filename: string;
  type: string;
  base64: string;
  size: number;
}

export interface RequestState {
  method: string;
  url: string;
  headers: KvRow[];
  queryParams: KvRow[];
  formFields: KvRow[];
  body: string;
  bodyType: BodyType;
  rawContentType: string;
  files: AttachedFile[];
  curlInput: string;
  hasLocalCurlFiles: boolean;
  binaryName: string | null;
  binarySize: number;
}

export const emptyKv = (): KvRow => ({ key: '', value: '', enabled: true });

export const initialRequestState: RequestState = {
  method: 'GET',
  url: '',
  headers: [emptyKv()],
  queryParams: [emptyKv()],
  formFields: [emptyKv()],
  body: '',
  bodyType: 'none',
  rawContentType: 'text/plain',
  files: [],
  curlInput: '',
  hasLocalCurlFiles: false,
  binaryName: null,
  binarySize: 0,
};

export function kvToObject(rows: KvRow[]): Record<string, string> {
  const out: Record<string, string> = {};

  for (const row of rows) {
    if (row.enabled && row.key.trim()) out[row.key] = row.value;
  }

  return out;
}

/**
 * Aplica query params a la URL.
 * (El legacy tenía la sección pero nunca la usaba al enviar: bug corregido acá.)
 */
export function buildUrlWithQuery(url: string, queryParams: KvRow[]): string {
  const params = kvToObject(queryParams);
  const entries = Object.entries(params);

  if (entries.length === 0) return url;

  try {
    const parsed = new URL(url);
    for (const [key, value] of entries) parsed.searchParams.set(key, value);
    return parsed.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    const query = entries
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    return `${url}${separator}${query}`;
  }
}

export function buildPayload(state: RequestState): ExecRequestPayload {
  const headers = kvToObject(state.headers);
  const url = buildUrlWithQuery(state.url.trim(), state.queryParams);

  const isForm = state.bodyType === 'form-data' || state.bodyType === 'x-www-form-urlencoded';

  const payload: ExecRequestPayload = {
    method: state.method,
    url,
    headers,
    body: isForm ? kvToObject(state.formFields) : state.body,
    bodyType: state.bodyType,
    files: state.files,
  };

  if (state.bodyType === 'raw' && state.rawContentType) {
    const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');
    if (!hasContentType) payload.headers['Content-Type'] = state.rawContentType;
  }

  return payload;
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Genera un comando curl equivalente al estado actual. */
export function buildCurl(state: RequestState): string {
  if (!state.url.trim()) return '';

  const url = buildUrlWithQuery(state.url.trim(), state.queryParams);
  const lines = [`curl -X ${state.method} ${quote(url)}`];

  for (const [key, value] of Object.entries(kvToObject(state.headers))) {
    lines.push(`  -H ${quote(`${key}: ${value}`)}`);
  }

  switch (state.bodyType) {
    case 'json': {
      if (!state.body) break;
      const hasContentType = Object.keys(kvToObject(state.headers)).some(
        (key) => key.toLowerCase() === 'content-type',
      );
      if (!hasContentType) lines.push("  -H 'Content-Type: application/json'");
      lines.push(`  --data-raw ${quote(state.body)}`);
      break;
    }
    case 'x-www-form-urlencoded': {
      const pairs = Object.entries(kvToObject(state.formFields)).map(
        ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
      );
      if (pairs.length > 0) lines.push(`  --data ${quote(pairs.join('&'))}`);
      break;
    }
    case 'form-data': {
      for (const [key, value] of Object.entries(kvToObject(state.formFields))) {
        lines.push(`  -F ${quote(`${key}=${value}`)}`);
      }
      for (const file of state.files) {
        lines.push(`  -F ${quote(`${file.fieldName}=@${file.filename}`)}`);
      }
      break;
    }
    case 'raw': {
      if (!state.body) break;
      if (state.rawContentType) lines.push(`  -H ${quote(`Content-Type: ${state.rawContentType}`)}`);
      lines.push(`  --data-raw ${quote(state.body)}`);
      break;
    }
    case 'binary': {
      if (state.binaryName) lines.push(`  --data-binary ${quote(`@${state.binaryName}`)}`);
      break;
    }
    default:
      break;
  }

  return lines.join(' \\\n');
}

export type CopyKind = 'body' | 'url' | 'meta' | 'curl' | 'all';

export function buildCopyText(kind: CopyKind, state: RequestState, response: ExecResponse | null): string | null {
  switch (kind) {
    case 'body':
      return response?.body ?? null;
    case 'url':
      return state.url || null;
    case 'meta':
      if (!response) return null;
      return [
        `URL: ${state.url}`,
        `Status: ${response.status} ${response.statusText}`,
        `Time: ${response.timeMs} ms`,
        `Size: ${response.sizeBytes} bytes${response.truncated ? ' (truncado a 5 MB)' : ''}`,
      ].join('\n');
    case 'curl':
      return buildCurl(state) || null;
    case 'all': {
      const lines: string[] = ['# Request', buildCurl(state)];

      if (!response) {
        lines.push('', '# (sin response todavía)');
        return lines.join('\n');
      }

      lines.push(
        '',
        '# Response',
        `Status: ${response.status} ${response.statusText}`,
        `Time: ${response.timeMs} ms`,
        `Size: ${response.sizeBytes} bytes${response.truncated ? ' (truncado)' : ''}`,
        '',
        '## Headers',
      );

      for (const [key, value] of Object.entries(response.headers ?? {})) {
        lines.push(`${key}: ${value}`);
      }

      lines.push('', '## Body', response.body);
      return lines.join('\n');
    }
    default:
      return null;
  }
}
