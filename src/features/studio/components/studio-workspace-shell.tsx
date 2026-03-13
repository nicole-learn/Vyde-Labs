"use client";

import { ChevronsRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface StudioWorkspaceShellProps {
  floatingOverlay: ReactNode;
  isDesktopViewport: boolean;
  mobileRail: ReactNode;
  onCloseSecondary: () => void;
  primaryPanel: ReactNode;
  rightSidebar: ReactNode;
  secondaryPanel: ReactNode | null;
  topBar: ReactNode;
}

const DESKTOP_TOP_BAR_HEIGHT = 72;
const DESKTOP_RIGHT_SIDEBAR_WIDTH = 220;
const DEFAULT_PRIMARY_WIDTH = 64;
const MIN_PRIMARY_WIDTH = 34;
const MAX_PRIMARY_WIDTH = 82;
const CLOSE_SECONDARY_THRESHOLD = 86;

function DesktopSplitPanels({
  onCloseSecondary,
  primaryPanel,
  secondaryPanel,
}: {
  onCloseSecondary: () => void;
  primaryPanel: ReactNode;
  secondaryPanel: ReactNode | null;
}) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const closeIntentRef = useRef(false);
  const [primaryWidthPct, setPrimaryWidthPct] = useState(DEFAULT_PRIMARY_WIDTH);
  const [dragging, setDragging] = useState(false);
  const [closeIntent, setCloseIntent] = useState(false);

  useEffect(() => {
    if (!dragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      const workspace = workspaceRef.current;
      if (!workspace) return;

      const rect = workspace.getBoundingClientRect();
      const rawPct = ((event.clientX - rect.left) / rect.width) * 100;
      const boundedPct = Math.min(Math.max(rawPct, MIN_PRIMARY_WIDTH), MAX_PRIMARY_WIDTH);

      setPrimaryWidthPct(boundedPct);
      closeIntentRef.current = rawPct >= CLOSE_SECONDARY_THRESHOLD;
      setCloseIntent(closeIntentRef.current);
    };

    const handlePointerUp = () => {
      setDragging(false);
      if (closeIntentRef.current) {
        onCloseSecondary();
        setPrimaryWidthPct(DEFAULT_PRIMARY_WIDTH);
      }
      closeIntentRef.current = false;
      setCloseIntent(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragging, onCloseSecondary]);

  if (!secondaryPanel) {
    return <div className="h-full min-h-0 min-w-0">{primaryPanel}</div>;
  }

  return (
    <div ref={workspaceRef} className="relative flex h-full min-h-0 min-w-0 overflow-hidden">
      <div
        className="relative min-h-0 min-w-0 shrink-0 bg-background"
        style={{
          width: `${primaryWidthPct}%`,
          flexBasis: `${primaryWidthPct}%`,
        }}
      >
        {primaryPanel}
      </div>

      <div className="relative flex h-full min-h-0 w-[2px] shrink-0 items-center justify-center bg-foreground">
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          onPointerDown={(event) => {
            event.preventDefault();
            setDragging(true);
            setCloseIntent(false);
          }}
          className="absolute inset-y-0 left-1/2 z-20 w-8 -translate-x-1/2 cursor-col-resize"
        />
      </div>

      <div className="relative min-h-0 min-w-0 flex-1 bg-background">
        {secondaryPanel}
        {closeIntent ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <ChevronsRight className="size-6 text-foreground/70" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function StudioWorkspaceShell({
  floatingOverlay,
  isDesktopViewport,
  mobileRail,
  onCloseSecondary,
  primaryPanel,
  rightSidebar,
  secondaryPanel,
  topBar,
}: StudioWorkspaceShellProps) {
  if (isDesktopViewport) {
    return (
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
        <div className="shrink-0" style={{ height: `${DESKTOP_TOP_BAR_HEIGHT}px` }}>
          {topBar}
        </div>
        <div className="min-h-0 min-w-0 flex-1">
          <div className="relative h-full min-h-0 min-w-0">
            <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
              <div className="min-h-0 min-w-0 flex-1">
                <DesktopSplitPanels
                  onCloseSecondary={onCloseSecondary}
                  primaryPanel={primaryPanel}
                  secondaryPanel={secondaryPanel}
                />
              </div>

              <aside
                className="shrink-0 min-h-0 border-l border-white/8 bg-black"
                style={{ width: `${DESKTOP_RIGHT_SIDEBAR_WIDTH}px` }}
              >
                <div className="min-h-0 h-full">{rightSidebar}</div>
              </aside>
            </div>

            <div className="relative z-[120]">{floatingOverlay}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1">
        <div className="relative h-full min-h-0 min-w-0">
          <div className="stable-scrollbar flex h-full min-h-0 flex-col overflow-y-auto">
            <div className={cn(secondaryPanel ? "min-h-[21rem] border-b border-border/70" : "min-h-[21rem]")}>
              {primaryPanel}
            </div>
            {secondaryPanel ? <div className="min-h-[21rem]">{secondaryPanel}</div> : null}
          </div>
          <div className="relative z-[120]">{floatingOverlay}</div>
        </div>
      </div>
      {mobileRail}
    </div>
  );
}
