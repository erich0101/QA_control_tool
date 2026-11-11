export interface DateBucket<T> {
  key: string;
  year: number;
  months: Array<{
    key: string;
    month: number;
    days: Array<{ key: string; day: number; items: T[] }>;
    count: number;
  }>;
  count: number;
}

/**
 * Agrupa por año › mes › día descendente.
 * Se usa en Ejecuciones y en Bugs: mismo árbol, distinta fuente de fecha.
 */
export function groupByDate<T>(items: T[], getDate: (item: T) => string | null | undefined): DateBucket<T>[] {
  const years = new Map<number, Map<number, Map<number, T[]>>>();

  for (const item of items) {
    const raw = getDate(item);
    if (!raw) continue;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) continue;

    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    if (!years.has(year)) years.set(year, new Map());
    const months = years.get(year)!;
    if (!months.has(month)) months.set(month, new Map());
    const days = months.get(month)!;
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(item);
  }

  return [...years.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, months]) => {
      const monthBuckets = [...months.entries()]
        .sort(([a], [b]) => b - a)
        .map(([month, days]) => {
          const dayBuckets = [...days.entries()]
            .sort(([a], [b]) => b - a)
            .map(([day, dayItems]) => ({
              key: `d-${year}-${month}-${day}`,
              day,
              items: dayItems,
            }));

          return {
            key: `m-${year}-${month}`,
            month,
            days: dayBuckets,
            count: dayBuckets.reduce((acc, entry) => acc + entry.items.length, 0),
          };
        });

      return {
        key: `y-${year}`,
        year,
        months: monthBuckets,
        count: monthBuckets.reduce((acc, entry) => acc + entry.count, 0),
      };
    });
}

export const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function inDateRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  if (from && date < new Date(`${from}T00:00:00`)) return false;
  if (to && date > new Date(`${to}T23:59:59`)) return false;
  return true;
}
