export interface PaginationResult<TItem> {
  items: TItem[];
  page: number;
  pageCount: number;
  total: number;
}

export function paginateItems<TItem>(items: TItem[], page: number, pageSize: number): PaginationResult<TItem> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageCount,
    total
  };
}

export function toggleSelection(current: number[], id: number): number[] {
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
}

export function toggleSelectAll(current: number[], ids: number[]): number[] {
  if (ids.length === 0) {
    return current;
  }
  const allSelected = ids.every((id) => current.includes(id));
  if (allSelected) {
    return current.filter((id) => !ids.includes(id));
  }
  return Array.from(new Set([...current, ...ids]));
}

export function downloadCsv<TItem extends object>(
  filename: string,
  columns: Array<{ key: string; title: string }>,
  rows: TItem[]
): void {
  const header = columns.map((column) => escapeCsvCell(column.title)).join(",");
  const body = rows
    .map((row) => {
      const record = row as Record<string, unknown>;
      return columns.map((column) => escapeCsvCell(formatCell(record[column.key]))).join(",");
    })
    .join("\r\n");
  const csv = `${header}\r\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/"/g, "\"\"");
  return `"${normalized}"`;
}
