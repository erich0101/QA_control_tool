import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import type { EvidenceItem } from '@/lib/api/types';

interface EvidencePanelProps {
  items: EvidenceItem[];
  isLoading?: boolean;
  isUploading?: boolean;
  onUpload: (file: File, category: string) => void;
  onDelete: (item: EvidenceItem) => void;
}

const CATEGORIES = [
  { value: 'GENERAL', label: 'General' },
  { value: 'FIGMA', label: 'Figma' },
  { value: 'DEV', label: 'Sistema' },
  { value: 'BUG', label: 'Error' },
];

/** Galería de evidencias de un hallazgo o sugerencia. */
export function EvidencePanel({
  items,
  isLoading,
  isUploading,
  onUpload,
  onDelete,
}: EvidencePanelProps) {
  const confirm = useConfirm();
  const [category, setCategory] = useState('GENERAL');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.warning('Solo se permiten imágenes en hallazgos y sugerencias');
      return;
    }
    onUpload(file, category);
  };

  const handleDelete = async (item: EvidenceItem) => {
    const ok = await confirm({
      title: 'Eliminar evidencia',
      description: '¿Eliminar esta captura? No se puede deshacer.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (ok) onDelete(item);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
          Evidencias ({items.length})
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

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={isUploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload />
          Agregar captura
        </Button>
        <span className="text-caption text-fg-subtle">Los archivos se guardan al instante.</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            for (const file of Array.from(event.target.files ?? [])) handleFile(file);
            event.target.value = '';
          }}
        />
      </div>

      {isLoading ? (
        <div className="flex gap-2">
          <Skeleton className="size-24" />
          <Skeleton className="size-24" />
        </div>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-1 py-2 text-caption text-fg-subtle">
          <ImagePlus className="size-3" />
          Sin evidencias adjuntas.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="group relative w-28 overflow-hidden rounded-lg border border-border bg-surface"
            >
              <a href={`/api/evidence/${item.id}`} target="_blank" rel="noopener noreferrer">
                <img
                  src={`/api/evidence/${item.id}`}
                  alt={item.file_name}
                  className="h-20 w-full object-cover"
                  loading="lazy"
                />
              </a>
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {item.evidence_category ?? 'GENERAL'}
              </span>
              <Button
                type="button"
                variant="destructive"
                size="icon-sm"
                className="absolute right-1 top-1 size-6 opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Eliminar evidencia"
                onClick={() => handleDelete(item)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
