/**
 * src/components/statistics/DataTable.tsx
 *
 * Reusable sortable data table component for the statistics page.
 * Renders election data in a clean, dark-themed table with:
 * - Click-to-sort column headers (asc/desc toggle)
 * - Optional row limit with "Show more" expansion
 * - Optional color-coded cells (e.g. positive/negative values)
 * - Compact mode for embedding in smaller containers
 * - Responsive horizontal scroll on narrow screens
 *
 * Usage:
 * ```tsx
 * <DataTable
 *   title="Narrowest 10 Seats"
 *   columns={[
 *     { key: 'constituency', label: 'Constituency' },
 *     { key: 'margin', label: 'Margin %', align: 'right', format: formatPercent },
 *   ]}
 *   rows={data.map(d => ({
 *     constituency: formatConstituencyLabel(d.constituencyId, d.districtId),
 *     margin: d.marginPercent,
 *   }))}
 * />
 * ```
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import { THEME } from './chartHelpers';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Column<K extends string = string> {
  /** Unique key matching the row data property */
  key: K;
  /** Display header text */
  label: string;
  /** Text alignment: 'left' | 'center' | 'right'. Default 'left'. */
  align?: 'left' | 'center' | 'right';
  /** Whether this column is sortable. Default true. */
  sortable?: boolean;
  /** Custom formatter: receives the raw cell value, returns display string */
  format?: (value: any, row: Record<string, any>) => string;
  /** Custom cell renderer: receives raw value and row, returns JSX */
  render?: (
    value: any,
    row: Record<string, any>,
    rowIndex: number
  ) => React.ReactNode;
  /** Fixed column width (CSS value like '120px' or '8rem') */
  width?: string;
  /** Minimum column width */
  minWidth?: string;
  /** Whether to apply numeric styling (tabular nums, monospace-ish) */
  numeric?: boolean;
  /** Optional tooltip text for the column header */
  headerTooltip?: string;
}

export interface DataTableProps<K extends string = string> {
  /** Column definitions */
  columns: Column<K>[];
  /** Row data — each row is a plain object with keys matching column keys */
  rows: Record<K, any>[];
  /** Optional table title rendered above the table */
  title?: string;
  /** Optional description shown below the title */
  description?: string;
  /** Initial number of rows to show before "Show more". Default: show all. */
  initialRows?: number;
  /** Step size for "Show more" button. Default: same as initialRows or 10. */
  showMoreStep?: number;
  /** Default sort column key */
  defaultSortKey?: K;
  /** Default sort direction */
  defaultSortDir?: 'asc' | 'desc';
  /** Whether to show row numbers. Default false. */
  showRowNumbers?: boolean;
  /** Whether to use compact styling (smaller font, tighter padding). Default false. */
  compact?: boolean;
  /** Whether to stripe alternating rows. Default true. */
  striped?: boolean;
  /** Whether the table should highlight rows on hover. Default true. */
  hoverHighlight?: boolean;
  /** Optional callback when a row is clicked */
  onRowClick?: (row: Record<K, any>, index: number) => void;
  /** Optional CSS class on the outer wrapper */
  className?: string;
  /** Optional empty state message when rows is empty */
  emptyMessage?: React.ReactNode;
  /** Optional footer content rendered below the table */
  footer?: React.ReactNode;
}

// ─── Sort helpers ───────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc';

function compareValues(a: any, b: any, dir: SortDir): number {
  // Handle nulls/undefined — push them to the end
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  // Numeric comparison
  if (typeof a === 'number' && typeof b === 'number') {
    return dir === 'asc' ? a - b : b - a;
  }

  // String comparison (case-insensitive)
  const strA = String(a).toLowerCase();
  const strB = String(b).toLowerCase();
  const cmp = strA.localeCompare(strB);
  return dir === 'asc' ? cmp : -cmp;
}

// ─── Component ──────────────────────────────────────────────────────────────

