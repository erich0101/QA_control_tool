import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { SelectField } from '@/components/ui/select-field';
import type { Attachment, TestCase } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface EvidenceSectionProps {
  testCase: TestCase;
  isUploading: boolean;
  onUpload: (file: File, category: string) => void;
  onDelete: (attachment: Attachment) => void;
}

const CATEGORIES = [
  { value: 'GENERAL', label: 'General' },
  { value: 'FIGMA', label: 'Figma' },
  { value: 'DEV', label: 'Sistema' },
  { value: 'BUG', label: 'Error' },
];

const CATEGORY_STYLES: Record<string, string> = {
  GENERAL: 'bg-fill text-fg-muted',
  FIGMA: 'bg-accent/20 text-accent',
  DEV: 'bg-brand-soft text-brand',
  BUG: 'bg-fail-soft text-fail',
};

/**
 * Evidencias de la ejecución: click, drag&drop o pegar (Ctrl+V).
 * Antes esto era un bloque de ~120 líneas con handlers globales de `paste`.
 */
export function EvidenceSection({ testCase, isUploading, onUpload, onDelete }: EvidenceSectionProps) {
  const confirm = useConfirm();
  const [category, setCategory] = useState('GENERAL');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const attachments = testCase.attachments ?? [];

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast.warning('Solo se permiten imágenes o videos');
      return;
    }

    onUpload(file, category);
  };

  // Pegar desde el portapapeles mientras el detalle está abierto.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            onUpload(file, category);
            toast.success('Evidencia pegada');
          }
          break;
        }
      }
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [category, onUpload]);

  const handleDelete = async (attachment: Attachment) => {
    const ok = await confirm({
      title: 'Eliminar evidencia',
      description: '¿Eliminar esta evidencia adjunta? No se puede deshacer.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (ok) onDelete(attachment);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
          Evidencias ({attachments.length})
        </span>
        <div className="w-36">
          <SelectField
            value={category}
            onValueChange={setCategory}
            options={CATEGORIES}
            aria-label="Categoría de la evidencia"
          />
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-footnote transition-colors',
          dragging
            ? 'border-brand bg-brand-soft text-brand'
            : 'border-border text-fg-muted hover:border-brand hover:bg-brand-soft/40',
          isUploading && 'pointer-events-none opacity-60',
        )}
      >
        <Upload className="size-4" />
        {isUploading ? 'Subiendo…' : 'Pegá (Ctrl+V), arrastrá o hacé clic para adjuntar'}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {attachments.length === 0 ? (
        <p className="py-2 text-center text-caption text-fg-subtle">Sin evidencias adjuntas</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((attachment) => {
            const categoryLabel = (attachment.category ?? 'GENERAL').toUpperCase();
            return (
              <li
                key={attachment.id}
                className="group relative w-32 overflow-hidden rounded-lg border border-border bg-surface"
              >
                {/\.(mp4|webm|mov)$/i.test(attachment.src) ? (
                  <video src={`/${attachment.src}`} className="h-20 w-full object-cover" controls />
                ) : (
                  <a href={`/${attachment.src}`} target="_blank" rel="noopener noreferrer">
                    <img
                      src={`/${attachment.src}`}
                      alt={`Evidencia ${categoryLabel}`}
                      className="h-20 w-full object-cover"
                      loading="lazy"
                    />
                  </a>
                )}

                <span
                  className={cn(
                    'absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-bold',
                    CATEGORY_STYLES[categoryLabel] ?? CATEGORY_STYLES.GENERAL,
                  )}
                >
                  {categoryLabel}
                </span>

                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  className="absolute right-1 top-1 size-6 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Eliminar evidencia"
                  onClick={(event) => {
                    event.preventDefault();
                    handleDelete(attachment);
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {attachments.length === 0 ? (
        <p className="flex items-center justify-center gap-1 text-caption text-fg-subtle">
          <ImagePlus className="size-3" /> Las capturas se guardan contra la ejecución del test.
        </p>
      ) : null}
    </div>
  );
}
