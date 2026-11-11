import { useState } from 'react';
import { Controller, useWatch, type Control, type UseFormRegister } from 'react-hook-form';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink, Eye, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import type { StoryFormValues } from '../../lib/story-form';

interface DocumentationTabProps {
  control: Control<StoryFormValues>;
  register: UseFormRegister<StoryFormValues>;
}

export function DocumentationTab({ control, register }: DocumentationTabProps) {
  const [editing, setEditing] = useState(false);
  const url = useWatch({ control, name: 'doc_url' });
  const markdown = useWatch({ control, name: 'doc_md' });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-footnote font-semibold text-fg-muted">Documentación base</h3>
        <Button variant="ghost" size="sm" onClick={() => setEditing((value) => !value)}>
          {editing ? <Eye /> : <Pencil />}
          {editing ? 'Vista' : 'Editar'}
        </Button>
      </div>

      <Field label="Link a documentación" htmlFor="doc-url">
        {editing ? (
          <Input id="doc-url" placeholder="https://…" {...register('doc_url')} />
        ) : url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-brand hover:underline"
          >
            <ExternalLink className="size-3.5 shrink-0" />
            <span className="break-all">{url}</span>
          </a>
        ) : (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-footnote italic text-fg-subtle">
            Sin enlace. Usá “Editar” para agregar uno.
          </p>
        )}
      </Field>

      <Field
        label="Documentación (Markdown)"
        htmlFor="doc-md"
        hint={editing ? 'Se guarda junto con el resto de los cambios de la HU.' : undefined}
      >
        {editing ? (
          <Controller
            control={control}
            name="doc_md"
            render={({ field }) => (
              <div className="grid gap-3 lg:grid-cols-2">
                <Textarea
                  id="doc-md"
                  value={field.value}
                  onChange={field.onChange}
                  className="min-h-64 font-mono text-footnote"
                  placeholder="# Título&#10;&#10;Escribí la documentación en Markdown…"
                />
                <div className="markdown scrollbar-apple min-h-64 overflow-y-auto rounded-md border border-border bg-surface p-4">
                  {field.value ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{field.value}</ReactMarkdown>
                  ) : (
                    <p className="text-footnote italic text-fg-subtle">Vista previa vacía…</p>
                  )}
                </div>
              </div>
            )}
          />
        ) : (
          <div className="markdown rounded-md border border-border bg-surface p-4">
            {markdown ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            ) : (
              <p className="text-footnote italic text-fg-subtle">
                Sin documentación. Usá “Editar” para agregar contenido.
              </p>
            )}
          </div>
        )}
      </Field>
    </div>
  );
}
