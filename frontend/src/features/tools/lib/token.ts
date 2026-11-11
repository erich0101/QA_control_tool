export type TokenType =
  | 'empty'
  | 'jwt'
  | 'hash'
  | 'uuid'
  | 'base64'
  | 'hex'
  | 'opaque';

export interface JwtParts {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  headerB64: string;
  payloadB64: string;
  signatureB64: string;
}

export type ParseJwtResult =
  | { ok: true; value: JwtParts }
  | { ok: false; error: string };

export interface TokenDetection {
  type: TokenType;
  hashKind?: string;
  decodedPreview?: string;
  length: number;
}

// ── Base64URL ────────────────────────────────────────────────

export function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── JWT ──────────────────────────────────────────────────────

export function parseJwt(token: string): ParseJwtResult {
  const parts = token.trim().split('.');

  if (parts.length !== 3) {
    return {
      ok: false,
      error: `Se esperaban 3 segmentos separados por ".", hay ${parts.length}`,
    };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  if (!headerB64 || !payloadB64) {
    return { ok: false, error: 'El header o el payload están vacíos' };
  }

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;

  try {
    header = JSON.parse(base64UrlDecode(headerB64)) as Record<string, unknown>;
  } catch (error) {
    return { ok: false, error: `Header inválido: ${(error as Error).message}` };
  }

  try {
    payload = JSON.parse(base64UrlDecode(payloadB64)) as Record<string, unknown>;
  } catch (error) {
    return { ok: false, error: `Payload inválido: ${(error as Error).message}` };
  }

  return {
    ok: true,
    value: { header, payload, headerB64, payloadB64, signatureB64 },
  };
}

// ── Detección de tipo ────────────────────────────────────────

export function detectTokenType(input: string): TokenDetection {
  const token = input.trim();
  const length = token.length;

  if (!token) return { type: 'empty', length: 0 };

  if (
    token.split('.').length === 3 &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(token)
  ) {
    return { type: 'jwt', length };
  }

  if (/^[0-9a-fA-F]+$/.test(token)) {
    if (length === 32) return { type: 'hash', hashKind: 'MD5', length };
    if (length === 40) return { type: 'hash', hashKind: 'SHA-1', length };
    if (length === 64) return { type: 'hash', hashKind: 'SHA-256', length };
    if (length === 128) return { type: 'hash', hashKind: 'SHA-512', length };
    return { type: 'hex', length };
  }

  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(token)) {
    return { type: 'uuid', length };
  }

  if (/^[A-Za-z0-9+/_-]+=*$/.test(token) && length >= 8 && length % 4 === 0) {
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(atob(token.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
      );
      const printable = decoded.replace(/[^\x20-\x7E]/g, '');
      if (decoded.length > 0 && printable.length / decoded.length > 0.85) {
        return { type: 'base64', decodedPreview: decoded.slice(0, 200), length };
      }
    } catch {
      // No es base64 legible: sigue como opaco.
    }
  }

  return { type: 'opaque', length };
}

// ── Entropía y composición ───────────────────────────────────

