import { useCallback, useMemo, useState } from "react";

export function usePagination<T>(
  items: T[],
  pageSize = 50,
): {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  slice: T[];
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
} {
  const [page, setPageRaw] = useState(1);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const safePage = Math.min(Math.max(1, page), totalPages);

  const slice = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const setPage = useCallback(
    (next: number) => {
      setPageRaw(Math.min(Math.max(1, next), totalPages));
    },
    [totalPages],
  );

  const nextPage = useCallback(() => {
    setPage(safePage + 1);
  }, [safePage, setPage]);

  const prevPage = useCallback(() => {
    setPage(safePage - 1);
  }, [safePage, setPage]);

  return {
    page: safePage,
    pageSize,
    totalPages,
    totalItems,
    slice,
    setPage,
    nextPage,
    prevPage,
  };
}
