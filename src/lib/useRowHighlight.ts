import { useCallback, useState, type MouseEvent } from "react";

/**
 * Click-to-highlight: track one active row id (or card id) within a list.
 */
export function useRowHighlight(initial: string | null = null) {
  const [highlightedId, setHighlightedId] = useState<string | null>(initial);

  const highlightProps = useCallback(
    (id: string) => ({
      "data-state": highlightedId === id ? ("selected" as const) : undefined,
      onClick: (e: MouseEvent) => {
        const t = e.target as HTMLElement;
        if (
          t.closest(
            "button, a, input, select, textarea, [role='checkbox'], [role='combobox'], [data-no-row-highlight]",
          )
        ) {
          return;
        }
        setHighlightedId(id);
      },
    }),
    [highlightedId],
  );

  return { highlightedId, setHighlightedId, highlightProps };
}
