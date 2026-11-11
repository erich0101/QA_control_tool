import { useState } from 'react';
import { Check, Copy, Download, Dice5, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SelectField } from '@/components/ui/select-field';
import { cn } from '@/lib/utils';
import {
  CUIT_PREFIXES,
  cuitToCsv,
  formatCuit,
  generateCuits,
  isValidCuit,
} from '../lib/cuit';

const PRESETS = [1, 5, 10, 100, 1000];
const MAX_VISIBLE = 100;

const PREFIX_OPTIONS = [
  { value: 'random', label: 'Aleatorio (20/24/27/30/34)' },
  ...CUIT_PREFIXES.map((prefix) => ({ value: String(prefix), label: String(prefix) })),
];

export function CuitTool() {
  const [quantity, setQuantity] = useState('1');
  const [prefix, setPrefix] = useState('random');
  const [results, setResults] = useState<string[]>([]);

  const generate = () => {
    const amount = Number(quantity);

    if (!Number.isFinite(amount) || amount < 1) {
      toast.warning('Ingresá una cantidad válida (1 a 50.000)');
      return;
    }

    const cuits = generateCuits(amount, prefix === 'random' ? undefined : Number(prefix));
    setResults(cuits);

    if (cuits.length < amount) {
      toast.warning(`Se generaron ${cuits.length} de ${amount} (no se pudieron evitar duplicados)`);
    }
  };

  const copyOne = async (cuit: string) => {
    await navigator.clipboard.writeText(cuit);
    toast.success('CUIT copiado');
  };

  const copyAll = async () => {
    await navigator.clipboard.writeText(results.join('\n'));
    toast.success(`${results.length} CUITs copiados`);
  };

  const downloadCsv = () => {
    const blob = new Blob([cuitToCsv(results)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cuits-${results.length}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  // Validamos todos hasta 5.000; arriba de eso, una muestra.
  const sample = results.length > 5000 ? results.slice(0, 5000) : results;
  const allValid = sample.length > 0 && sample.every(isValidCuit);
  const visible = results.slice(0, MAX_VISIBLE);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-title3 font-semibold text-fg">CUIT Generator</h2>
        <p className="text-footnote text-fg-muted">
          Genera CUITs válidos con dígito verificador módulo 11. Procesamiento 100% local.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <Field label="Cantidad" htmlFor="cuit-qty" hint="1 – 50.000">
            <Input
              id="cuit-qty"
              type="number"
              min={1}
              max={50000}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="h-9 w-28"
            />
          </Field>

          <Field label="Prefijo" htmlFor="cuit-prefix">
            <SelectField
              id="cuit-prefix"
              value={prefix}
              onValueChange={setPrefix}
              options={PREFIX_OPTIONS}
              className="w-64"
            />
          </Field>

          <div className="flex items-center gap-1">
            {PRESETS.map((preset) => (
              <Button
                key={preset}
                variant="ghost"
                size="sm"
                onClick={() => setQuantity(String(preset))}
              >
                {preset.toLocaleString('es-AR')}
              </Button>
            ))}
          </div>

          <div className="ml-auto">
            <Button variant="primary" onClick={generate}>
              <Dice5 />
              Generar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
            Resultados
          </CardTitle>

          {results.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={allValid ? 'ok' : 'fail'}>
                <Check className="size-3" />
                {allValid ? 'Todos válidos' : 'Hay inválidos'}
              </Badge>
              <Badge tone="neutral">
                {results.length} {results.length === 1 ? 'CUIT' : 'CUITs'}
              </Badge>
              <Button variant="ghost" size="sm" onClick={copyAll}>
                <Copy />
                Copiar todos
              </Button>
              <Button variant="secondary" size="sm" onClick={downloadCsv}>
                <Download />
                Descargar CSV
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Limpiar" onClick={() => setResults([])}>
                <Trash2 />
              </Button>
            </div>
          ) : null}
        </CardHeader>

        <CardContent>
          {results.length === 0 ? (
            <p className="py-8 text-center text-footnote text-fg-subtle">
              Ingresá una cantidad y tocá <strong>Generar</strong> para crear CUITs válidos.
            </p>
          ) : (
            <>
              <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((cuit, index) => (
                  <li
                    key={cuit}
                    className={cn(
                      'group flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5',
                    )}
                  >
                    <span className="w-10 shrink-0 font-mono text-[10px] text-fg-subtle">
                      #{String(index + 1).padStart(4, '0')}
                    </span>
                    <span className="flex-1 font-mono text-footnote text-fg">
                      {formatCuit(cuit)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-6 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={`Copiar ${cuit}`}
                      onClick={() => void copyOne(cuit)}
                    >
                      <Copy />
                    </Button>
                  </li>
                ))}
              </ul>

              {results.length > MAX_VISIBLE ? (
                <p className="mt-3 text-center text-caption text-fg-subtle">
                  Mostrando los primeros {MAX_VISIBLE} de {results.length.toLocaleString('es-AR')}. Usá
                  "Descargar CSV" para obtenerlos todos.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
