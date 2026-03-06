"use client";

import { useState, useMemo } from "react";

interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchKeys?: string[];
  searchPlaceholder?: string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  searchKeys,
  searchPlaceholder = "Search...",
  onRowClick,
  pageSize = 25,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!search || !searchKeys?.length) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      searchKeys.some((key) =>
        String(row[key] ?? "").toLowerCase().includes(q)
      )
    );
  }, [data, search, searchKeys]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  return (
    <div>
      {searchKeys && searchKeys.length > 0 && (
        <div className="mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={searchPlaceholder}
            className="w-full max-w-sm bg-surface-overlay border border-border rounded-md px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-overlay">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && toggleSort(col.key)}
                  className={`text-left px-3 py-2.5 text-text-muted font-medium uppercase tracking-wider text-[11px] ${
                    col.sortable ? "cursor-pointer hover:text-text-secondary select-none" : ""
                  } ${col.className ?? ""}`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1 text-accent">
                      {sortDir === "asc" ? "\u2191" : "\u2193"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {paged.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-text-muted"
                >
                  No results found
                </td>
              </tr>
            ) : (
              paged.map((row, i) => (
                <tr
                  key={i}
                  onClick={() => onRowClick?.(row)}
                  className={`bg-surface-raised hover:bg-surface-overlay transition-colors ${
                    onRowClick ? "cursor-pointer" : ""
                  }`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-3 py-2.5 ${col.className ?? ""}`}>
                      {col.render ? col.render(row, page * pageSize + i) : String(row[col.key] ?? "-")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-text-muted">
          <span>
            {sorted.length} result{sorted.length !== 1 ? "s" : ""}
            {search ? " (filtered)" : ""}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded bg-surface-overlay border border-border disabled:opacity-30 hover:bg-surface-overlay/80"
            >
              Prev
            </button>
            <span className="px-2 py-1 tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 rounded bg-surface-overlay border border-border disabled:opacity-30 hover:bg-surface-overlay/80"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
