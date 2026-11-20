import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { SelectField } from '@/components/ui/select-field';
import type { UseCase } from '@/lib/api/types';
import {
  matrixImportApi,
  type MatrixImportOptions,
  type MatrixImportPreview,
} from '@/lib/api/matrix-import';

interface MatrixImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number | null;
  useCases: UseCase[];
  onImported: () => void | Promise<void>;
}

type Destination = 'create' | 'existing_cu';

/**
 * Importación de matrices QA desde proyecto.
 * Preview primero, sin escribir; el commit se habilita recién con la
 * validación y los mapeos de CU resueltos.
 */
export function MatrixImportDialog({
  open,
  onOpenChange,
  projectId,
  useCases,
  onImported,
}: MatrixImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MatrixImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  const [destination, setDestination] = useState<Destination>('create');
  const [existingUseCaseId, setExistingUseCaseId] = useState('');
  const [conflictPolicy, setConflictPolicy] = useState<'skip' | 'update'>('skip');
  const [cuMapping, setCuMapping] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreview(null);
    setError(null);
    setDestination('create');
    setExistingUseCaseId('');
    setConflictPolicy('skip');
    setCuMapping({});
  }, [open]);

  const invalidCuValues = useMemo(
    () => (preview?.use_case_values ?? []).filter((value) => !value.valid),
    [preview],
  );

  const mappingComplete = invalidCuValues.every((value) => Boolean(cuMapping[value.raw]));

  const options = (): MatrixImportOptions => ({
    create_use_cases: destination === 'create',
    // En Test Suites el vínculo CU-HU-TC es obligatorio.
    create_user_stories: true,
    group_by_hu: true,
    existing_use_case_id:
      destination === 'existing_cu' && existingUseCaseId ? Number(existingUseCaseId) : null,
    conflict_policy: conflictPolicy,
    cu_mapping:
      destination === 'create'
        ? Object.fromEntries(
            Object.entries(cuMapping)
              .filter(([, value]) => value)
              .map(([raw, value]) => [raw, { use_case_id: Number(value) }]),
          )
        : {},
  });

  const pickFile = (next: File | null) => {
    setFile(next);
    setPreview(null);
    setError(null);
  };

  const runPreview = async () => {
    if (!projectId || !file) {
      toast.warning('Seleccioná un archivo de matriz primero');
      return;
    }
    if (destination === 'existing_cu' && !existingUseCaseId) {
      toast.warning('Seleccioná el CU existente');
      return;
    }

    setIsPreviewing(true);
    setError(null);
    try {
      const result = await matrixImportApi.preview(projectId, file, options());
      setPreview(result);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'No se pudo analizar la matriz');
    } finally {
      setIsPreviewing(false);
    }
  };

  const nonCuErrors = preview?.errors.filter((issue) => issue.field !== 'CU Vinculado') ?? [];
  const hasBlockingErrors =
    nonCuErrors.length > 0 || (invalidCuValues.length > 0 && !mappingComplete);

  const commit = async () => {
    if (!projectId || !file) return;
    if (hasBlockingErrors) {
      toast.warning('Resolvé los errores o mapeos pendientes antes de importar');
      return;
    }

    setIsCommitting(true);
    setError(null);
    try {
      const result = await matrixImportApi.commit(projectId, file, options());
      const { test_cases: tests, use_cases: cus, user_stories: stories } = result.summary;
      toast.success(
        `Importación completada: ${tests.create} TC, ${cus} CU, ${stories} HU`,
      );
      await onImported();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo importar la matriz');
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar matriz de pruebas</DialogTitle>
          <DialogDescription>
            Primero se analiza el archivo sin escribir en la base. Después confirmás la
            importación con los vínculos CU/HU y la política de conflictos elegida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload />
                Seleccionar archivo
              </Button>
              <span className="text-footnote text-fg-muted">
                {file ? file.name : 'Formatos: .xlsx o .csv'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  event.target.value = '';
                  pickFile(next);
                }}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Destino" htmlFor="matrix-destination">
              <SelectField
                id="matrix-destination"
                value={destination}
                onValueChange={(value) => {
                  setDestination(value as Destination);
                  setPreview(null);
                }}
                options={[
                  { value: 'create', label: 'Crear CU y HU desde la matriz' },
                  { value: 'existing_cu', label: 'Usar un CU existente' },
                ]}
              />
            </Field>

            <Field label="Conflictos de TC" htmlFor="matrix-conflicts">
              <SelectField
                id="matrix-conflicts"
                value={conflictPolicy}
                onValueChange={(value) => setConflictPolicy(value as 'skip' | 'update')}
                options={[
                  { value: 'skip', label: 'Omitir TC existentes' },
                  { value: 'update', label: 'Actualizar TC existentes' },
                ]}
              />
            </Field>

            {destination === 'existing_cu' ? (
              <Field label="CU existente" htmlFor="matrix-existing-cu">
                <SelectField
                  id="matrix-existing-cu"
                  value={existingUseCaseId}
                  onValueChange={(value) => {
                    setExistingUseCaseId(value);
                    setPreview(null);
                  }}
                  allowEmpty
                  placeholder="Seleccionar CU"
                  options={useCases.map((item) => ({
                    value: String(item.id),
                    label: `${item.key_id} · ${item.title}`,
                  }))}
                />
              </Field>
            ) : null}

          </div>

          <div className="rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-caption text-fg-muted">
            <strong className="text-fg">Vínculo obligatorio:</strong> en Test Suites cada TC debe
            quedar asociado a un CU/Módulo y a una HU/Feature. La importación crea una suite por
            HU y no permite importar TC sueltos.
          </div>

          <Button
            variant="secondary"
            onClick={runPreview}
            loading={isPreviewing}
            disabled={!file}
          >
            <FileSpreadsheet />
            Analizar matriz
          </Button>

          {error ? (
            <div className="rounded-md border border-fail/30 bg-fail-soft px-3 py-2 text-footnote text-fail">
              {error}
            </div>
          ) : null}

          {preview ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="Filas" value={preview.summary.rows} />
                <SummaryCard label="CU detectados" value={preview.summary.use_cases} />
                <SummaryCard label="HU detectadas" value={preview.summary.user_stories} />
                <SummaryCard label="TC a importar" value={preview.summary.test_cases.total} />
              </div>

              <div className="flex flex-wrap gap-2 text-caption">
                <Badge tone={preview.errors.length > 0 ? 'fail' : 'ok'}>
                  {preview.errors.length} error(es)
                </Badge>
                <Badge tone={preview.warnings.length > 0 ? 'warn' : 'neutral'}>
                  {preview.warnings.length} advertencia(s)
                </Badge>
                <Badge tone="brand">{preview.summary.suites_to_create} suite(s) a crear</Badge>
              </div>

              {preview.errors.length > 0 ? (
                <div className="rounded-md border border-fail/30 bg-fail-soft p-3">
                  <p className="flex items-center gap-2 text-footnote font-semibold text-fail">
                    <AlertTriangle className="size-4" />
                    Errores que bloquean la importación
                  </p>
                  <ul className="mt-2 space-y-1 text-caption text-fail">
                    {preview.errors.slice(0, 12).map((issue, index) => (
                      <li key={`${issue.row ?? 'global'}-${index}`}>
                        {issue.row ? `Fila ${issue.row}: ` : ''}
                        {issue.field ? `${issue.field}: ` : ''}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                  {preview.errors.length > 12 ? (
                    <p className="mt-1 text-caption text-fail">
                      … y {preview.errors.length - 12} error(es) más.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {destination === 'create' && invalidCuValues.length > 0 ? (
                <div className="space-y-2 rounded-md border border-warn/40 bg-warn-soft p-3">
                  <p className="text-footnote font-semibold text-warn">
                    CU con formato inválido: elegí un CU existente para continuar
                  </p>
                  {invalidCuValues.map((value) => (
                    <div key={value.raw} className="grid gap-2 sm:grid-cols-[1fr_minmax(0,320px)]">
                      <div className="min-w-0">
                        <p className="truncate text-caption font-medium text-fg" title={value.raw}>
                          {value.raw || '(vacío)'}
                        </p>
                        <p className="text-caption text-fg-subtle">{value.count} fila(s)</p>
                      </div>
                      <SelectField
                        value={cuMapping[value.raw] ?? ''}
                        onValueChange={(selected) =>
                          setCuMapping((current) => ({ ...current, [value.raw]: selected }))
                        }
                        allowEmpty
                        placeholder="Seleccionar CU existente"
                        options={useCases.map((item) => ({
                          value: String(item.id),
                          label: `${item.key_id} · ${item.title}`,
                        }))}
                        aria-label={`Mapear CU ${value.raw}`}
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              {preview.use_case_values.some((value) => value.valid) ? (
                <details className="rounded-md border border-border p-3">
                  <summary className="cursor-pointer text-footnote font-semibold text-fg-muted">
                    Ver CU/HU detectados
                  </summary>
                  <div className="mt-2 space-y-1 text-caption text-fg-muted">
                    {preview.use_case_values.map((value) => (
                      <p key={`cu-${value.raw}`}>
                        <strong>{value.key || '—'}</strong> · {value.title || value.raw} ·{' '}
                        {value.count} fila(s)
                      </p>
                    ))}
                    {preview.user_story_values.map((value) => (
                      <p key={`hu-${value.key || value.title}`}>
                        HU <strong>{value.key || '—'}</strong> · {value.title || '—'} ·{' '}
                        {value.count} fila(s)
                      </p>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={commit}
            loading={isCommitting}
            disabled={!preview || !file || isPreviewing || hasBlockingErrors}
          >
            <Upload />
            Importar matriz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
      <p className="text-caption font-semibold uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className="text-lg font-bold text-fg">{value}</p>
    </div>
  );
}
