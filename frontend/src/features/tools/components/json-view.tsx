const JSON_TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** JSON con colores de sintaxis, armado con nodos React (sin innerHTML). */
export function JsonView({
  value,
  className,
}: {
  value: unknown;
  className?: string;
}) {
  const json = JSON.stringify(value, null, 2);

  return (
    <pre
      className={
        className ??
        'scrollbar-apple max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface-2 p-3 font-mono text-caption leading-relaxed'
      }
    >
      {highlightJson(json)}
    </pre>
  );
}

export function highlightJson(json: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  JSON_TOKEN.lastIndex = 0;

  while ((match = JSON_TOKEN.exec(json)) !== null) {
    if (match.index > lastIndex) nodes.push(json.slice(lastIndex, match.index));

    const [full, quoted, colon, literal, number] = match;

    if (quoted) {
      const isKey = Boolean(colon);
      nodes.push(
        <span key={key} className={isKey ? 'text-brand' : 'text-ok'}>
          {quoted}
        </span>,
      );
      if (colon) {
        nodes.push(
          <span key={`c${key}`} className="text-fg-subtle">
            {colon}
          </span>,
        );
      }
      key += 1;
    } else if (literal) {
      nodes.push(
        <span key={key} className="text-accent">
          {literal}
        </span>,
      );
      key += 1;
    } else if (number) {
      nodes.push(
        <span key={key} className="text-warn">
          {number}
        </span>,
      );
      key += 1;
    } else {
      nodes.push(full);
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < json.length) nodes.push(json.slice(lastIndex));

  return nodes;
}
