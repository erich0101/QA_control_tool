import { useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Copy, Download, FileUp, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  bytesToBase64,
  decodeText,
  downloadBlob,
  encodeText,
  formatBytes,
  readFileAsBytes,
} from '../lib/base64';

type Mode = 'encode' | 'decode';

export function Base64Tool() {
  const [mode, setMode] = useState<Mode>('encode');
  const [urlSafe, setUrlSafe] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const result = useMemo(() => {
    try {
      if (mode === 'encode') {
        const output = fileBytes
          ? bytesToBase64(fileBytes, urlSafe)
          : encodeText(text, urlSafe);
        return { ok: true as const, text: output, bytes: null };
      }

      // Decode: el archivo se interpreta como texto que contiene el Base64.
      const source = fileBytes ? new TextDecoder().decode(fileBytes) : text;
      const decoded = decodeText(source);

      if (!decoded.ok) {
        // Puede ser Base64 válido cuyo contenido no es UTF-8 (binario).
        try {
          const raw = atob(source.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, ''));
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
          return { ok: true as const, text: '', bytes };
        } catch {
          return { ok: false as const, error: decoded.error, bytes: null };
        }
      }

      return { ok: true as const, text: decoded.text, bytes: null };
    } catch (error) {
      return { ok: false as const, error: (error as Error).message, bytes: null };
    }
  }, [mode, text, fileBytes, urlSafe]);

  const selectFile = async (selected: File | null) => {
    if (!selected) return;
    if (selected.size > 10 * 1024 * 1024) {
      toast.warning('El archivo supera los 10 MB');
      return;
    }
    setFile(selected);
    setFileBytes(await readFileAsBytes(selected));
  };

  const clear = () => {
    setText('');
    setFile(null);
    setFileBytes(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const copyOutput = async () => {
    if (!result.ok || !result.text) return;
    await navigator.clipboard.writeText(result.text);
    toast.success('Resultado copiado');
  };

  const downloadOutput = () => {
    if (!result.ok) return;

    if (mode === 'encode') {
      downloadBlob(new Blob([result.text], { type: 'text/plain;charset=utf-8' }), 'base64.txt');
      return;
    }

    if (result.bytes) {
      downloadBlob(new Blob([result.bytes], { type: 'application/octet-stream' }), 'decodificado.bin');
      return;
    }

    downloadBlob(new Blob([result.text], { type: 'text/plain;charset=utf-8' }), 'decodificado.txt');
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-title3 font-semibold text-fg">Base64</h2>
        <p className="text-footnote text-fg-muted">
          Codificá o decodificá texto y archivos (hasta 10 MB). Todo se procesa en el navegador.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-full bg-fill p-1">
          {(
            [
              { id: 'encode', label: 'Codificar' },
              { id: 'decode', label: 'Decodificar' },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setMode(option.id)}
              aria-pressed={mode === option.id}
              className={cn(
                'rounded-full px-4 py-1 text-caption font-semibold transition-colors',
                mode === option.id ? 'bg-brand text-white' : 'text-fg-muted hover:text-fg',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {mode === 'encode' ? (
          <label className="flex cursor-pointer items-center gap-2 text-footnote text-fg-muted">
            <input
              type="checkbox"
              checked={urlSafe}
              onChange={(event) => setUrlSafe(event.target.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />
            URL-safe (<code className="font-mono text-caption">-</code> y <code className="font-mono text-caption">_</code>)
          </label>
        ) : null}

        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
            <FileUp />
            {file ? 'Cambiar archivo' : 'Usar archivo'}
          </Button>
          <Button variant="ghost" size="sm" onClick={clear}>
            <Trash2 />
            Limpiar
          </Button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              void selectFile(event.target.files?.[0] ?? null);
              event.target.value = '';
            }}
          />
        </div>
      </div>

      {file ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-footnote">
          <span className="font-medium text-fg">{file.name}</span>
          <span className="text-caption text-fg-subtle">{formatBytes(file.size)}</span>
          <span className="ml-auto text-caption text-fg-subtle">
            {mode === 'encode' ? 'Se codifica el contenido binario' : 'Se decodifica el texto del archivo'}
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              {mode === 'encode' ? 'Texto a codificar' : 'Base64 a decodificar'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                mode === 'encode'
                  ? 'Escribí o pegá el texto…'
                  : 'Pegá el Base64 (por ejemplo eyJhbGciOi…)'
              }
              aria-label={mode === 'encode' ? 'Texto a codificar' : 'Base64 a decodificar'}
              className="min-h-64 resize-y p-3 font-mono text-footnote"
              disabled={Boolean(file)}
            />
            <p className="mt-1 text-caption text-fg-subtle">
              {text.length} caracteres
              {mode === 'encode' ? ` · ${new TextEncoder().encode(text).length} bytes` : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              Resultado
            </CardTitle>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Copiar resultado"
                onClick={copyOutput}
                disabled={!result.ok || !result.text}
              >
                <Copy />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Descargar resultado"
                onClick={downloadOutput}
                disabled={!result.ok}
              >
                <Download />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!result.ok ? (
              <p className="rounded-md bg-fail-soft px-3 py-2 text-footnote text-fail">{result.error}</p>
            ) : result.bytes ? (
              <div className="space-y-2">
                <p className="text-footnote text-fg-muted">
                  Contenido binario ({formatBytes(result.bytes.length)}). Descargalo para abrirlo.
                </p>
                <Button variant="secondary" size="sm" onClick={downloadOutput}>
                  <Download />
                  Descargar binario
                </Button>
              </div>
            ) : (
              <Textarea
                readOnly
                value={result.text}
                aria-label="Resultado"
                placeholder="El resultado aparece acá…"
                className="min-h-64 resize-y bg-surface-2 p-3 font-mono text-footnote"
              />
            )}

            {result.ok ? (
              <p className="mt-1 flex items-center gap-1 text-caption text-fg-subtle">
                <ArrowLeftRight className="size-3" />
                {result.bytes
                  ? `${formatBytes(result.bytes.length)} decodificados`
                  : `${result.text.length} caracteres`}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