export function shannonEntropy(input: string): number {
  if (!input) return 0;

  const counts = new Map<string, number>();
  for (const char of input) counts.set(char, (counts.get(char) ?? 0) + 1);

  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / input.length;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

export interface CharBreakdown {
  upper: number;
  lower: number;
  digit: number;
  symbol: number;
  other: number;
  total: number;
}

export function charBreakdown(input: string): CharBreakdown {
  const result: CharBreakdown = { upper: 0, lower: 0, digit: 0, symbol: 0, other: 0, total: input.length };

  for (const char of input) {
    if (char >= 'A' && char <= 'Z') result.upper += 1;
    else if (char >= 'a' && char <= 'z') result.lower += 1;
    else if (char >= '0' && char <= '9') result.digit += 1;
    else if (/[\s\-_./+=:@]/.test(char)) result.symbol += 1;
    else result.other += 1;
  }

  return result;
}

export function entropyLabel(bitsPerChar: number): { label: string; tone: 'ok' | 'warn' | 'fail' } {
  if (bitsPerChar >= 4.5) return { label: 'Muy alta', tone: 'ok' };
  if (bitsPerChar >= 3.5) return { label: 'Alta', tone: 'ok' };
  if (bitsPerChar >= 2.5) return { label: 'Media', tone: 'warn' };
  return { label: 'Baja', tone: 'fail' };
}

// ── Claims ──────────────────────────────────────────────────

const CLAIM_LABELS: Record<string, string> = {
  iss: 'Issuer',
  sub: 'Subject',
  aud: 'Audience',
  exp: 'Expiración',
  nbf: 'No antes de',
  iat: 'Emitido',
  jti: 'JWT ID',
  auth_time: 'Autenticado',
  alg: 'Algoritmo',
  typ: 'Tipo',
  kid: 'Key ID',
};

const CLAIM_DESCRIPTIONS: Record<string, string> = {
  iss: 'Quién emitió el token.',
  sub: 'A quién identifica el token (usuario/servicio).',
  aud: 'Destinatarios para los que el token es válido.',
  exp: 'Desde este momento el token NO debe aceptarse.',
  nbf: 'Antes de este momento el token NO debe aceptarse.',
  iat: 'Momento en que se emitió el token.',
  jti: 'Identificador único del token (para revocación).',
  auth_time: 'Cuándo se autenticó el usuario.',
  alg: 'Algoritmo de firma del header.',
  typ: 'Tipo de token declarado.',
  kid: 'Identificador de la clave usada para firmar.',
  scope: 'Scopes OAuth2 otorgados.',
  scopes: 'Scopes OAuth2 otorgados.',
  permissions: 'Permisos del usuario.',
};

const TIMESTAMP_CLAIMS = new Set(['exp', 'nbf', 'iat', 'auth_time']);

export type ClaimStatus = 'valid' | 'expired' | 'pending' | null;

export interface ClaimRow {
  key: string;
  label: string;
  description?: string;
  display: string;
  raw: unknown;
  isTimestamp: boolean;
  status: ClaimStatus;
}

function relativeTime(targetMs: number): string {
  const diffSeconds = Math.round((targetMs - Date.now()) / 1000);
  const past = diffSeconds < 0;
  const abs = Math.abs(diffSeconds);

  const unit =
    abs < 60
      ? `${abs}s`
      : abs < 3600
        ? `${Math.round(abs / 60)} min`
        : abs < 86_400
          ? `${Math.round(abs / 3600)} h`
          : abs < 2_592_000
            ? `${Math.round(abs / 86_400)} d`
            : abs < 31_536_000
              ? `${Math.round(abs / 2_592_000)} meses`
              : `${Math.round(abs / 31_536_000)} años`;

  return past ? `hace ${unit}` : `en ${unit}`;
}

export function describeClaims(payload: Record<string, unknown>): ClaimRow[] {
  const rows: ClaimRow[] = Object.entries(payload).map(([key, raw]) => {
    const isTimestamp = TIMESTAMP_CLAIMS.has(key) && typeof raw === 'number';

    if (!isTimestamp) {
      return {
        key,
        label: CLAIM_LABELS[key] ?? key,
        description: CLAIM_DESCRIPTIONS[key],
        display: typeof raw === 'string' ? raw : JSON.stringify(raw),
        raw,
        isTimestamp: false,
        status: null,
      };
    }

    const ms = (raw as number) * 1000;
    const date = new Date(ms);

    let status: ClaimStatus = 'valid';
    if (key === 'exp') status = ms < Date.now() ? 'expired' : 'valid';
    if (key === 'nbf') status = ms > Date.now() ? 'pending' : 'valid';
    if (key === 'iat' || key === 'auth_time') status = null;

    return {
      key,
      label: CLAIM_LABELS[key] ?? key,
      description: CLAIM_DESCRIPTIONS[key],
      display: `${date.toLocaleString('es-AR')} · ${relativeTime(ms)}`,
      raw,
      isTimestamp: true,
      status,
    };
  });

  // Timestamps primero, luego alfabético.
  return rows.sort((a, b) => {
    if (a.isTimestamp !== b.isTimestamp) return a.isTimestamp ? -1 : 1;
    return a.key.localeCompare(b.key);
  });
}

// ── Verificación de firma ───────────────────────────────────

const HMAC_HASHES: Record<string, 'SHA-256' | 'SHA-384' | 'SHA-512'> = {
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512',
};

export type VerifyResult =
  | { status: 'valid' }
  | { status: 'invalid' }
  | { status: 'unsupported'; message: string }
  | { status: 'error'; message: string };

/**
 * Verifica la firma HMAC de un JWT con Web Crypto.
 *
 * Nota: el legacy tenía una guarda `(headerB64.match(/\./g) || []).length !== 1`
 * que siempre fallaba (el header no tiene puntos), así que nunca verificaba.
 * Acá se compara directamente la firma calculada con la provista.
 */
export async function verifyJwtSignature(
  header: Record<string, unknown>,
  headerB64: string,
  payloadB64: string,
  signatureB64: string,
  secret: string,
): Promise<VerifyResult> {
  if (!secret) return { status: 'error', message: 'Ingresá el secret para verificar' };

  const alg = String(header.alg ?? '').toUpperCase();
  const hash = HMAC_HASHES[alg];

  if (!hash) {
    return {
      status: 'unsupported',
      message: `Verificación local soporta HS256/HS384/HS512 (el token usa ${alg || 'sin alg'})`,
    };
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash },
      false,
      ['sign'],
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`${headerB64}.${payloadB64}`),
    );

    const expected = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const provided = signatureB64.replace(/=+$/, '');
    return expected === provided ? { status: 'valid' } : { status: 'invalid' };
  } catch (error) {
    return { status: 'error', message: (error as Error).message };
  }
}

// ── Token de ejemplo ────────────────────────────────────────

const SAMPLE_SECRET = 'your-256-bit-secret';

export async function generateSampleJwt(): Promise<{ token: string; secret: string }> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: 'auth0|123456789',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    role: 'admin',
    iss: 'https://auth.example.com/',
    aud: 'https://api.example.com',
    iat: now,
    nbf: now,
    exp: now + 3600,
    jti: `abc-${Math.random().toString(36).slice(2, 10)}`,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SAMPLE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { token: `${headerB64}.${payloadB64}.${signatureB64}`, secret: SAMPLE_SECRET };
}
