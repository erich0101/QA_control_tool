/**
 * Cliente HTTP único de la app.
 *
 * Responsabilidades (y nada más):
 *  - serializar body/query,
 *  - normalizar errores en `ApiError`,
 *  - avisar de un 401 para que la sesión se cierre.
 *
 * Todas las cookies son httpOnly; el navegador las envía solo con
 * `credentials: 'same-origin'` (default cuando hay proxy same-origin).
 */

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export const UNAUTHORIZED_EVENT = 'qa:unauthorized';

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** No dispara el evento global de sesión expirada (lo usan los endpoints de auth). */
  silentAuth?: boolean;
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = `${API_BASE}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    return text || null;
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, silentAuth, headers, ...rest } = options;

  const isFormData = body instanceof FormData;

  const res = await fetch(buildUrl(path, query), {
    ...rest,
    credentials: 'same-origin',
    headers: {
      ...(isFormData ? {} : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await parseBody(res);

  if (!res.ok) {
    const message =
      (payload as { error?: string } | null)?.error ?? `Error ${res.status} en la petición`;

    // Sesión expirada: solo avisamos si el consumidor no lo pidió silencioso.
    if (res.status === 401 && !silentAuth) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }

    throw new ApiError(res.status, message, payload);
  }

  return payload as T;
}
