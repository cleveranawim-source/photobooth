import { describe, expect, it } from "vitest";
import { findLayout, singleTileLayout } from "./layouts";

describe("singleTileLayout", () => {
  it("두 조각 레이아웃은 첫 조각만 남는다", () => {
    const one = singleTileLayout(findLayout("strip2"));
    expect(one.paper).toEqual({ w: 2, h: 6 });
    expect(one.tiles).toEqual([{ x: 0, y: 0 }]);
    expect(one.cut).toBeNull();
    expect(one.cells).toBe(findLayout("strip2").cells);
  });

  it("한 조각이면 같은 객체", () => {
    const grid = findLayout("grid4");
    expect(singleTileLayout(grid)).toBe(grid);
  });
});
