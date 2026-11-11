import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

function toId(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Selección de CU / HU en la URL (`?cu=12&hu=34`).
 * Ventajas sobre el estado del store legacy: es compartible, sobrevive al
 * refresh y funciona el botón atrás del navegador.
 */
export function useStoryParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const useCaseId = toId(searchParams.get('cu'));
  const storyId = toId(searchParams.get('hu'));

  const selectUseCase = useCallback(
    (id: number | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('cu', String(id));
          else next.delete('cu');
          // Cambiar de CU invalida la HU seleccionada.
          next.delete('hu');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const selectStory = useCallback(
    (id: number | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('hu', String(id));
          else next.delete('hu');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return { useCaseId, storyId, selectUseCase, selectStory };
}
