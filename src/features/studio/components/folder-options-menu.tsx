"use client";

import {
  Copy,
  Download,
  EllipsisVertical,
  FolderOpen,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { cn } from "@/lib/cn";

interface FolderOptionsMenuProps {
  className?: string;
  folderName: string;
  hasItems: boolean;
  onCopyFolderId: () => void;
  onDeleteFolder: () => void;
  onDownloadFolder: () => void;
  onOpenFolder: () => void;
  onRenameFolder: () => void;
}

interface MenuItemProps {
  destructive?: boolean;
  disabled?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onSelect: () => void;
}

function MenuItem({
  destructive = false,
  disabled = false,
  icon: Icon,
  label,
  onSelect,
}: MenuItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      role="menuitem"
      onClick={() => {
        if (disabled) return;
        onSelect();
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[13px] transition-colors",
        destructive
          ? "text-red-200 hover:bg-red-500/10 hover:text-red-100"
          : "text-foreground/84 hover:bg-white/[0.06] hover:text-foreground",
        disabled &&
          "cursor-not-allowed text-white/30 hover:bg-transparent hover:text-white/30"
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

export function FolderOptionsMenu({
  className,
  folderName,
  hasItems,
  onCopyFolderId,
  onDeleteFolder,
  onDownloadFolder,
  onOpenFolder,
  onRenameFolder,
}: FolderOptionsMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className={className} data-folder-menu-root>
      <div ref={menuRef} className="relative inline-flex items-center justify-center">
        <button
          type="button"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((current) => !current);
          }}
          className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-white/[0.08] hover:text-foreground"
          aria-label={`Open ${folderName} options`}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <EllipsisVertical className="size-3.5" />
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+0.4rem)] z-30 w-48 rounded-[16px] border border-white/10 bg-[#080808] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.42)]"
            onClick={(event) => event.stopPropagation()}
          >
            <MenuItem
              icon={FolderOpen}
              label="Open Folder"
              onSelect={() => handleSelect(onOpenFolder)}
            />
            <MenuItem
              icon={Download}
              label="Download Folder"
              disabled={!hasItems}
              onSelect={() => handleSelect(onDownloadFolder)}
            />
            <MenuItem
              icon={Pencil}
              label="Rename Folder"
              onSelect={() => handleSelect(onRenameFolder)}
            />
            <MenuItem
              icon={Copy}
              label="Copy Folder ID"
              onSelect={() => handleSelect(onCopyFolderId)}
            />
            <div className="my-1 h-px bg-white/8" />
            <MenuItem
              destructive
              icon={Trash2}
              label="Delete Folder"
              onSelect={() => handleSelect(onDeleteFolder)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
