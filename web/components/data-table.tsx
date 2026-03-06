"use client";

import { useState, useMemo, useCallback } from "react";

interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
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
  const [filters, setFilters] = useState<Record<string, string>>({});

  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    for (const col of columns) {
      if (!col.filterable) continue;
      const vals = new Set<string>();
      for (const row of data) {
        const v = row[col.key];
        if (v != null && v !== "") vals.add(String(v));
      }
      opts[col.key] = Array.from(vals).sort();
    }
    return opts;
  }, [columns, data]);

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((prev) => {
      if (!value) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
    setPage(0);
  }, []);

  const hasActiveFilters = Object.keys(filters).length > 0;

  const filtered = useMemo(() => {
    let result = data;

    // Apply column filters
    for (const [key, value] of Object.entries(filters)) {
      result = result.filter((row) => String(row[key] ?? "") === value);
    }

    // Apply search
    if (search && searchKeys?.length) {
      const q = search.toLowerCase();
      result = result.filter((row) =>
        searchKeys.some((key) =>
          String(row[key] ?? "").toLowerCase().includes(q)
        )
      );
    }

    return result;
  }, [data, filters, search, searchKeys]);

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
                  className={`text-left px-3 text-text-muted font-medium uppercase tracking-wider text-[11px] ${col.filterable ? "py-1.5" : "py-2.5"} ${col.className ?? ""}`}
                >
                  <span
                    onClick={() => col.sortable && toggleSort(col.key)}
                    className={`${col.sortable ? "cursor-pointer hover:text-text-secondary select-none" : ""}`}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="ml-1 text-accent">
                        {sortDir === "asc" ? "\u2191" : "\u2193"}
                      </span>
                    )}
                  </span>
                  {col.filterable && filterOptions[col.key] && (
                    <select
                      value={filters[col.key] ?? ""}
                      onChange={(e) => setFilter(col.key, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className={`block mt-1 w-full bg-surface-raised border rounded px-1.5 py-0.5 text-[10px] font-normal normal-case tracking-normal focus:outline-none cursor-pointer ${
                        filters[col.key]
                          ? "border-accent text-accent"
                          : "border-border text-text-muted"
                      }`}
                    >
                      <option value="">All</option>
                      {filterOptions[col.key].map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
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
      {(totalPages > 1 || hasActiveFilters || search) && (
        <div className="flex items-center justify-between mt-3 text-xs text-text-muted">
          <span>
            {sorted.length} result{sorted.length !== 1 ? "s" : ""}
            {hasActiveFilters || search ? " (filtered)" : ""}
            {hasActiveFilters && (
              <button
                onClick={() => setFilters({})}
                className="ml-2 text-accent hover:text-accent-hover"
              >
                Clear filters
              </button>
            )}
          </span>
          {totalPages > 1 && (
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
          )}
        </div>
      )}
    </div>
  );
}
