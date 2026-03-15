import { describe, expect, it } from "vitest";
import { createStudioSeedSnapshot } from "./studio-local-runtime-data";

describe("createStudioSeedSnapshot", () => {
  it("starts the gallery size slider at the middle breakpoint", () => {
    expect(createStudioSeedSnapshot("local").gallerySizeLevel).toBe(3);
    expect(createStudioSeedSnapshot("hosted").gallerySizeLevel).toBe(3);
  });

  it("starts local mode with an empty workspace", () => {
    const snapshot = createStudioSeedSnapshot("local");

    expect(snapshot.folders).toEqual([]);
    expect(snapshot.runFiles).toEqual([]);
    expect(snapshot.libraryItems).toEqual([]);
    expect(snapshot.generationRuns).toEqual([]);
  });
});
