import type { UserStory } from '@/lib/api/types';
import type { UserStoryPatch } from '@/lib/api/use-cases';
import { parseDocumentation, serializeDocumentation } from './documentation';

/** Modelo plano del formulario de detalle de una HU. */
export interface StoryFormValues {
  title: string;
  status: string;
  priority: string;
  hu_detallada: string;
  escenarios_prueba: string;
  reglas_negocio: string;
  precondiciones: string;
  doc_url: string;
  doc_md: string;
}

export function storyToForm(story: UserStory): StoryFormValues {
  const doc = parseDocumentation(story.link_documentacion);

  return {
    title: story.title ?? '',
    status: story.status ?? 'En Análisis',
    priority: story.priority ?? 'Media',
    hu_detallada: story.hu_detallada ?? '',
    escenarios_prueba: story.escenarios_prueba ?? '',
    reglas_negocio: story.reglas_negocio ?? '',
    precondiciones: story.precondiciones ?? '',
    doc_url: doc.url,
    doc_md: doc.md,
  };
}

type DirtyFields = Partial<Record<keyof StoryFormValues, boolean>>;

/**
 * Construye el patch con SOLO los campos modificados.
 * La UI legacy mandaba todos los campos scrapeados del DOM en cada guardado.
 */
export function buildStoryPatch(values: StoryFormValues, dirty: DirtyFields): UserStoryPatch {
  const patch: UserStoryPatch = {};

  if (dirty.title) patch.title = values.title.trim();
  if (dirty.status) patch.status = values.status;
  if (dirty.priority) patch.priority = values.priority;
  if (dirty.hu_detallada) patch.hu_detallada = values.hu_detallada;
  if (dirty.escenarios_prueba) patch.escenarios_prueba = values.escenarios_prueba;
  if (dirty.reglas_negocio) patch.reglas_negocio = values.reglas_negocio;
  if (dirty.precondiciones) patch.precondiciones = values.precondiciones;

  if (dirty.doc_url || dirty.doc_md) {
    patch.link_documentacion = serializeDocumentation({
      url: values.doc_url,
      md: values.doc_md,
    });
  }

  return patch;
}
