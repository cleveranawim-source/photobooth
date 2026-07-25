import type { Frame, TextSlot } from "../types";
import { roundedRect } from "./canvas";

// 조각(tile) 한 장의 바탕과 장식을 그립니다. 사진을 얹기 전에 호출됩니다.
// 좌표계는 조각 기준(0,0 = 조각 좌상단), 단위는 300dpi px.
// 제목 슬롯을 함께 받는 이유: 장식 중에는 제목에 붙어야 자연스러운 것이 있는데
// (classic 의 괘선), 레이아웃마다 제목이 위쪽 가운데일 수도 왼쪽일 수도 있기 때문입니다.

type Tile = { w: number; h: number };
type Painter = (
  context: CanvasRenderingContext2D,
  frame: Frame,
  tile: Tile,
  title: TextSlot,
) => void;

const drawPlain: Painter = (context, frame, tile) => {
  // 모서리에 은은한 원 두 개 — 여백이 허전하지 않게.
  const radius = Math.min(tile.w, tile.h) * 0.11;
  context.save();
  context.globalAlpha = 0.5;
  context.fillStyle = frame.mat;
  context.beginPath();
  context.arc(radius * 0.6, radius * 0.55, radius, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(tile.w - radius * 0.5, tile.h - radius * 0.35, radius * 1.3, 0, Math.PI * 2);
  context.fill();
  context.restore();
};

const drawClassic: Painter = (context, frame, tile, title) => {
  // 안쪽으로 한 칸 들어간 가는 테두리 + 제목 바로 아래 괘선.
  const inset = Math.round(Math.min(tile.w, tile.h) * 0.035);
  context.save();
  context.strokeStyle = frame.sub;
  context.globalAlpha = 0.55;
  context.lineWidth = 2;
  context.strokeRect(inset, inset, tile.w - inset * 2, tile.h - inset * 2);
  context.globalAlpha = 1;
  context.strokeStyle = frame.accent;
  context.lineWidth = 3;
  // 제목 글자 아래로 살짝 내려 긋습니다 — 제목이 왼쪽에 있는 가로 레이아웃에서도 따라갑니다.
  const ruleY = Math.round(title.y + title.size * 0.85);
  const ruleHalf = Math.round(Math.min((title.maxWidth ?? tile.w) * 0.42, tile.w * 0.18));
  context.beginPath();
  context.moveTo(title.x - ruleHalf, ruleY);
  context.lineTo(title.x + ruleHalf, ruleY);
  context.stroke();
  context.restore();
};

const drawArcade: Painter = (context, frame, tile) => {
  // 네온 간판처럼 두 겹 테두리 + 네 모서리 점.
  const inset = Math.round(Math.min(tile.w, tile.h) * 0.028);
  context.save();
  context.lineWidth = 5;
  context.strokeStyle = frame.accent;
  roundedRect(context, inset, inset, tile.w - inset * 2, tile.h - inset * 2, 26);
  context.stroke();
  context.lineWidth = 2;
  context.strokeStyle = frame.sub;
  context.globalAlpha = 0.8;
  roundedRect(context, inset + 10, inset + 10, tile.w - inset * 2 - 20, tile.h - inset * 2 - 20, 18);
  context.stroke();
  context.globalAlpha = 1;
  context.fillStyle = frame.sub;
  const dot = 7;
  const corners: [number, number][] = [
    [inset + 22, inset + 22],
    [tile.w - inset - 22, inset + 22],
    [inset + 22, tile.h - inset - 22],
    [tile.w - inset - 22, tile.h - inset - 22],
  ];
  corners.forEach(([x, y]) => {
    context.beginPath();
    context.arc(x, y, dot, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
};

const drawRiso: Painter = (context, frame, tile) => {
  // 리소그래프 특유의 망점 + 살짝 어긋난 2도 인쇄 느낌.
  context.save();
  context.globalAlpha = 0.16;
  context.fillStyle = frame.accent;
  const step = 22;
  const radius = 4;
  for (let y = step; y < tile.h; y += step) {
    // 아래로 갈수록 옅어지게 — 위쪽이 더 눌린 인쇄처럼 보입니다.
    context.globalAlpha = 0.2 * (1 - y / tile.h) + 0.04;
    for (let x = step; x < tile.w; x += step) {
      context.beginPath();
      context.arc(x + ((y / step) % 2) * (step / 2), y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = 0.35;
  context.strokeStyle = frame.ink;
  context.lineWidth = 3;
  const inset = Math.round(Math.min(tile.w, tile.h) * 0.03);
  context.strokeRect(inset, inset, tile.w - inset * 2, tile.h - inset * 2);
  context.globalAlpha = 0.28;
  context.strokeStyle = frame.accent;
  context.strokeRect(inset + 6, inset + 5, tile.w - inset * 2, tile.h - inset * 2); // 어긋난 판
  context.restore();
};

const drawFilm: Painter = (context, frame, tile) => {
  // 필름 가장자리의 퍼포레이션. 조각이 세로로 길면 좌우에, 가로로 길면 위아래에 뚫습니다.
  context.save();
  context.fillStyle = frame.mat;
  const vertical = tile.h >= tile.w;
  const holeLong = 26;
  const holeShort = 17;
  const gap = 44;
  if (vertical) {
    const margin = 13;
    for (let y = gap; y < tile.h - gap; y += gap) {
      roundedRect(context, margin, y, holeShort, holeLong, 4);
      context.fill();
      roundedRect(context, tile.w - margin - holeShort, y, holeShort, holeLong, 4);
      context.fill();
    }
  } else {
    const margin = 13;
    for (let x = gap; x < tile.w - gap; x += gap) {
      roundedRect(context, x, margin, holeLong, holeShort, 4);
      context.fill();
      roundedRect(context, x, tile.h - margin - holeShort, holeLong, holeShort, 4);
      context.fill();
    }
  }
  context.restore();
};

const DECOR_PAINTERS: Record<Frame["decor"], Painter> = {
  plain: drawPlain,
  classic: drawClassic,
  arcade: drawArcade,
  riso: drawRiso,
  film: drawFilm,
};

/** 조각 바탕색을 칠하고 프레임 장식을 얹습니다. */
export function paintTile(
  context: CanvasRenderingContext2D,
  frame: Frame,
  tile: Tile,
  title: TextSlot,
) {
  context.fillStyle = frame.paper;
  context.fillRect(0, 0, tile.w, tile.h);
  DECOR_PAINTERS[frame.decor](context, frame, tile, title);
}
