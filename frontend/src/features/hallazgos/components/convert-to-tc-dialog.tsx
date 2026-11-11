import { useState } from 'react';
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
import type { TestSuite } from '@/lib/api/types';

interface ConvertToTcDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suites: TestSuite[];
  isPending?: boolean;
  onConvert: (suiteId: number) => Promise<void>;
}

export function ConvertToTcDialog({
  open,
  onOpenChange,
  suites,
  isPending,
  onConvert,
}: ConvertToTcDialogProps) {
  const [suiteId, setSuiteId] = useState('');

  const handleConvert = async () => {
    if (!suiteId) return;
    await onConvert(Number(suiteId));
    setSuiteId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convertir a test case</DialogTitle>
          <DialogDescription>
            Se crea un TC con el título, pasos y resultado esperado del hallazgo.
          </DialogDescription>
        </DialogHeader>

        <Field label="Suite destino" htmlFor="convert-suite">
          <SelectField
            id="convert-suite"
            value={suiteId}
            onValueChange={setSuiteId}
            placeholder="Elegí una suite"
            options={suites.map((suite) => ({
              value: String(suite.id),
              label: `#${suite.id} · ${suite.title}`,
            }))}
          />
        </Field>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleConvert}
            loading={isPending}
            disabled={!suiteId}
          >
            Convertir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
