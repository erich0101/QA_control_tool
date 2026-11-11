const CHUNK_SIZE = 8192;

/**
 * Codifica bytes a Base64.
 * Procesa en chunks para no explotar el stack con `String.fromCharCode(...bytes)`
 * en archivos grandes (el legacy ya lo resolvía así).
 */
export function bytesToBase64(bytes: Uint8Array, urlSafe = false): string {
  let binary = '';

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }

  let encoded = btoa(binary);

  if (urlSafe) {
    encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  return encoded;
}

/** Decodifica Base64 (estándar o URL-safe) a bytes. Lanza si el input es inválido. */
export function base64ToBytes(input: string): Uint8Array {
  const normalized = input
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error('Base64 inválido: contiene caracteres no permitidos');
  }

  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export function encodeText(text: string, urlSafe = false): string {
  if (text === '') return '';
  return bytesToBase64(new TextEncoder().encode(text), urlSafe);
}

export type DecodeResult =
  | { ok: true; text: string; bytes: Uint8Array }
  | { ok: false; error: string };

/**
 * Decodifica Base64 a texto UTF-8.
 * Si el contenido no es UTF-8 válido devuelve `ok: false` con el binario
 * disponible para descargar (lo usa la herramienta para ofrecer "binario").
 */
export function decodeText(input: string): DecodeResult {
  if (input.trim() === '') return { ok: true, text: '', bytes: new Uint8Array() };

  let bytes: Uint8Array;

  try {
    bytes = base64ToBytes(input);
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, text, bytes };
  } catch {
    return {
      ok: false,
      error: 'El contenido decodificado no es texto UTF-8 válido (parece binario)',
    };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function readFileAsBytes(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Damos margen al navegador para iniciar la descarga.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
