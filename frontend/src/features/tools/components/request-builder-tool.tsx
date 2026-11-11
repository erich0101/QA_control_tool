import { useMemo, useRef, useState } from 'react';
import {
  Braces,
  Copy,
  Download,
  FileUp,
  Play,
  Plus,
  Send,
  Wand2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { toolsApi, type ExecResponse } from '@/lib/api/tools';
import { cn } from '@/lib/utils';
import { formatBytes } from '../lib/base64';
import { parseCurl } from '../lib/curl';
import {
  BODY_TYPES,
  METHODS,
  buildCopyText,
  buildCurl,
  buildPayload,
  emptyKv,
  initialRequestState,
  type AttachedFile,
  type BodyType,
  type CopyKind,
  type KvRow,
  type RequestState,
} from '../lib/request-builder';
import { JsonView } from './json-view';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const METHOD_OPTIONS = METHODS.map((method) => ({ value: method, label: method }));

const STATUS_TONE = (status: number) => {
  if (status < 300) return 'ok' as const;
  if (status < 400) return 'brand' as const;
  if (status < 500) return 'warn' as const;
  return 'fail' as const;
};

function readFileAsAttachment(file: File, fieldName = 'file'): Promise<AttachedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const base64 = result.split(',')[1] ?? '';
      resolve({
        fieldName,
        filename: file.name,
        type: file.type || 'application/octet-stream',
        base64,
        size: file.size,
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return readFileAsAttachment(file).then((attachment) => attachment.base64);
}

export function RequestBuilderTool() {
  const [state, setState] = useState<RequestState>(initialRequestState);
  const [response, setResponse] = useState<ExecResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filesRef = useRef<HTMLInputElement>(null);
  const binaryRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<RequestState>) => setState((current) => ({ ...current, ...patch }));

  const setKv = (field: 'headers' | 'queryParams' | 'formFields', rows: KvRow[]) =>
    update({ [field]: rows } as Partial<RequestState>);

  const parseCurlInput = () => {
    const parsed = parseCurl(state.curlInput);

    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }

    const { method, url, headers, body, bodyType, hasLocalCurlFiles } = parsed.value;

    const toRows = (entries: Array<[string, string]>): KvRow[] =>
      entries.length > 0
        ? entries.map(([key, value]) => ({ key, value, enabled: true }))
        : [emptyKv()];

    const isForm = bodyType === 'form-data' || bodyType === 'x-www-form-urlencoded';
    const formRows =
      isForm && body && typeof body === 'object'
        ? Object.entries(body).map(([key, value]) => ({ key, value: String(value), enabled: true }))
        : [emptyKv()];

    setState((current) => ({
      ...current,
      method,
      url,
      headers: toRows(headers),
      formFields: formRows,
      body: typeof body === 'string' ? body : '',
      bodyType,
      hasLocalCurlFiles,
    }));

    toast.success('cURL importado');
  };

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList) return;

    const attachments: AttachedFile[] = [];

    for (const file of Array.from(fileList)) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`Archivo demasiado grande (máx 10 MB): ${file.name}`);
        continue;
      }
      attachments.push(await readFileAsAttachment(file));
    }

    if (attachments.length > 0) update({ files: [...state.files, ...attachments] });
  };

  const pickBinary = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Archivo demasiado grande (máx 10 MB)');
      return;
    }

    const base64 = await readFileAsBase64(file);
    update({ body: base64, binaryName: file.name, binarySize: file.size });
  };

  const formatJson = () => {
    try {
      update({ body: JSON.stringify(JSON.parse(state.body), null, 2) });
      toast.success('JSON formateado');
    } catch {
      toast.warning('El body no es JSON válido');
    }
  };

  const send = async () => {
    const url = state.url.trim();

    if (!url) {
      setError('Ingresá una URL');
      setResponse(null);
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setError('La URL debe empezar con http:// o https://');
      setResponse(null);
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const result = await toolsApi.execRequest(buildPayload(state));

      if (result.ok) {
        setResponse(result);
        toast.success(`${result.status} ${result.statusText} · ${result.timeMs} ms`);
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    } catch (err) {
      setError((err as Error).message);
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const copy = async (kind: CopyKind) => {
    const text = buildCopyText(kind, state, response);
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success('Copiado');
  };

  const curlPreview = useMemo(() => buildCurl(state), [state]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-title3 font-semibold text-fg">Request Builder</h2>
        <p className="text-footnote text-fg-muted">
          Armá una request, importá un cURL o adjuntá archivos. Se ejecuta a través del backend
          para evitar CORS.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 pt-4">
          <div className="w-28">
            <SelectField
              value={state.method}
              onValueChange={(method) => update({ method })}
              options={METHOD_OPTIONS}
              aria-label="Método HTTP"
            />
          </div>

          <Input
            value={state.url}
            onChange={(event) => update({ url: event.target.value })}
            placeholder="https://api.ejemplo.com/v1/…"
            aria-label="URL"
            className="h-9 min-w-64 flex-1 font-mono text-footnote"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />

          <Button variant="primary" onClick={() => void send()} loading={loading}>
            <Send />
            Send
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              Query params
            </CardTitle>
          </CardHeader>
          <CardContent>
            <KvEditor
              rows={state.queryParams}
              onChange={(rows) => setKv('queryParams', rows)}
              addLabel="Agregar parámetro"
              label="Query params"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              Headers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <KvEditor
              rows={state.headers}
              onChange={(rows) => setKv('headers', rows)}
              addLabel="Agregar header"
              label="Headers"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
            Importar cURL
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={state.curlInput}
            onChange={(event) => update({ curlInput: event.target.value })}
            placeholder={`curl -X POST https://api.ejemplo.com/v1 -H 'Content-Type: application/json' -d '{"foo":"bar"}'`}
            className="min-h-20 font-mono text-footnote"
            aria-label="Comando curl"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={parseCurlInput} disabled={!state.curlInput.trim()}>
              <Wand2 />
              Parsear cURL
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void copy('curl')}
              disabled={!curlPreview}
            >
              <Copy />
              Copiar cURL actual
            </Button>
            {state.hasLocalCurlFiles ? (
              <span className="text-caption text-warn">
                El cURL tenía archivos locales: re-adjuntalos abajo.
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">Body</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {BODY_TYPES.map((bodyType) => (
              <button
                key={bodyType.value}
                type="button"
                onClick={() => update({ bodyType: bodyType.value as BodyType })}
                aria-pressed={state.bodyType === bodyType.value}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-caption font-semibold transition-colors',
                  state.bodyType === bodyType.value
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-border text-fg-muted hover:bg-fill-soft',
                )}
              >
                {bodyType.label}
              </button>
            ))}
          </div>

          {state.bodyType === 'none' ? (
            <p className="text-footnote text-fg-subtle">Este tipo de request no envía body.</p>
          ) : null}

          {state.bodyType === 'json' ? (
            <div className="space-y-2">
              <Textarea
                value={state.body}
                onChange={(event) => update({ body: event.target.value })}
                placeholder='{"foo":"bar"}'
                aria-label="Body JSON"
                className="min-h-40 font-mono text-footnote"
              />
              <Button variant="ghost" size="sm" onClick={formatJson}>
                <Braces />
                Formatear JSON
              </Button>
            </div>
          ) : null}

          {state.bodyType === 'form-data' ? (
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-caption font-bold uppercase tracking-wide text-fg-subtle">
                  Campos de texto
                </p>
                <KvEditor
                  rows={state.formFields}
                  onChange={(rows) => setKv('formFields', rows)}
                  addLabel="Agregar campo"
                  label="Form data"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center gap-2">
                  <p className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
                    Archivos
                  </p>
                  <Button variant="secondary" size="sm" onClick={() => filesRef.current?.click()}>
                    <FileUp />
                    Adjuntar
                  </Button>
                  <input
                    ref={filesRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      void addFiles(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </div>

                {state.files.length === 0 ? (
                  <p className="text-caption text-fg-subtle">Sin archivos adjuntos.</p>
                ) : (
                  <ul className="space-y-1">
                    {state.files.map((file, index) => (
                      <li
                        key={`${file.filename}-${index}`}
                        className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1.5"
                      >
                        <span className="w-24 shrink-0">
                          <Input
                            value={file.fieldName}
                            onChange={(event) =>
                              update({
                                files: state.files.map((item, i) =>
                                  i === index ? { ...item, fieldName: event.target.value } : item,
                                ),
                              })
                            }
                            aria-label={`Nombre del campo para ${file.filename}`}
                            className="h-7 font-mono text-caption"
                          />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-footnote text-fg">
                          {file.filename}
                        </span>
                        <span className="shrink-0 text-caption text-fg-subtle">
                          {formatBytes(file.size)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-6 text-fail"
                          aria-label={`Quitar ${file.filename}`}
                          onClick={() =>
                            update({ files: state.files.filter((_, i) => i !== index) })
                          }
                        >
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          {state.bodyType === 'x-www-form-urlencoded' ? (
            <KvEditor
              rows={state.formFields}
              onChange={(rows) => setKv('formFields', rows)}
              addLabel="Agregar campo"
              label="URL-encoded"
            />
          ) : null}

          {state.bodyType === 'raw' ? (
            <div className="space-y-2">
              <Textarea
                value={state.body}
                onChange={(event) => update({ body: event.target.value })}
                placeholder="texto plano o cualquier contenido"
                aria-label="Body raw"
                className="min-h-32 font-mono text-footnote"
              />
              <div className="w-64">
                <Field label="Content-Type" htmlFor="rb-raw-ct">
                  <Input
                    id="rb-raw-ct"
                    value={state.rawContentType}
                    onChange={(event) => update({ rawContentType: event.target.value })}
                    placeholder="text/plain"
                    className="h-8 font-mono text-caption"
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {state.bodyType === 'binary' ? (
            <div className="space-y-2">
              <Button variant="secondary" size="sm" onClick={() => binaryRef.current?.click()}>
                <FileUp />
                Seleccionar archivo binario
              </Button>
              <input
                ref={binaryRef}
                type="file"
                className="hidden"
                onChange={(event) => {
                  void pickBinary(event.target.files?.[0] ?? null);
                  event.target.value = '';
                }}
              />
              <p className="text-caption text-fg-subtle">
                {state.binaryName
                  ? `${state.binaryName} · ${formatBytes(state.binarySize)}`
                  : 'Ningún archivo seleccionado.'}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
            Response
          </CardTitle>

          {response ? (
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => void copy('body')}>
                <Copy />
                Body
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void copy('url')}>
                URL
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void copy('meta')}>
                Meta
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void copy('curl')}>
                cURL
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void copy('all')}>
                Todo
              </Button>
            </div>
          ) : null}
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="text-footnote text-fg-subtle">
              <Play className="mr-1 inline size-3" />
              Enviando…
            </p>
          ) : error ? (
            <p className="rounded-md bg-fail-soft px-3 py-2 text-footnote text-fail">{error}</p>
          ) : !response ? (
            <p className="text-footnote text-fg-subtle">
              Sin respuesta todavía. Tocá <strong>Send</strong> para ejecutar.
            </p>
          ) : (
            <ResponseView response={response} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KvEditor({
  rows,
  onChange,
  addLabel,
  label,
}: {
  rows: KvRow[];
  onChange: (rows: KvRow[]) => void;
  addLabel: string;
  label: string;
}) {
  const setRow = (index: number, patch: Partial<KvRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-1.5">
      {rows.length === 0 ? (
        <p className="text-caption text-fg-subtle">Sin filas.</p>
      ) : (
        rows.map((row, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={row.enabled}
              onChange={(event) => setRow(index, { enabled: event.target.checked })}
              aria-label={`${label}: habilitar fila ${index + 1}`}
              className="size-3.5 shrink-0 accent-[var(--color-brand)]"
            />
            <Input
              value={row.key}
              onChange={(event) => setRow(index, { key: event.target.value })}
              placeholder="key"
              aria-label={`${label}: clave ${index + 1}`}
              className="h-8 flex-1 font-mono text-caption"
            />
            <Input
              value={row.value}
              onChange={(event) => setRow(index, { value: event.target.value })}
              placeholder="value"
              aria-label={`${label}: valor ${index + 1}`}
              className="h-8 flex-1 font-mono text-caption"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7 shrink-0 text-fail"
              aria-label={`${label}: eliminar fila ${index + 1}`}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              <X />
            </Button>
          </div>
        ))
      )}

      <Button variant="ghost" size="sm" onClick={() => onChange([...rows, emptyKv()])}>
        <Plus />
        {addLabel}
      </Button>
    </div>
  );
}

function ResponseView({ response }: { response: ExecResponse }) {
  const contentType =
    response.headers['content-type'] ?? response.headers['Content-Type'] ?? '';
  const isBinary = /^(image|video|audio)\//.test(contentType) || /pdf|octet-stream/.test(contentType);

  const jsonBody = useMemo(() => {
    if (isBinary) return null;
    try {
      return JSON.parse(response.body) as unknown;
    } catch {
      return null;
    }
  }, [response.body, isBinary]);

  const downloadBinary = () => {
    const blob = new Blob([response.body], { type: contentType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'response';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE(response.status)}>
          {response.status} {response.statusText}
        </Badge>
        <span className="text-caption text-fg-subtle">
          {response.timeMs} ms · {formatBytes(response.sizeBytes)}
          {response.truncated ? ' · truncado a 5 MB' : ''}
        </span>
      </div>

      <details className="rounded-md border border-border bg-surface-2 px-3 py-2">
        <summary className="cursor-pointer text-caption font-semibold text-fg-muted">
          Headers ({Object.keys(response.headers).length})
        </summary>
        <pre className="scrollbar-apple mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-caption text-fg-muted">
          {Object.entries(response.headers)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n')}
        </pre>
      </details>

      {isBinary ? (
        <div className="space-y-2">
          <p className="text-footnote text-fg-muted">
            Respuesta binaria ({contentType}). Descargala para abrirla.
          </p>
          <Button variant="secondary" size="sm" onClick={downloadBinary}>
            <Download />
            Descargar respuesta
          </Button>
        </div>
      ) : jsonBody !== null ? (
        <JsonView value={jsonBody} className="scrollbar-apple max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface-2 p-3 font-mono text-caption leading-relaxed" />
      ) : (
        <pre className="scrollbar-apple max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface-2 p-3 font-mono text-caption text-fg">
          {response.body || '(sin body)'}
        </pre>
      )}
    </div>
  );
}
