import type { Layout } from "../types";

// 좌표는 모두 300dpi 기준 px 입니다 (4×6인치 = 1200×1800).
// 실제 합성은 여기에 2배 확대를 걸어 2400×3600 으로 그립니다 — 저장·확대 화질용.
// 사진 칸의 가로세로비가 곧 촬영 크롭 비율이 되므로(lib/capture), 칸 크기를 바꾸면
// 미리보기 크롭도 함께 따라옵니다.

export const LAYOUTS: Layout[] = [
  {
    key: "strip2",
    name: "세로 4컷 ×2",
    hint: "가운데를 잘라 둘이 나눠 갖기",
    paper: { w: 4, h: 6 },
    tile: { w: 600, h: 1800 },
    tiles: [
      { x: 0, y: 0 },
      { x: 600, y: 0 },
    ],
    cells: [
      { x: 40, y: 166, w: 520, h: 316 },
      { x: 40, y: 500, w: 520, h: 316 },
      { x: 40, y: 834, w: 520, h: 316 },
      { x: 40, y: 1168, w: 520, h: 316 },
    ],
    title: { x: 300, y: 78, size: 52, maxWidth: 520 },
    tagline: { x: 300, y: 124, size: 19, maxWidth: 520 },
    caption: { x: 300, y: 1570, size: 38, maxWidth: 490 },
    stamp: { x: 300, y: 1691, size: 21, maxWidth: 520 },
    cut: "vertical",
  },
  {
    key: "grid4",
    name: "2×2 격자",
    hint: "사진이 커서 단체 촬영에 좋아요",
    paper: { w: 4, h: 6 },
    tile: { w: 1200, h: 1800 },
    tiles: [{ x: 0, y: 0 }],
    cells: [
      { x: 70, y: 210, w: 515, h: 660 },
      { x: 615, y: 210, w: 515, h: 660 },
      { x: 70, y: 900, w: 515, h: 660 },
      { x: 615, y: 900, w: 515, h: 660 },
    ],
    title: { x: 600, y: 110, size: 62, maxWidth: 1060 },
    tagline: { x: 600, y: 158, size: 22, maxWidth: 1060 },
    caption: { x: 600, y: 1640, size: 44, maxWidth: 1040 },
    stamp: { x: 600, y: 1720, size: 24, maxWidth: 1060 },
    cut: null,
  },
  {
    key: "band2",
    name: "가로 4컷 띠 ×2",
    hint: "책갈피처럼 길쭉한 모양",
    paper: { w: 6, h: 4 },
    tile: { w: 1800, h: 600 },
    tiles: [
      { x: 0, y: 0 },
      { x: 0, y: 600 },
    ],
    cells: [
      { x: 320, y: 80, w: 346, h: 440 },
      { x: 684, y: 80, w: 346, h: 440 },
      { x: 1048, y: 80, w: 346, h: 440 },
      { x: 1412, y: 80, w: 346, h: 440 },
    ],
    title: { x: 165, y: 230, size: 40, maxWidth: 260 },
    tagline: { x: 165, y: 285, size: 15, maxWidth: 260 },
    caption: { x: 165, y: 372, size: 26, maxWidth: 260 },
    stamp: { x: 165, y: 440, size: 16, maxWidth: 260 },
    cut: "horizontal",
  },
  {
    key: "single",
    name: "단컷 폴라로이드",
    hint: "한 장을 크게, 아래엔 문구",
    paper: { w: 4, h: 6 },
    tile: { w: 1200, h: 1800 },
    tiles: [{ x: 0, y: 0 }],
    cells: [{ x: 90, y: 190, w: 1020, h: 1020 }],
    title: { x: 600, y: 100, size: 44, maxWidth: 1020 },
    tagline: { x: 600, y: 1500, size: 26, maxWidth: 1000 },
    caption: { x: 600, y: 1400, size: 64, maxWidth: 1000 },
    stamp: { x: 600, y: 1680, size: 24, maxWidth: 1000 },
    cut: null,
  },
];

export const DEFAULT_LAYOUT = LAYOUTS[0].key;

export const findLayout = (key: string): Layout =>
  LAYOUTS.find((layout) => layout.key === key) ?? LAYOUTS[0];

/** 이 레이아웃이 필요로 하는 사진 수 */
export const shotsNeeded = (layout: Layout) => layout.cells.length;

/** 사진 칸의 가로세로비 — 촬영 크롭과 미리보기 프레임이 이 값을 씁니다. */
export const cellRatio = (layout: Layout) => layout.cells[0].w / layout.cells[0].h;
