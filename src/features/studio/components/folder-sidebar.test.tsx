import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FolderSidebar } from "./folder-sidebar";
import type { StudioFolder } from "../types";

const FOLDERS: StudioFolder[] = [
  {
    id: "folder-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    name: "Projects",
    createdAt: "2026-03-14T10:00:00.000Z",
    updatedAt: "2026-03-14T10:00:00.000Z",
    sortOrder: 0,
  },
  {
    id: "folder-2",
    userId: "user-1",
    workspaceId: "workspace-1",
    name: "References",
    createdAt: "2026-03-14T10:00:00.000Z",
    updatedAt: "2026-03-14T10:00:00.000Z",
    sortOrder: 1,
  },
];

describe("FolderSidebar", () => {
  it("clears pointer focus from a folder row after clicking it", async () => {
    const user = userEvent.setup();
    const onSelectFolder = vi.fn();

    render(
      <FolderSidebar
        folderCounts={{ "folder-1": 3, "folder-2": 1 }}
        folders={FOLDERS}
        onCopyFolderId={vi.fn()}
        onReorderFolders={vi.fn()}
        onRequestDeleteFolder={vi.fn()}
        selectedFolderId={null}
        onCreateFolder={vi.fn()}
        onDownloadFolder={vi.fn()}
        onDropItemsToFolder={vi.fn()}
        onRenameFolder={vi.fn()}
        onSelectFolder={onSelectFolder}
      />
    );

    const folderButton = screen.getByRole("button", { name: "Projects" });

    await user.click(folderButton);

    expect(onSelectFolder).toHaveBeenCalledWith("folder-1");
    expect(folderButton).not.toHaveFocus();
  });

  it("preserves keyboard focus on a folder row for keyboard navigation", async () => {
    const user = userEvent.setup();
    const onSelectFolder = vi.fn();

    render(
      <FolderSidebar
        folderCounts={{ "folder-1": 3, "folder-2": 1 }}
        folders={FOLDERS}
        onCopyFolderId={vi.fn()}
        onReorderFolders={vi.fn()}
        onRequestDeleteFolder={vi.fn()}
        selectedFolderId={null}
        onCreateFolder={vi.fn()}
        onDownloadFolder={vi.fn()}
        onDropItemsToFolder={vi.fn()}
        onRenameFolder={vi.fn()}
        onSelectFolder={onSelectFolder}
      />
    );

    const folderButton = screen.getByRole("button", { name: "Projects" });
    folderButton.focus();

    await user.keyboard("{Enter}");

    expect(onSelectFolder).toHaveBeenCalledWith("folder-1");
    expect(folderButton).toHaveFocus();
  });

  it("clears pointer focus from the options trigger after closing the menu", async () => {
    const user = userEvent.setup();

    render(
      <FolderSidebar
        folderCounts={{ "folder-1": 3, "folder-2": 1 }}
        folders={FOLDERS}
        onCopyFolderId={vi.fn()}
        onReorderFolders={vi.fn()}
        onRequestDeleteFolder={vi.fn()}
        selectedFolderId={null}
        onCreateFolder={vi.fn()}
        onDownloadFolder={vi.fn()}
        onDropItemsToFolder={vi.fn()}
        onRenameFolder={vi.fn()}
        onSelectFolder={vi.fn()}
      />
    );

    const menuTrigger = screen.getByRole("button", {
      name: "Open Projects options",
    });

    await user.click(menuTrigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(menuTrigger);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(menuTrigger).not.toHaveFocus();
  });

  it("uses primary colors for the selected folder row", () => {
    render(
      <FolderSidebar
        folderCounts={{ "folder-1": 3, "folder-2": 1 }}
        folders={FOLDERS}
        onCopyFolderId={vi.fn()}
        onReorderFolders={vi.fn()}
        onRequestDeleteFolder={vi.fn()}
        selectedFolderId="folder-1"
        onCreateFolder={vi.fn()}
        onDownloadFolder={vi.fn()}
        onDropItemsToFolder={vi.fn()}
        onRenameFolder={vi.fn()}
        onSelectFolder={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Projects" })).toHaveClass(
      "bg-primary",
      "text-primary-foreground"
    );
    expect(
      screen.getByRole("button", { name: "Open Projects options" })
    ).toHaveClass("text-primary-foreground");
  });
});
