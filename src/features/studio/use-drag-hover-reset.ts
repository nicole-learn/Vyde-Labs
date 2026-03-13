"use client";

import { useEffect, type RefObject } from "react";

export function useDragHoverReset(params: {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onReset: () => void;
}) {
  const { active, containerRef, onReset } = params;

  useEffect(() => {
    if (!active) {
      return;
    }

    const handleDocumentDragOver = (event: DragEvent) => {
      const target = event.target as Node | null;
      if (target && containerRef.current?.contains(target)) {
        return;
      }

      onReset();
    };

    const handleReset = () => {
      onReset();
    };

    document.addEventListener("dragover", handleDocumentDragOver, true);
    document.addEventListener("dragend", handleReset, true);
    document.addEventListener("drop", handleReset, true);

    return () => {
      document.removeEventListener("dragover", handleDocumentDragOver, true);
      document.removeEventListener("dragend", handleReset, true);
      document.removeEventListener("drop", handleReset, true);
    };
  }, [active, containerRef, onReset]);
}
