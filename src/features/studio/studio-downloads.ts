"use client";

import {
  getLibraryItemDownloadFileName,
  readLibraryItemSourceBlob,
} from "./studio-library-item-source";
import type { LibraryItem } from "./types";

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }
}

async function getDownloadBlob(item: LibraryItem) {
  return readLibraryItemSourceBlob(item);
}

function triggerDownload(url: string, fileName: string) {
  if (typeof window === "undefined") return;

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function writeBlobToDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
  blob: Blob
) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function downloadLibraryItem(item: LibraryItem) {
  if (typeof window === "undefined") return;

  const blob = await getDownloadBlob(item);
  if (!blob) {
    return;
  }

  const fileName = getLibraryItemDownloadFileName(item);
  const url = URL.createObjectURL(blob);
  triggerDownload(url, fileName);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadFolderItems(items: LibraryItem[]) {
  if (items.length === 0 || typeof window === "undefined") return;

  if (items.length > 1 && typeof window.showDirectoryPicker === "function") {
    try {
      const directoryHandle = await window.showDirectoryPicker();
      for (const item of items) {
        const blob = await getDownloadBlob(item);
        if (!blob) {
          continue;
        }

        await writeBlobToDirectory(
          directoryHandle,
          getLibraryItemDownloadFileName(item),
          blob
        );
      }
      return;
    } catch {
      // Fall back to regular browser downloads when the picker is unavailable or cancelled.
    }
  }

  for (const item of items) {
    await downloadLibraryItem(item);
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
}