function DataTable<K extends string = string>({
  columns,
  rows,
  title,
  description,
  initialRows,
  showMoreStep,
  defaultSortKey,
  defaultSortDir = 'asc',
  showRowNumbers = false,
  compact = false,
  striped = true,
  hoverHighlight = true,
  onRowClick,
  className,
  emptyMessage,
  footer,
}: DataTableProps<K>) {
  const { t } = useTranslation();
  const tt = t as (
    key: string,
    params?: Record<string, string | number>
  ) => string;
  const resolvedEmptyMessage = emptyMessage ?? tt('table_no_data');
  // ── Sort state ──
  const [sortKey, setSortKey] = useState<K | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);

  // ── Expansion state ──
  const [visibleCount, setVisibleCount] = useState<number>(
    initialRows ?? rows.length
  );

  // Handle column header click for sorting
  const handleSort = useCallback(
    (key: K, sortable: boolean | undefined) => {
      if (sortable === false) return;
      if (sortKey === key) {
        // Toggle direction
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
    },
    [sortKey]
  );

  // Sort and slice rows
  const displayRows = useMemo(() => {
    let sorted = [...rows];
    if (sortKey) {
      sorted.sort((a, b) => compareValues(a[sortKey], b[sortKey], sortDir));
    }
    return sorted.slice(0, visibleCount);
  }, [rows, sortKey, sortDir, visibleCount]);

  const hasMore = visibleCount < rows.length;
  const step = showMoreStep ?? initialRows ?? 10;

  const handleShowMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + step, rows.length));
  }, [step, rows.length]);

  const handleShowAll = useCallback(() => {
    setVisibleCount(rows.length);
  }, [rows.length]);

  const handleCollapse = useCallback(() => {
    setVisibleCount(initialRows ?? 10);
  }, [initialRows]);

  // ── Sort indicator ──
  const sortIndicator = (key: K): string => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  // ── Empty state ──
  if (rows.length === 0) {
    return (
      <div className={`data-table-wrapper${className ? ` ${className}` : ''}`}>
        {title && <div className="data-table__title">{title}</div>}
        {description && (
          <div className="data-table__description">{description}</div>
        )}
        <div className="data-table__empty">{resolvedEmptyMessage}</div>
      </div>
    );
  }

  return (
    <div
      className={`data-table-wrapper${compact ? ' data-table-wrapper--compact' : ''}${className ? ` ${className}` : ''}`}
    >
      {title && <div className="data-table__title">{title}</div>}
      {description && (
        <div className="data-table__description">{description}</div>
      )}

      <div className="data-table__scroll-container">
        <table className="data-table">
          <thead>
            <tr>
              {showRowNumbers && (
                <th
                  className="data-table__th data-table__th--row-num"
                  style={{ width: '2.5rem', textAlign: 'center' }}
                >
                  #
                </th>
              )}
              {columns.map((col) => {
                const isSortable = col.sortable !== false;
                return (
                  <th
                    key={col.key}
                    className={`data-table__th${isSortable ? ' data-table__th--sortable' : ''}${sortKey === col.key ? ' data-table__th--active' : ''}`}
                    style={{
                      textAlign: col.align ?? 'left',
                      width: col.width,
                      minWidth: col.minWidth,
                      cursor: isSortable ? 'pointer' : 'default',
                    }}
                    onClick={() => handleSort(col.key, col.sortable)}
                    title={
                      col.headerTooltip ??
                      (isSortable ? `Sort by ${col.label}` : undefined)
                    }
                    role={isSortable ? 'button' : undefined}
                    tabIndex={isSortable ? 0 : undefined}
                    onKeyDown={
                      isSortable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSort(col.key, col.sortable);
                            }
                          }
                        : undefined
                    }
                  >
                    {col.label}
                    {isSortable && (
                      <span className="data-table__sort-indicator">
                        {sortIndicator(col.key)}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {displayRows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={`data-table__tr${striped && rowIdx % 2 === 1 ? ' data-table__tr--striped' : ''}${hoverHighlight ? ' data-table__tr--hoverable' : ''}${onRowClick ? ' data-table__tr--clickable' : ''}`}
                onClick={onRowClick ? () => onRowClick(row, rowIdx) : undefined}
              >
                {showRowNumbers && (
                  <td
                    className="data-table__td data-table__td--row-num"
                    style={{ textAlign: 'center' }}
                  >
                    {rowIdx + 1}
                  </td>
                )}
                {columns.map((col) => {
                  const rawValue = row[col.key];

                  // Determine cell content
                  let content: React.ReactNode;
                  if (col.render) {
                    content = col.render(rawValue, row, rowIdx);
                  } else if (col.format) {
                    content = col.format(rawValue, row);
                  } else if (typeof rawValue === 'number') {
                    content = rawValue.toLocaleString();
                  } else {
                    content = rawValue ?? '—';
                  }

                  return (
                    <td
                      key={col.key}
                      className={`data-table__td${col.numeric ? ' data-table__td--numeric' : ''}`}
                      style={{
                        textAlign: col.align ?? 'left',
                      }}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Show more / Show all / Collapse controls */}
      {initialRows && rows.length > (initialRows ?? 0) && (
        <div className="data-table__controls">
          {hasMore ? (
            <>
              <button className="data-table__btn" onClick={handleShowMore}>
                {tt('table_show_more', {
                  count: Math.min(step, rows.length - visibleCount),
                })}
              </button>
              {rows.length - visibleCount > step && (
                <button
                  className="data-table__btn data-table__btn--secondary"
                  onClick={handleShowAll}
                >
                  {tt('table_show_all', { count: rows.length })}
                </button>
              )}
            </>
          ) : (
            <button
              className="data-table__btn data-table__btn--secondary"
              onClick={handleCollapse}
            >
              {tt('table_collapse')}
            </button>
          )}
          <span className="data-table__count">
            {tt('table_showing', {
              visible: displayRows.length,
              total: rows.length,
            })}
          </span>
        </div>
      )}

      {footer && <div className="data-table__footer">{footer}</div>}
    </div>
  );
}

export default DataTable;
