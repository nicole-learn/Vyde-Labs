import type { LibraryItem, LibraryItemKind } from "./types";

const STUDIO_ITEM_DRAG_DATA_TYPE = "application/vnd.tryplayground.items";
const STUDIO_ITEM_DRAG_SCHEMA = "tryplayground.library-items.v1";

interface DraggedLibraryLeadItem {
  id: string;
  kind: LibraryItemKind;
  title: string;
  previewUrl: string | null;
  prompt: string;
}

export interface DraggedLibraryItemsPayload {
  schema: typeof STUDIO_ITEM_DRAG_SCHEMA;
  itemIds: string[];
  count: number;
  sourceFolderId: string | null;
  leadItem: DraggedLibraryLeadItem;
}

export function isStudioItemDrag(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes(STUDIO_ITEM_DRAG_DATA_TYPE);
}

export function parseDraggedLibraryItemIds(dataTransfer: DataTransfer) {
  return readDraggedLibraryItems(dataTransfer)?.itemIds ?? [];
}

export function readDraggedLibraryItems(
  dataTransfer: DataTransfer
): DraggedLibraryItemsPayload | null {
  const rawValue = dataTransfer.getData(STUDIO_ITEM_DRAG_DATA_TYPE);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<DraggedLibraryItemsPayload> | string[];
    if (Array.isArray(parsed)) {
      const itemIds = parsed.filter(
        (entry): entry is string => typeof entry === "string" && entry.length > 0
      );
      if (itemIds.length === 0) return null;
      return {
        schema: STUDIO_ITEM_DRAG_SCHEMA,
        itemIds,
        count: itemIds.length,
        sourceFolderId: null,
        leadItem: {
          id: itemIds[0],
          kind: "image",
          title: "Asset",
          previewUrl: null,
          prompt: "",
        },
      };
    }

    if (
      parsed.schema !== STUDIO_ITEM_DRAG_SCHEMA ||
      !Array.isArray(parsed.itemIds) ||
      !parsed.leadItem ||
      typeof parsed.leadItem !== "object"
    ) {
      return null;
    }

    const itemIds = parsed.itemIds.filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0
    );
    if (itemIds.length === 0) return null;

    const leadItem = parsed.leadItem as Partial<DraggedLibraryLeadItem>;
    if (
      typeof leadItem.id !== "string" ||
      typeof leadItem.kind !== "string" ||
      typeof leadItem.title !== "string"
    ) {
      return null;
    }

    return {
      schema: STUDIO_ITEM_DRAG_SCHEMA,
      itemIds,
      count:
        typeof parsed.count === "number" && parsed.count > 0
          ? Math.trunc(parsed.count)
          : itemIds.length,
      sourceFolderId:
        typeof parsed.sourceFolderId === "string" && parsed.sourceFolderId.trim().length > 0
          ? parsed.sourceFolderId
          : null,
      leadItem: {
        id: leadItem.id,
        kind: leadItem.kind as LibraryItemKind,
        title: leadItem.title,
        previewUrl:
          typeof leadItem.previewUrl === "string" ? leadItem.previewUrl : null,
        prompt: typeof leadItem.prompt === "string" ? leadItem.prompt : "",
      },
    };
  } catch {
    return null;
  }
}

export function setDraggedLibraryItems(
  dataTransfer: DataTransfer,
  params: {
    itemIds: string[];
    leadItem: Pick<LibraryItem, "id" | "kind" | "title" | "previewUrl" | "prompt">;
    sourceFolderId: string | null;
  }
) {
  const itemIds = params.itemIds.filter(Boolean);
  if (itemIds.length === 0) {
    return;
  }

  const payload: DraggedLibraryItemsPayload = {
    schema: STUDIO_ITEM_DRAG_SCHEMA,
    itemIds,
    count: itemIds.length,
    sourceFolderId: params.sourceFolderId,
    leadItem: {
      id: params.leadItem.id,
      kind: params.leadItem.kind,
      title: params.leadItem.title,
      previewUrl: params.leadItem.previewUrl,
      prompt: params.leadItem.prompt,
    },
  };

  dataTransfer.effectAllowed = "copyMove";
  dataTransfer.setData("text/plain", "");
  dataTransfer.setData(STUDIO_ITEM_DRAG_DATA_TYPE, JSON.stringify(payload));
}
