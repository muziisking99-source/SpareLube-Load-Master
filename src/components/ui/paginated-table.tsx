"use client";

import { usePagination } from "@/hooks/use-pagination";
import { cn } from "@/lib/utils";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Column<T> = {
  key: string;
  header: React.ReactNode;
  className?: string;
  cell: (item: T, index: number) => React.ReactNode;
};

export function PaginatedTable<T>({
  items,
  columns,
  pageSize = 50,
  rowKey,
  className,
  footerClassName,
  emptyMessage = "No rows.",
}: {
  items: T[];
  columns: Column<T>[];
  pageSize?: number;
  rowKey: (item: T, index: number) => string | number;
  className?: string;
  footerClassName?: string;
  emptyMessage?: string;
}) {
  const { slice, page, totalPages, totalItems, setPage, nextPage, prevPage } = usePagination(
    items,
    pageSize,
  );

  if (totalItems === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="overflow-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((item, idx) => {
              const globalIndex = (page - 1) * pageSize + idx;
              return (
                <TableRow key={rowKey(item, globalIndex)} className="hover:bg-panel-2/80">
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.cell(item, globalIndex)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground",
            footerClassName,
          )}
        >
          <span>
            {start}–{end} of {totalItems}
          </span>
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    prevPage();
                  }}
                  className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="px-2 text-sm">
                  Page {page} of {totalPages}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    nextPage();
                  }}
                  className={page >= totalPages ? "pointer-events-none opacity-50" : undefined}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
