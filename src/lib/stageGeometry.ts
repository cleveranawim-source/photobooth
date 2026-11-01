import type { Layout, LayoutCell } from "../types";

// ── 인화물 무대의 기하 ───────────────────────────────────────────────
// 좌표계는 조각(tile) 기준 300dpi px 입니다 — layouts.ts 의 칸 좌표와 같습니다.
// 촬영·바꾸기 화면은 조각 한 장을 이 좌표계로 그린 뒤 변환 하나(translate+scale)로
// 화면에 얹습니다. 칸 수를 넘는 "여분" 사진은 조각 바깥으로 같은 크기 칸을 이어 붙여,
// 필름이 계속 감기듯 보이게 합니다.

export type Rect = { x: number; y: number; w: number; h: number };

/** 여분 칸 사이, 그리고 조각 가장자리와 첫 여분 사이의 간격(조각 단위 px) */
export const SLOT_GAP = 20;

const unique = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);

/**
 * 조각의 칸 뒤에 여분 칸을 같은 크기로 이어 붙입니다. 이어 붙일 때 조각 안 칸들의
 * 열(또는 행) 위치를 그대로 써서, 2×2 격자의 여분은 두 칸씩 한 줄이 됩니다.
 * side 가 "right" 면 오른쪽으로(칸들의 행을 따라), "below" 면 아래로(칸들의 열을 따라).
 */
function appendExtras(layout: Layout, total: number, side: "right" | "below"): LayoutCell[] {
  const cells = layout.cells;
  const extras = total - cells.length;
  if (extras <= 0) return cells;

  const { w, h } = cells[0];
  const slots: LayoutCell[] = [...cells];
  if (side === "right") {
    const rows = unique(cells.map((cell) => cell.y));
    const x0 = layout.tile.w + SLOT_GAP;
    for (let i = 0; i < extras; i += 1) {
      const column = Math.floor(i / rows.length);
      slots.push({ x: x0 + column * (w + SLOT_GAP), y: rows[i % rows.length], w, h });
    }
  } else {
    const columns = unique(cells.map((cell) => cell.x));
    const y0 = layout.tile.h + SLOT_GAP;
    for (let i = 0; i < extras; i += 1) {
      const row = Math.floor(i / columns.length);
      slots.push({ x: columns[i % columns.length], y: y0 + row * (h + SLOT_GAP), w, h });
    }
  }
  return slots;
}

/**
 * 촬영 칸 전부 — 여분이 필름 방향으로 이어집니다. 가로로 긴 조각(가로 띠)은 오른쪽으로,
 * 나머지는 아래로. 활성 칸만 크게 보이면 되므로 내용이 길어져도 괜찮습니다(밀어서 보여줌).
 */
export function captureSlots(layout: Layout, total: number): LayoutCell[] {
  return appendExtras(layout, total, layout.tile.w > layout.tile.h ? "right" : "below");
}

/**
 * 바꾸기 화면의 칸 — 여분이 필름의 **옆**(다른 축)에 붙습니다. 세로 조각은 오른쪽 열,
 * 가로 띠는 아래 행. 바꾸기 화면은 전부를 한눈에 비교해야 해서 통째로(fit) 보여주는데,
 * 촬영처럼 아래로 길게 이으면 세로 4컷이 2472px 짜리가 되어 칸이 손톱만 해집니다.
 */
export function reviewSlots(layout: Layout, total: number): LayoutCell[] {
  return appendExtras(layout, total, layout.tile.w > layout.tile.h ? "below" : "right");
}

/** 조각 사각형과 모든 칸을 감싸는 경계. */
export function contentBounds(layout: Layout, slots: LayoutCell[]): Rect {
  let minX = 0;
  let minY = 0;
  let maxX = layout.tile.w;
  let maxY = layout.tile.h;
  for (const slot of slots) {
    minX = Math.min(minX, slot.x);
    minY = Math.min(minY, slot.y);
    maxX = Math.max(maxX, slot.x + slot.w);
    maxY = Math.max(maxY, slot.y + slot.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** CSS `translate(x px, y px) scale(scale)`, 원점은 내용의 좌상단. x·y 는 화면 px. */
export type StageTransform = { scale: number; x: number; y: number };

/**
 * 내용(조각+여분)을 영역에 놓는 변환.
 *
 * 활성 칸이 있으면 그 칸 높이가 영역 높이의 minCellFraction 이상이 되도록 배율을 올립니다 —
 * 세로 4컷을 통째로 넣으면 칸 하나가 손바닥만 해져 표정이 안 보이기 때문입니다.
 * 그 배율에서 내용이 영역을 넘치는 축은 활성 칸의 중심이 영역 중심에 오도록 밀고,
 * 넘치지 않는 축은 가운데 정렬합니다. 활성 칸이 없으면 통째로 맞춰(fit) 가운데 둡니다.
 */
export function stageTransform(
  area: { w: number; h: number },
  bounds: Rect,
  active: Rect | null,
  minCellFraction = 0.4,
): StageTransform {
  const fit = Math.min(area.w / bounds.w, area.h / bounds.h);
  const scale = active ? Math.max(fit, (minCellFraction * area.h) / active.h) : fit;

  const place = (areaSize: number, boundsStart: number, boundsSize: number, activeCenter: number) => {
    const contentSize = boundsSize * scale;
    if (!active || contentSize <= areaSize) return (areaSize - contentSize) / 2 - boundsStart * scale;
    return areaSize / 2 - activeCenter * scale;
  };

  return {
    scale,
    x: place(area.w, bounds.x, bounds.w, active ? active.x + active.w / 2 : 0),
    y: place(area.h, bounds.y, bounds.h, active ? active.y + active.h / 2 : 0),
  };
}

/** 두 자리의 사진을 맞바꾼 새 순서. order 는 shots 인덱스 배열입니다. */
export function swapSlots(order: number[], a: number, b: number): number[] {
  const next = [...order];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
