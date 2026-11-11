interface AdfNode {
  type?: string;
  text?: string;
  attrs?: { text?: string; [key: string]: unknown };
  content?: AdfNode[];
}

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'listItem', 'bulletList', 'orderedList', 'blockquote', 'codeBlock']);

/**
 * Convierte un cuerpo ADF de Jira (Atlassian Document Format) a texto plano.
 * El legacy tenía lo mismo disperso en el tab; acá se cubre también el salto
 * de línea entre párrafos, que antes se perdía.
 */
export function adfToText(node: unknown): string {
  const walk = (current: AdfNode): string => {
    if (!current) return '';

    if (current.type === 'mention') return `@${current.attrs?.text ?? 'Usuario'}`;
    if (current.type === 'hardBreak') return '\n';
    if (typeof current.text === 'string') return current.text;

    const children = Array.isArray(current.content) ? current.content : [];
    const inner = children.map(walk).join('');

    if (current.type && BLOCK_TYPES.has(current.type)) return `${inner}\n`;
    return inner;
  };

  return walk(node as AdfNode).replace(/\n{3,}/g, '\n\n').trim();
}
