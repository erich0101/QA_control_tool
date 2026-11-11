import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

function toId(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Selección CU / Suite / Test Case en la URL (?cu=&suite=&tc=). */
export function useSuiteParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const useCaseId = toId(searchParams.get('cu'));
  const suiteId = toId(searchParams.get('suite'));
  const testCaseId = toId(searchParams.get('tc'));

  const patch = useCallback(
    (updates: { cu?: number | null; suite?: number | null; tc?: number | null }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);

          for (const [key, value] of Object.entries(updates)) {
            if (value) next.set(key, String(value));
            else next.delete(key);
          }

          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return {
    useCaseId,
    suiteId,
    testCaseId,
    selectUseCase: (id: number | null) => patch({ cu: id, suite: null, tc: null }),
    selectSuite: (id: number | null) => patch({ suite: id, tc: null }),
    selectTestCase: (id: number | null) => patch({ tc: id }),
  };
}
