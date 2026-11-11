import { Fragment } from 'react';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  headerClassName?: string;
  cellClassName?: string;
}

export interface DataTableGroup<T> {
  id: string;
  header: React.ReactNode;
  rows: T[];
}

interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  /** Filas planas. Ignorado si se pasan `groups`. */
  rows?: T[];
  /** Filas agrupadas: renderiza un header por grupo y sus filas debajo. */
  groups?: Array<DataTableGroup<T>>;
  getRowId: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  activeRowId?: string | number | null;
  expandedRowId?: string | number | null;
  renderExpanded?: (row: T) => React.ReactNode;
  onGroupClick?: (groupId: string) => void;
  rowClassName?: (row: T) => string;
  emptyMessage?: React.ReactNode;
  /** Padding reducido, para tablas densas dentro de tarjetas. */
  dense?: boolean;
  containerClassName?: string;
  /** Header fijo al scrollear (listados largos). */
  stickyHeader?: boolean;
  /** Sin borde/fondo/contenedor: para tablas embebidas a pantalla completa. */
  bare?: boolean;
}

const ALIGN_TEXT = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const;

/**
 * Tabla de datos del design system.
 * Centraliza thead/tbody, estilos de fila, fila expandible y agrupación,
 * para no repetir el mismo markup en cada pantalla.
 */
export function DataTable<T>({
  columns,
  rows,
  groups,
  getRowId,
  onRowClick,
  activeRowId = null,
  expandedRowId = null,
  renderExpanded,
  onGroupClick,
  rowClassName,
  emptyMessage,
  dense = false,
  containerClassName,
  stickyHeader = false,
  bare = false,
}: DataTableProps<T>) {
  const cellPadding = dense ? 'px-3 py-2' : 'px-4 py-2.5';
  const headerPadding = dense ? 'px-3 py-2' : 'px-4 py-2';

  const totalRows = groups
    ? groups.reduce((acc, group) => acc + group.rows.length, 0)
    : (rows?.length ?? 0);

  const renderRow = (row: T) => {
    const id = getRowId(row);
    const isActive = activeRowId !== null && activeRowId === id;
    const isExpanded = expandedRowId !== null && expandedRowId === id;

    return (
      <Fragment key={id}>
        <tr
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          className={cn(
            'border-b border-l-[3px] border-b-border border-l-transparent transition-colors',
            onRowClick && 'cursor-pointer hover:bg-fill-soft',
            isActive && 'border-l-brand bg-brand-soft hover:bg-brand-soft',
            rowClassName?.(row),
          )}
        >
          {columns.map((column) => (
            <td
              key={column.id}
              className={cn(
                cellPadding,
                ALIGN_TEXT[column.align ?? 'left'],
                column.cellClassName,
              )}
            >
              {column.cell(row)}
            </td>
          ))}
        </tr>

        {isExpanded && renderExpanded ? (
          <tr className="border-b border-border bg-surface-2">
            <td colSpan={columns.length} className="p-0">
              {renderExpanded(row)}
            </td>
          </tr>
        ) : null}
      </Fragment>
    );
  };

  return (
    <div
      className={cn(
        !bare && 'overflow-hidden rounded-xl border border-border bg-surface',
        containerClassName,
      )}
    >
      {totalRows === 0 && emptyMessage ? (
        <div className="p-8 text-center text-footnote text-fg-subtle">{emptyMessage}</div>
      ) : (
        <table className="w-full border-collapse text-footnote">
          <thead className={cn(stickyHeader && 'sticky top-0 z-10', stickyHeader && 'bg-surface-2')}>
            <tr className="border-b border-border bg-fill-soft text-caption uppercase tracking-wide text-fg-subtle">
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={cn(
                    headerPadding,
                    'font-semibold',
                    ALIGN_TEXT[column.align ?? 'left'],
                    column.headerClassName,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {groups
              ? groups.map((group) => (
                  <Fragment key={group.id}>
                    <tr
                      onClick={onGroupClick ? () => onGroupClick(group.id) : undefined}
                      className={cn(
                        'border-b border-border bg-surface-2',
                        onGroupClick && 'cursor-pointer hover:bg-fill-soft',
                      )}
                    >
                      <td colSpan={columns.length} className={cellPadding}>
                        {group.header}
                      </td>
                    </tr>
                    {group.rows.map(renderRow)}
                  </Fragment>
                ))
              : (rows ?? []).map(renderRow)}
          </tbody>
        </table>
      )}
    </div>
  );
}
