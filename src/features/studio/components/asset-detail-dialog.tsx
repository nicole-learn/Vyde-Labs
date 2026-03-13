"use client";

import { useState } from "react";
import { AudioAssetDialog } from "./asset-detail-dialog/audio-asset-dialog";
import { GeneratedTextDialog } from "./asset-detail-dialog/generated-text-dialog";
import { MediaAssetDialog } from "./asset-detail-dialog/media-asset-dialog";
import { formatAssetCreatedAt } from "./asset-detail-dialog/asset-detail-shared";
import { UploadedTextDialog } from "./asset-detail-dialog/uploaded-text-dialog";
import type { LibraryItem } from "../types";

interface AssetDetailDialogProps {
  item: LibraryItem | null;
  open: boolean;
  onClose: () => void;
  onDelete: (itemId: string) => void;
  onDownload: (item: LibraryItem) => void;
  onReuse: (itemId: string) => void;
  onSaveText: (
    itemId: string,
    patch: { title?: string; contentText?: string }
  ) => void;
}

interface AssetDetailDialogContentProps extends Omit<AssetDetailDialogProps, "item" | "open"> {
  item: LibraryItem;
}

function AssetDetailDialogContent({
  item,
  onClose,
  onDelete,
  onDownload,
  onReuse,
  onSaveText,
}: AssetDetailDialogContentProps) {
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [draftBody, setDraftBody] = useState(item.contentText ?? item.prompt ?? "");

  const createdLabel = formatAssetCreatedAt(item.createdAt);
  const dirty =
    draftTitle.trim() !== item.title.trim() ||
    draftBody.trim() !== (item.contentText ?? item.prompt ?? "").trim();

  const handleSave = () => {
    onSaveText(item.id, {
      title: draftTitle,
      contentText: draftBody,
    });
  };

  if (item.kind === "audio") {
    return (
      <AudioAssetDialog
        item={item}
        onClose={onClose}
        onDelete={() => onDelete(item.id)}
        onDownload={() => onDownload(item)}
        onReuse={() => onReuse(item.id)}
      />
    );
  }

  if (item.kind === "image" || item.kind === "video") {
    return (
      <MediaAssetDialog
        item={item}
        onClose={onClose}
        onDelete={() => onDelete(item.id)}
        onDownload={() => onDownload(item)}
        onReuse={() => onReuse(item.id)}
      />
    );
  }

  if (item.source === "generated") {
    return (
      <GeneratedTextDialog
        body={draftBody}
        createdLabel={createdLabel}
        dirty={dirty}
        item={item}
        onBodyChange={setDraftBody}
        onClose={onClose}
        onDelete={() => onDelete(item.id)}
        onDownload={() => onDownload(item)}
        onReuse={() => onReuse(item.id)}
        onSave={handleSave}
        onTitleChange={setDraftTitle}
        title={draftTitle}
      />
    );
  }

  return (
    <UploadedTextDialog
      body={draftBody}
      createdLabel={createdLabel}
      dirty={dirty}
      item={item}
      onBodyChange={setDraftBody}
      onClose={onClose}
      onDelete={() => onDelete(item.id)}
      onDownload={() => onDownload(item)}
      onReuse={() => onReuse(item.id)}
      onSave={handleSave}
      onTitleChange={setDraftTitle}
      title={draftTitle}
    />
  );
}

export function AssetDetailDialog({
  item,
  open,
  onClose,
  onDelete,
  onDownload,
  onReuse,
  onSaveText,
}: AssetDetailDialogProps) {
  if (!open || !item) {
    return null;
  }

  return (
    <AssetDetailDialogContent
      key={`${item.id}:${item.updatedAt}`}
      item={item}
      onClose={onClose}
      onDelete={onDelete}
      onDownload={onDownload}
      onReuse={onReuse}
      onSaveText={onSaveText}
    />
  );
}
