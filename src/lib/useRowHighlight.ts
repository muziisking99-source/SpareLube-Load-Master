import { useCallback, useState, type MouseEvent } from "react";

/**
 * Click-to-highlight: track one active row id (or card id) within a list.
 * When externalHighlightId is set (e.g. from search), it takes precedence.
 */
export function useRowHighlight(externalHighlightId?: string | null) {
  const [localId, setLocalId] = useState<string | null>(null);
  const highlightedId = externalHighlightId ?? localId;

  const highlightProps = useCallback(
    (id: string) => ({
      "data-search-target": id,
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
        setLocalId(id);
      },
    }),
    [highlightedId],
  );

  return { highlightedId, setHighlightedId: setLocalId, highlightProps };
}
