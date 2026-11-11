import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Project } from '@/lib/api/types';
import { useCreateProject, useUpdateProject } from './use-projects';

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si viene un proyecto, el diálogo edita; si no, crea. */
  project?: Project | null;
}

interface ProjectForm {
  name: string;
  description: string;
}

/**
 * Un solo diálogo para crear y editar proyectos.
 * Antes eran dos flujos distintos (modal 'new-project' y modal 'prompt'),
 * cada uno con su propio HTML y manejo de errores.
 */
export function ProjectDialog({ open, onOpenChange, project }: ProjectDialogProps) {
  const isEdit = Boolean(project);
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const isPending = createProject.isPending || updateProject.isPending;

  const { register, handleSubmit, reset, formState } = useForm<ProjectForm>({
    defaultValues: { name: '', description: '' },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: project?.name ?? '',
      description: (project?.description as string | undefined) ?? '',
    });
  }, [open, project, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit && project) {
        await updateProject.mutateAsync({
          id: project.id,
          input: { name: values.name.trim(), description: values.description.trim() },
        });
      } else {
        await createProject.mutateAsync({
          name: values.name.trim(),
          description: values.description.trim(),
        });
      }
      onOpenChange(false);
    } catch {
      // Los hooks ya muestran el toast de error.
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar proyecto' : 'Nuevo proyecto'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Actualizá el nombre o la descripción del proyecto.'
              : 'Los proyectos agrupan casos de uso, suites y ejecuciones.'}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Nombre</Label>
            <Input
              id="project-name"
              autoFocus
              placeholder="Ej: RAFAM2"
              aria-invalid={Boolean(formState.errors.name)}
              {...register('name', { required: 'El nombre es obligatorio' })}
            />
            {formState.errors.name ? (
              <p className="text-caption text-fail">{formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-description">Descripción</Label>
            <Textarea
              id="project-description"
              placeholder="Opcional"
              {...register('description')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              {isEdit ? 'Guardar cambios' : 'Crear proyecto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
