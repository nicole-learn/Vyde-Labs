"use client";

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

interface ModalShellProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  panelClassName?: string;
  contentClassName?: string;
  hideHeader?: boolean;
  children: ReactNode;
}

export function ModalShell({
  open,
  title,
  description,
  onClose,
  panelClassName,
  contentClassName,
  hideHeader = false,
  children,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const hasExplicitPanelWidth =
    typeof panelClassName === "string" &&
    /(^|\s)(max-w-|w-\[|w-(?:\d|full|min|max|screen)|min-w-|min-h-|h-\[)/.test(
      panelClassName
    );

  useEffect(() => {
    if (!open) return;

    previouslyFocusedElementRef.current =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocusedElementRef.current?.focus?.();
    };
  }, [onClose, open]);

  const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusableElements || focusableElements.length === 0) {
      event.preventDefault();
      panelRef.current?.focus();
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement as HTMLElement | null;

    if (event.shiftKey) {
      if (!activeElement || activeElement === first || activeElement === panelRef.current) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hideHeader ? undefined : titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handlePanelKeyDown}
        className={cn(
          "w-full rounded-[28px] border border-white/10 bg-background/90 shadow-2xl shadow-black/50 backdrop-blur-2xl",
          hasExplicitPanelWidth ? null : "max-w-xl",
          panelClassName
        )}
      >
        {!hideHeader ? (
          <div className="border-b border-white/8 px-6 py-5">
            <h2 id={titleId} className="text-xl font-semibold text-white">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-2 text-sm leading-6 text-white/62">
                {description}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className={cn("px-6 py-6", contentClassName)}>{children}</div>
      </div>
    </div>
  );
}
