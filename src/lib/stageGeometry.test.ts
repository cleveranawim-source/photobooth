import { describe, expect, it } from "vitest";
import { findLayout } from "../config/layouts";
import { SLOT_GAP, captureSlots, contentBounds, stageTransform, swapSlots } from "./stageGeometry";

const strip2 = findLayout("strip2");
const band2 = findLayout("band2");
const grid4 = findLayout("grid4");
const single = findLayout("single");

describe("captureSlots", () => {
  it("칸 수와 같으면 조각 칸 그대로", () => {
    expect(captureSlots(strip2, 4)).toEqual(strip2.cells);
  });

  it("세로 조각은 아래로 쌓인다", () => {
    const slots = captureSlots(strip2, 6);
    expect(slots).toHaveLength(6);
    expect(slots[4]).toEqual({ x: 40, y: 1800 + SLOT_GAP, w: 520, h: 316 });
    expect(slots[5]).toEqual({ x: 40, y: 1800 + SLOT_GAP + 316 + SLOT_GAP, w: 520, h: 316 });
  });

  it("가로 띠는 오른쪽으로 이어진다", () => {
    const slots = captureSlots(band2, 6);
    expect(slots[4]).toEqual({ x: 1800 + SLOT_GAP, y: 80, w: 346, h: 440 });
    expect(slots[5]).toEqual({ x: 1800 + SLOT_GAP + 346 + SLOT_GAP, y: 80, w: 346, h: 440 });
  });

  it("격자는 열 두 개를 써서 행으로 채운다", () => {
    const slots = captureSlots(grid4, 7);
    expect(slots[4]).toEqual({ x: 70, y: 1800 + SLOT_GAP, w: 515, h: 660 });
    expect(slots[5]).toEqual({ x: 615, y: 1800 + SLOT_GAP, w: 515, h: 660 });
    expect(slots[6]).toEqual({ x: 70, y: 1800 + SLOT_GAP + 660 + SLOT_GAP, w: 515, h: 660 });
  });

  it("단컷 여분은 아래", () => {
    expect(captureSlots(single, 2)[1]).toEqual({ x: 90, y: 1800 + SLOT_GAP, w: 1020, h: 1020 });
  });
});

describe("contentBounds", () => {
  it("세로 조각 + 여분 2", () => {
    expect(contentBounds(strip2, captureSlots(strip2, 6))).toEqual({ x: 0, y: 0, w: 600, h: 2472 });
  });

  it("가로 띠 + 여분 2", () => {
    expect(contentBounds(band2, captureSlots(band2, 6))).toEqual({ x: 0, y: 0, w: 2532, h: 600 });
  });
});

describe("stageTransform", () => {
  const area = { w: 760, h: 700 };

  it("활성 칸이 40% 이상이 되도록 키우고, 세로로 넘치면 활성 칸을 가운데로", () => {
    const slots = captureSlots(strip2, 6);
    const t = stageTransform(area, contentBounds(strip2, slots), slots[0]);
    expect(t.scale).toBeCloseTo(0.8861, 3);
    expect(t.x).toBeCloseTo((760 - 600 * t.scale) / 2, 1);
    expect(t.y).toBeCloseTo(350 - (166 + 158) * t.scale, 1);
  });

  it("통째로 들어가면 fit 배율로 가운데", () => {
    const t = stageTransform(area, { x: 0, y: 0, w: 1200, h: 1800 }, single.cells[0]);
    expect(t.scale).toBeCloseTo(700 / 1800, 4);
    expect(t.x).toBeCloseTo((760 - 1200 * t.scale) / 2, 1);
    expect(t.y).toBeCloseTo(0, 1);
  });

  it("가로 띠 마지막 여분은 가로로 밀려 x 가 음수", () => {
    const slots = captureSlots(band2, 6);
    const t = stageTransform(area, contentBounds(band2, slots), slots[5]);
    expect(t.scale).toBeCloseTo((0.4 * 700) / 440, 4);
    expect(t.x).toBeCloseTo(380 - (2186 + 173) * t.scale, 1);
    expect(t.y).toBeCloseTo((700 - 600 * t.scale) / 2, 1);
  });

  it("활성 칸이 없으면 fit", () => {
    const t = stageTransform(area, { x: 0, y: 0, w: 600, h: 2472 }, null);
    expect(t.scale).toBeCloseTo(700 / 2472, 4);
  });
});

describe("swapSlots", () => {
  it("두 자리를 바꾼 새 배열", () => {
    const order = [0, 1, 2, 3, 4, 5];
    expect(swapSlots(order, 1, 4)).toEqual([0, 4, 2, 3, 1, 5]);
    expect(order).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("같은 자리면 그대로", () => {
    expect(swapSlots([0, 1, 2], 2, 2)).toEqual([0, 1, 2]);
  });
});
