"use client";

import type { ReactNode } from "react";

interface StudioWorkspaceShellProps {
  primaryPanel: ReactNode;
  rightSidebar: ReactNode;
  secondaryPanel: ReactNode | null;
  topBar: ReactNode;
}

export function StudioWorkspaceShell({
  primaryPanel,
  rightSidebar,
  secondaryPanel,
  topBar,
}: StudioWorkspaceShellProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 overflow-hidden max-lg:flex-col">
      <div className="relative min-h-0 min-w-0 flex-1">
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <div className="shrink-0" style={{ height: "72px" }}>
            {topBar}
          </div>
          <div className="min-h-0 min-w-0 flex-1">
            {secondaryPanel ? (
              <div className="grid h-full min-h-0 min-w-0 lg:grid-cols-[minmax(0,1.7fr)_1px_minmax(0,1fr)]">
                <div className="min-h-0 min-w-0">{primaryPanel}</div>
                <div className="hidden bg-border/40 lg:block" aria-hidden />
                <div className="min-h-0 min-w-0 max-lg:border-t max-lg:border-border/40">
                  {secondaryPanel}
                </div>
              </div>
            ) : (
              primaryPanel
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 min-h-0 lg:w-[240px] max-lg:h-[220px] max-lg:border-t max-lg:border-border/40">
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 max-lg:hidden" style={{ height: "72px" }} aria-hidden />
          <div className="min-h-0 flex-1">{rightSidebar}</div>
        </div>
      </div>
    </div>
  );
}
