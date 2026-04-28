import type { CSSProperties, ReactNode } from "react";

export type FixedActionListRowId = string | number;

export interface FixedActionListColumn<TRow> {
  key: string;
  title: ReactNode;
  width?: number | string;
  align?: "left" | "center" | "right";
  render(row: TRow, rowIndex: number): ReactNode;
}

export interface FixedActionListProps<TRow> {
  rows: TRow[];
  columns: Array<FixedActionListColumn<TRow>>;
  getRowId(row: TRow): FixedActionListRowId;
  selectedRowIds?: FixedActionListRowId[];
  onSelectionChange?(rowIds: FixedActionListRowId[]): void;
  onCreate?(): void;
  onDelete?(rowIds: FixedActionListRowId[]): void;
  onExport?(): void;
  onDetail?(row: TRow): void;
  onEdit?(row: TRow): void;
  currentPage?: number;
  pageCount?: number;
  onPageChange?(page: number): void;
  height?: number | string;
  minHeight?: number | string;
  emptyText?: ReactNode;
  ariaLabel?: string;
  createLabel?: string;
  deleteLabel?: string;
  exportLabel?: string;
  detailLabel?: string;
  editLabel?: string;
  rowCheckboxLabel?(row: TRow): string;
}

export function FixedActionList<TRow>({
  rows,
  columns,
  getRowId,
  selectedRowIds = [],
  onSelectionChange,
  onCreate,
  onDelete,
  onExport,
  onDetail,
  onEdit,
  currentPage,
  pageCount,
  onPageChange,
  height = 420,
  minHeight = 360,
  emptyText = "暂无数据",
  ariaLabel = "固定操作列表",
  createLabel = "新增",
  deleteLabel = "删除",
  exportLabel = "导出",
  detailLabel = "详情",
  editLabel = "编辑",
  rowCheckboxLabel
}: FixedActionListProps<TRow>) {
  const selectedSet = new Set(selectedRowIds);
  const rowIds = rows.map(getRowId);
  const allCurrentRowsSelected = rowIds.length > 0 && rowIds.every((id) => selectedSet.has(id));
  const tableHeight = typeof height === "number" ? `${height}px` : height;
  const tableMinHeight = typeof minHeight === "number" ? `${minHeight}px` : minHeight;
  const normalizedPageCount = Math.max(1, pageCount ?? 1);
  const normalizedCurrentPage = Math.min(Math.max(1, currentPage ?? 1), normalizedPageCount);
  const showPagination = Boolean(onPageChange && currentPage && pageCount);

  function handleToggleAll() {
    if (!onSelectionChange) {
      return;
    }

    if (allCurrentRowsSelected) {
      onSelectionChange(selectedRowIds.filter((id) => !rowIds.includes(id)));
      return;
    }

    onSelectionChange([...selectedRowIds, ...rowIds.filter((id) => !selectedSet.has(id))]);
  }

  function handleToggleRow(rowId: FixedActionListRowId) {
    if (!onSelectionChange) {
      return;
    }

    if (selectedSet.has(rowId)) {
      onSelectionChange(selectedRowIds.filter((id) => id !== rowId));
      return;
    }

    onSelectionChange([...selectedRowIds, rowId]);
  }

  function goToPage(page: number) {
    if (!onPageChange) {
      return;
    }
    onPageChange(Math.min(Math.max(1, page), normalizedPageCount));
  }

  return (
    <div className="ui-fixed-action-list" aria-label={ariaLabel}>
      <div className="ui-admin-actions-bar__group" style={{ marginBottom: 12 }}>
        <button type="button" className="ui-button ui-button--primary" onClick={onCreate} disabled={!onCreate}>
          {createLabel}
        </button>
        <button
          type="button"
          className="ui-button ui-button--ghost"
          onClick={() => onDelete?.(selectedRowIds)}
          disabled={!onDelete || selectedRowIds.length === 0}
        >
          {deleteLabel}
        </button>
        <button type="button" className="ui-button ui-button--ghost" onClick={onExport} disabled={!onExport}>
          {exportLabel}
        </button>
      </div>

      <div style={{ height: tableHeight, minHeight: tableMinHeight, overflow: "auto" }}>
        <table className="ui-admin-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ width: 54 }}>
                <input
                  type="checkbox"
                  className="ui-admin-table__checkbox"
                  aria-label="全选当前列表"
                  checked={allCurrentRowsSelected}
                  disabled={!onSelectionChange || rows.length === 0}
                  onChange={handleToggleAll}
                />
              </th>
              {columns.map((column) => (
                <th key={column.key} style={buildCellStyle(column)}>
                  {column.title}
                </th>
              ))}
              <th style={{ width: 132, textAlign: "center" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const rowId = getRowId(row);
              return (
                <tr key={String(rowId)}>
                  <td>
                    <input
                      type="checkbox"
                      className="ui-admin-table__checkbox"
                      aria-label={rowCheckboxLabel?.(row) ?? `选择-${rowId}`}
                      checked={selectedSet.has(rowId)}
                      disabled={!onSelectionChange}
                      onChange={() => handleToggleRow(rowId)}
                    />
                  </td>
                  {columns.map((column) => (
                    <td key={column.key} style={buildCellStyle(column)}>
                      {column.render(row, rowIndex)}
                    </td>
                  ))}
                  <td>
                    <div className="ui-admin-table__actions">
                      <button type="button" className="ui-admin-link" onClick={() => onDetail?.(row)} disabled={!onDetail}>
                        {detailLabel}
                      </button>
                      <button type="button" className="ui-admin-link" onClick={() => onEdit?.(row)} disabled={!onEdit}>
                        {editLabel}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2}>{emptyText}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {showPagination ? (
        <div className="ui-admin-table__footer">
          <div className="ui-admin-pagination__info">{`第 ${normalizedCurrentPage} / ${normalizedPageCount} 页`}</div>
          <div className="ui-admin-pagination">
            <button
              type="button"
              className="ui-button ui-button--ghost"
              onClick={() => goToPage(normalizedCurrentPage - 1)}
              disabled={normalizedCurrentPage <= 1}
            >
              上一页
            </button>
            <select
              aria-label="选择页数"
              value={normalizedCurrentPage}
              onChange={(event) => goToPage(Number(event.target.value))}
              disabled={normalizedPageCount <= 1}
            >
              {Array.from({ length: normalizedPageCount }, (_, index) => index + 1).map((page) => (
                <option key={page} value={page}>
                  第 {page} 页
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ui-button ui-button--ghost"
              onClick={() => goToPage(normalizedCurrentPage + 1)}
              disabled={normalizedCurrentPage >= normalizedPageCount}
            >
              下一页
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildCellStyle<TRow>(column: FixedActionListColumn<TRow>): CSSProperties {
  return {
    width: column.width,
    textAlign: column.align
  };
}
