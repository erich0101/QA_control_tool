export interface CurlParseResult {
  method: string;
  url: string;
  headers: Array<[string, string]>;
  body?: string | Record<string, string>;
  bodyType: 'none' | 'json' | 'form-data' | 'x-www-form-urlencoded' | 'raw' | 'binary';
  hasLocalCurlFiles: boolean;
}

/** Tokeniza respetando comillas simples/dobles y continuación de línea con `\`. */
export function tokenizeCurl(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && /\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }
    if (!inSingle && char === '\\' && i + 1 < input.length) {
      const next = input[i + 1];
      if (next === '\n' || next === '\r') {
        i += 1;
        continue;
      }
      current += input[(i += 1)];
      continue;
    }
    current += char;
  }

  if (current) args.push(current);
  return args;
}

/** Convierte un comando curl en el estado del Request Builder. */
export function parseCurl(raw: string): { ok: true; value: CurlParseResult } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Entrada vacía' };
  if (!/^curl(\s|$)/i.test(trimmed)) return { ok: false, error: 'No parece un comando curl' };

  const args = tokenizeCurl(trimmed);

  let method: string | undefined;
  let url: string | undefined;
  let body: string | undefined;
  let bodyType: CurlParseResult['bodyType'] | undefined;
  const headers: Array<[string, string]> = [];
  const formTextFields: Record<string, string> = {};
  let hasLocalCurlFiles = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === 'curl' || arg.startsWith('-')) {
      if (arg === '-X' || arg === '--request') {
        method = String(args[(i += 1)] ?? '').toUpperCase();
      } else if (arg === '-H' || arg === '--header') {
        const header = args[(i += 1)] ?? '';
        const colon = header.indexOf(':');
        if (colon > 0) headers.push([header.slice(0, colon).trim(), header.slice(colon + 1).trim()]);
      } else if (['-d', '--data', '--data-raw', '--data-binary'].includes(arg)) {
        body = args[(i += 1)] ?? '';
        if (!method) method = 'POST';
        if (!bodyType) {
          const start = body.trim();
          if (start.startsWith('{') || start.startsWith('[')) bodyType = 'json';
          else if (/^[\w[\].-]+=/.test(start)) bodyType = 'x-www-form-urlencoded';
          else bodyType = 'raw';
        }
      } else if (arg === '--json') {
        body = args[(i += 1)] ?? '';
        if (!method) method = 'POST';
        bodyType = 'json';
        if (!headers.some(([key]) => key.toLowerCase() === 'content-type')) {
          headers.push(['Content-Type', 'application/json']);
        }
      } else if (arg === '-F' || arg === '--form') {
        const field = args[(i += 1)] ?? '';
        const equals = field.indexOf('=');
        if (equals > 0) {
          const key = field.slice(0, equals);
          const value = field.slice(equals + 1);
          if (value.startsWith('@')) hasLocalCurlFiles = true;
          else formTextFields[key] = value;
        }
        if (!method) method = 'POST';
        if (!bodyType) bodyType = hasLocalCurlFiles ? 'form-data' : 'x-www-form-urlencoded';
      } else if (arg === '-u' || arg === '--user') {
        const credentials = args[(i += 1)] ?? '';
        try {
          headers.push(['Authorization', `Basic ${btoa(credentials)}`]);
        } catch {
          // Credenciales no ASCII: se ignoran (curl tampoco las codifica así).
        }
      } else if (arg === '-b' || arg === '--cookie') {
        headers.push(['Cookie', args[(i += 1)] ?? '']);
      } else if (arg === '--url') {
        url = args[(i += 1)];
      } else if (
        ['-L', '--location', '-s', '--silent', '-S', '--compressed', '-k', '--insecure', '--fail', '-#', '-i', '-v', '--verbose'].includes(arg)
      ) {
        // Flags de consumo: no afectan la request.
      } else if (arg === '-K' || arg === '--config') {
        i += 1;
      } else if (arg.startsWith('--')) {
        // Flag largo desconocido: si el siguiente token no es flag, se asume valor.
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) i += 1;
      }
    } else if (/^https?:\/\//i.test(arg)) {
      url = arg;
    }
  }

  if (!url) return { ok: false, error: 'No se encontró la URL en el curl' };

  if (!method) {
    method = body || Object.keys(formTextFields).length > 0 || hasLocalCurlFiles ? 'POST' : 'GET';
  }

  const finalBody =
    (bodyType === 'form-data' || bodyType === 'x-www-form-urlencoded') &&
    Object.keys(formTextFields).length > 0
      ? formTextFields
      : body;

  return {
    ok: true,
    value: {
      method,
      url,
      headers,
      body: finalBody,
      bodyType: bodyType ?? 'none',
      hasLocalCurlFiles,
    },
  };
}
