import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { JiraTokenPanel } from './components/jira-token-panel';

interface JiraTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number | null;
}

/**
 * Acceso directo a "Mi token" desde el menú de usuario: el token es personal
 * y hace falta para cualquier acción de Jira (crear tickets, ver seguimiento),
 * aunque el usuario no pueda configurar el dominio/key del proyecto.
 */
export function JiraTokenDialog({ open, onOpenChange, projectId }: JiraTokenDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mi token de Jira</DialogTitle>
          <DialogDescription>
            Credenciales personales para el proyecto activo. El token se guarda cifrado.
          </DialogDescription>
        </DialogHeader>

        <JiraTokenPanel
          projectId={projectId}
          onSaved={() => onOpenChange(false)}
          onDeleted={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
