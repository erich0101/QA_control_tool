import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Reemplazo de `modalManager.confirm` de la UI legacy.
 * Un solo diálogo para toda la app: `const ok = await confirm({...})`.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(
    null,
  );
  const requestRef = useRef(request);
  requestRef.current = request;

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setRequest({ options, resolve })),
    [],
  );

  const settle = useCallback((value: boolean) => {
    requestRef.current?.resolve(value);
    setRequest(null);
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog open={request !== null} onOpenChange={(open) => (!open ? settle(false) : undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{request?.options.title}</DialogTitle>
            {request?.options.description ? (
              <DialogDescription className="whitespace-pre-line">
                {request.options.description}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => settle(false)}>
              {request?.options.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button
              variant={request?.options.destructive ? 'destructive' : 'primary'}
              onClick={() => settle(true)}
            >
              {request?.options.confirmLabel ?? 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>');
  return context;
}
