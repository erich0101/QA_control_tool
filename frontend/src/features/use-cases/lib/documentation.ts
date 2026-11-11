export interface Documentation {
  url: string;
  md: string;
}

/**
 * `link_documentacion` tiene dos formatos históricos:
 *  - string plano con la URL (versiones viejas),
 *  - JSON `{ url, md }` (versión actual).
 * Este parser soporta ambos para no perder datos al migrar.
 */
export function parseDocumentation(raw?: string | null): Documentation {
  if (!raw) return { url: '', md: '' };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      return {
        url: typeof obj.url === 'string' ? obj.url : '',
        md: typeof obj.md === 'string' ? obj.md : '',
      };
    }
  } catch {
    // No es JSON: es una URL plana.
  }

  return { url: raw, md: '' };
}

export function serializeDocumentation(doc: Documentation): string {
  return JSON.stringify({ url: doc.url.trim(), md: doc.md });
}

/** Normaliza `recommendations` (JSON string o array) a una lista de textos. */
export function parseRecommendations(raw: unknown): string[] {
  let list: unknown = raw;

  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return raw.trim() ? [raw] : [];
    }
  }

  if (!Array.isArray(list)) return [];

  return list
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        return String(obj.title ?? obj.description ?? '').trim();
      }
      return '';
    })
    .filter(Boolean);
}
