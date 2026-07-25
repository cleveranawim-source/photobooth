import type { Frame, LayoutCell, TextSlot } from "../types";
import { FONT_STACKS } from "../config/frames";
import { roundedRect } from "./canvas";

// 프레임 장식. 좌표계는 조각(tile) 기준(0,0 = 조각 좌상단), 단위는 300dpi px.
//
// 프레임마다 두 번 그릴 기회를 줍니다:
//   tile — 사진을 얹기 전, 바탕 장식
//   cell — 사진 한 칸을 그린 직후, 사진 위·둘레 장식
// 사진이 인화물의 대부분을 차지하므로, 칸을 어떻게 두르느냐가 개성을 가장 크게 좌우합니다.
// (바탕색만 바꾸면 어떤 프레임이든 구조가 똑같아 보입니다.)

type Tile = { w: number; h: number };

type Painter = {
  tile: (context: CanvasRenderingContext2D, frame: Frame, tile: Tile, title: TextSlot) => void;
  cell?: (
    context: CanvasRenderingContext2D,
    frame: Frame,
    cell: LayoutCell,
    index: number,
    tile: Tile,
  ) => void;
};

// 같은 사진이면 항상 같은 장식이 나오도록 좌표 기반 의사난수를 씁니다(Math.random 미사용).
const rand = (seed: number) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

/** 4갈래 반짝임 — 뾰족한 별보다 부드럽고 인화물에서 잘 읽힙니다. */
function sparkle(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const waist = radius * 0.16;
  context.beginPath();
  context.moveTo(x, y - radius);
  context.quadraticCurveTo(x + waist, y - waist, x + radius, y);
  context.quadraticCurveTo(x + waist, y + waist, x, y + radius);
  context.quadraticCurveTo(x - waist, y + waist, x - radius, y);
  context.quadraticCurveTo(x - waist, y - waist, x, y - radius);
  context.closePath();
  context.fill();
}

function heart(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size / 2;
  context.beginPath();
  context.moveTo(x, y + s * 0.9);
  context.bezierCurveTo(x - s * 1.6, y - s * 0.4, x - s * 0.55, y - s * 1.35, x, y - s * 0.35);
  context.bezierCurveTo(x + s * 0.55, y - s * 1.35, x + s * 1.6, y - s * 0.4, x, y + s * 0.9);
  context.closePath();
  context.fill();
}

function leaf(context: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.beginPath();
  context.moveTo(0, -size);
  context.quadraticCurveTo(size * 0.72, -size * 0.15, 0, size);
  context.quadraticCurveTo(-size * 0.72, -size * 0.15, 0, -size);
  context.closePath();
  context.fill();
  context.restore();
}

function wave(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  amplitude: number,
  cycles: number,
) {
  context.beginPath();
  const step = width / (cycles * 2);
  context.moveTo(x, y);
  for (let i = 0; i < cycles * 2; i += 1) {
    context.quadraticCurveTo(
      x + step * (i + 0.5),
      y + (i % 2 === 0 ? -amplitude : amplitude),
      x + step * (i + 1),
      y,
    );
  }
  context.stroke();
}

/** 마스킹 테이프 한 장 — 스크랩북 느낌의 핵심 장식. */
function tape(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  color: string,
) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.globalAlpha = 0.72;
  context.fillStyle = color;
  context.fillRect(-width / 2, -height / 2, width, height);
  // 찢어진 테이프 끝을 톱니로 흉내 냅니다.
  context.globalAlpha = 0.5;
  const teeth = 6;
  for (let i = 0; i < teeth; i += 1) {
    const th = height / teeth;
    const inset = (i % 2 === 0 ? 1 : -1) * height * 0.08;
    context.fillRect(-width / 2 - inset, -height / 2 + i * th, inset > 0 ? inset : -inset, th);
    context.fillRect(width / 2 - (inset > 0 ? 0 : -inset), -height / 2 + i * th, Math.abs(inset), th);
  }
  context.restore();
}

const outlineCell = (
  context: CanvasRenderingContext2D,
  cell: LayoutCell,
  radius: number,
  color: string,
  lineWidth: number,
  alpha = 1,
) => {
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  roundedRect(context, cell.x, cell.y, cell.w, cell.h, radius);
  context.stroke();
  context.restore();
};

// ── 네온 아케이드 ────────────────────────────────────────────────────
// 오락실 간판: 스캔라인 + 두 겹 네온 테두리 + 반짝임. 사진은 시안/핑크 이중 윤곽으로.
const arcade: Painter = {
  tile: (context, frame, tile) => {
    context.save();
    context.globalAlpha = 0.05;
    context.fillStyle = "#ffffff";
    for (let y = 0; y < tile.h; y += 9) context.fillRect(0, y, tile.w, 3);
    context.restore();

    const inset = Math.round(Math.min(tile.w, tile.h) * 0.028);
    context.save();
    context.lineWidth = 5;
    context.strokeStyle = frame.accent;
    roundedRect(context, inset, inset, tile.w - inset * 2, tile.h - inset * 2, 26);
    context.stroke();
    context.globalAlpha = 0.8;
    context.lineWidth = 2;
    context.strokeStyle = frame.sub;
    roundedRect(context, inset + 10, inset + 10, tile.w - inset * 2 - 20, tile.h - inset * 2 - 20, 18);
    context.stroke();
    context.restore();

    context.save();
    context.fillStyle = frame.sub;
    const big = Math.min(tile.w, tile.h) * 0.045;
    sparkle(context, inset + 34, inset + 34, big);
    sparkle(context, tile.w - inset - 34, tile.h - inset - 34, big);
    context.fillStyle = frame.accent;
    context.globalAlpha = 0.85;
    for (let i = 0; i < 5; i += 1) {
      sparkle(
        context,
        rand(i + 1) * tile.w,
        rand(i + 9) * tile.h,
        big * (0.35 + rand(i + 21) * 0.4),
      );
    }
    context.restore();
  },
  cell: (context, frame, cell) => {
    // 핑크를 어긋나게 깔고 그 위에 시안 — 네온사인의 이중 잔상처럼 보입니다.
    context.save();
    context.translate(4, 4);
    outlineCell(context, cell, frame.photoRadius, frame.accent, 5, 0.85);
    context.restore();
    outlineCell(context, cell, frame.photoRadius, frame.sub, 3);
  },
};

// ── 리소 페이퍼 ──────────────────────────────────────────────────────
// 2도 인쇄: 망점 + 판이 살짝 어긋난 겹침. 사진에도 같은 어긋남을 줍니다.
const riso: Painter = {
  tile: (context, frame, tile, title) => {
    context.save();
    const step = 22;
    context.fillStyle = frame.accent;
    for (let y = step; y < tile.h; y += step) {
      context.globalAlpha = 0.2 * (1 - y / tile.h) + 0.04;
      for (let x = step; x < tile.w; x += step) {
        context.beginPath();
        context.arc(x + ((y / step) % 2) * (step / 2), y, 4, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();

    // 오버프린트한 큰 원 하나 — 리소 특유의 색 겹침.
    context.save();
    context.globalAlpha = 0.17;
    context.fillStyle = frame.accent;
    context.beginPath();
    context.arc(tile.w * 0.86, tile.h * 0.09, Math.min(tile.w, tile.h) * 0.13, 0, Math.PI * 2);
    context.fill();
    context.restore();

    // 제목 아래 물결선
    context.save();
    context.strokeStyle = frame.accent;
    context.lineWidth = 4;
    context.lineCap = "round";
    const waveWidth = Math.min((title.maxWidth ?? tile.w) * 0.66, tile.w * 0.42);
    wave(context, title.x - waveWidth / 2, title.y + title.size * 0.92, waveWidth, 5, 4);
    context.restore();

    context.save();
    const inset = Math.round(Math.min(tile.w, tile.h) * 0.03);
    context.globalAlpha = 0.32;
    context.strokeStyle = frame.ink;
    context.lineWidth = 3;
    context.strokeRect(inset, inset, tile.w - inset * 2, tile.h - inset * 2);
    context.globalAlpha = 0.26;
    context.strokeStyle = frame.accent;
    context.strokeRect(inset + 6, inset + 5, tile.w - inset * 2, tile.h - inset * 2);
    context.restore();
  },
  cell: (context, frame, cell) => {
    context.save();
    context.translate(6, 5);
    outlineCell(context, cell, frame.photoRadius, frame.accent, 4, 0.55);
    context.restore();
    outlineCell(context, cell, frame.photoRadius, frame.ink, 2.5, 0.7);
  },
};

// ── 모노크롬 스튜디오 ────────────────────────────────────────────────
// 사진관 인화지: 두 겹 헤어라인 + 네 귀 재단 표시(크롭 마크) + 얇은 괘선.
const mono: Painter = {
  tile: (context, frame, tile, title) => {
    const inset = Math.round(Math.min(tile.w, tile.h) * 0.035);
    context.save();
    context.strokeStyle = frame.sub;
    context.globalAlpha = 0.5;
    context.lineWidth = 2;
    context.strokeRect(inset, inset, tile.w - inset * 2, tile.h - inset * 2);
    context.globalAlpha = 0.28;
    context.lineWidth = 1.5;
    context.strokeRect(inset + 7, inset + 7, tile.w - inset * 2 - 14, tile.h - inset * 2 - 14);
    context.restore();

    // 재단 표시 — 인화 현장의 기호라 사진관 느낌을 확 살립니다.
    context.save();
    context.strokeStyle = frame.sub;
    context.globalAlpha = 0.75;
    context.lineWidth = 2;
    const mark = Math.min(tile.w, tile.h) * 0.035;
    const gap = Math.round(inset * 0.42);
    const corners: [number, number, number, number][] = [
      [gap, gap, 1, 1],
      [tile.w - gap, gap, -1, 1],
      [gap, tile.h - gap, 1, -1],
      [tile.w - gap, tile.h - gap, -1, -1],
    ];
    corners.forEach(([x, y, dx, dy]) => {
      context.beginPath();
      context.moveTo(x, y + dy * mark);
      context.lineTo(x, y);
      context.lineTo(x + dx * mark, y);
      context.stroke();
    });
    context.restore();

    context.save();
    context.strokeStyle = frame.accent;
    context.lineWidth = 3;
    const ruleY = Math.round(title.y + title.size * 0.85);
    const ruleHalf = Math.round(Math.min((title.maxWidth ?? tile.w) * 0.42, tile.w * 0.18));
    context.beginPath();
    context.moveTo(title.x - ruleHalf, ruleY);
    context.lineTo(title.x + ruleHalf, ruleY);
    context.stroke();
    // 괘선 가운데의 작은 마름모
    context.fillStyle = frame.accent;
    context.save();
    context.translate(title.x, ruleY);
    context.rotate(Math.PI / 4);
    const d = 7;
    context.fillRect(-d / 2, -d / 2, d, d);
    context.restore();
    context.restore();
  },
  cell: (context, frame, cell) => {
    outlineCell(context, cell, frame.photoRadius, frame.sub, 2, 0.55);
  },
};

// ── 필름 스트립 ──────────────────────────────────────────────────────
// 퍼포레이션 + 컷마다 프레임 번호. 실제 35mm 필름의 표기를 흉내 냅니다.
const film: Painter = {
  tile: (context, frame, tile) => {
    context.save();
    context.fillStyle = frame.mat;
    const vertical = tile.h >= tile.w;
    const holeLong = 26;
    const holeShort = 17;
    const gap = 44;
    const margin = 13;
    if (vertical) {
      for (let y = gap; y < tile.h - gap; y += gap) {
        roundedRect(context, margin, y, holeShort, holeLong, 4);
        context.fill();
        roundedRect(context, tile.w - margin - holeShort, y, holeShort, holeLong, 4);
        context.fill();
      }
    } else {
      for (let x = gap; x < tile.w - gap; x += gap) {
        roundedRect(context, x, margin, holeLong, holeShort, 4);
        context.fill();
        roundedRect(context, x, tile.h - margin - holeShort, holeLong, holeShort, 4);
        context.fill();
      }
    }
    context.restore();

    // 필름 베이스의 주황 띠 + 규격 표기
    context.save();
    context.globalAlpha = 0.5;
    context.fillStyle = frame.accent;
    if (vertical) context.fillRect(margin + holeShort + 6, 0, 3, tile.h);
    else context.fillRect(0, margin + holeShort + 6, tile.w, 3);
    context.globalAlpha = 0.85;
    context.fillStyle = frame.accent;
    context.font = `700 15px ${FONT_STACKS.mono}`;
    context.textBaseline = "middle";
    if (vertical) {
      context.save();
      context.translate(tile.w - 22, tile.h * 0.5);
      context.rotate(Math.PI / 2);
      context.textAlign = "center";
      context.fillText("35mm · ISO 400 · DX", 0, 0);
      context.restore();
    } else {
      context.textAlign = "center";
      context.fillText("35mm · ISO 400 · DX", tile.w * 0.5, tile.h - 24);
    }
    context.restore();
  },
  cell: (context, frame, cell, index) => {
    outlineCell(context, cell, frame.photoRadius, frame.mat, 3, 0.9);
    context.save();
    context.fillStyle = frame.accent;
    // 세로 4컷은 칸 사이가 18px 뿐이라, 글자가 다음 사진을 침범하지 않게 작게 붙입니다.
    context.font = `700 13px ${FONT_STACKS.mono}`;
    context.textAlign = "left";
    context.textBaseline = "top";
    // 필름의 컷 번호 표기(12, 12A, 13 …)
    const label = `${11 + index}${index % 2 === 1 ? "A" : ""}`;
    context.fillText(label, cell.x + 6, cell.y + cell.h + 2);
    context.restore();
  },
};

// ── 소다 팝 ──────────────────────────────────────────────────────────
// 탄산 방울 + 물결 띠. 사진은 굵고 둥근 주황 테두리로 스티커처럼.
const soda: Painter = {
  tile: (context, frame, tile) => {
    context.save();
    context.fillStyle = frame.mat;
    for (let i = 0; i < 14; i += 1) {
      context.globalAlpha = 0.25 + rand(i + 3) * 0.35;
      const radius = Math.min(tile.w, tile.h) * (0.018 + rand(i + 31) * 0.05);
      context.beginPath();
      context.arc(rand(i + 5) * tile.w, rand(i + 17) * tile.h, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    context.save();
    context.globalAlpha = 0.5;
    context.strokeStyle = frame.accent;
    context.lineWidth = 5;
    context.lineCap = "round";
    wave(context, tile.w * 0.08, tile.h * 0.965, tile.w * 0.84, tile.h * 0.012, 5);
    context.restore();
  },
  cell: (context, frame, cell) => {
    outlineCell(context, cell, frame.photoRadius, frame.accent, 7);
    context.save();
    context.globalAlpha = 0.9;
    context.fillStyle = frame.paper;
    context.beginPath();
    context.arc(cell.x + cell.w - 20, cell.y + 20, 9, 0, Math.PI * 2);
    context.fill();
    context.restore();
  },
};

// ── 체리 블라썸 ──────────────────────────────────────────────────────
// 흩날리는 꽃잎 + 점선 레이스 테두리 + 작은 하트.
const blossom: Painter = {
  tile: (context, frame, tile) => {
    context.save();
    for (let i = 0; i < 16; i += 1) {
      context.globalAlpha = 0.3 + rand(i + 7) * 0.4;
      context.fillStyle = i % 3 === 0 ? frame.accent : frame.mat;
      const size = Math.min(tile.w, tile.h) * (0.016 + rand(i + 41) * 0.028);
      leaf(context, rand(i + 2) * tile.w, rand(i + 13) * tile.h, size, rand(i + 23) * Math.PI);
    }
    context.restore();

    context.save();
    context.globalAlpha = 0.55;
    context.strokeStyle = frame.accent;
    context.lineWidth = 3;
    context.lineCap = "round";
    context.setLineDash([2, 12]);
    const inset = Math.round(Math.min(tile.w, tile.h) * 0.032);
    roundedRect(context, inset, inset, tile.w - inset * 2, tile.h - inset * 2, 22);
    context.stroke();
    context.restore();
  },
  cell: (context, frame, cell) => {
    context.save();
    context.strokeStyle = frame.accent;
    context.lineWidth = 3.5;
    context.lineCap = "round";
    context.setLineDash([2, 10]);
    roundedRect(context, cell.x, cell.y, cell.w, cell.h, frame.photoRadius);
    context.stroke();
    context.restore();
    context.save();
    context.fillStyle = frame.accent;
    heart(context, cell.x + cell.w - 22, cell.y + 22, 22);
    context.restore();
  },
};

// ── 포레스트 ─────────────────────────────────────────────────────────
// 달 + 나무 실루엣 + 나뭇잎. 조용한 숲의 밤.
const forest: Painter = {
  tile: (context, frame, tile) => {
    context.save();
    context.globalAlpha = 0.22;
    context.fillStyle = frame.accent;
    context.beginPath();
    context.arc(tile.w * 0.82, tile.h * 0.07, Math.min(tile.w, tile.h) * 0.1, 0, Math.PI * 2);
    context.fill();
    context.restore();

    // 아래쪽 나무 실루엣
    context.save();
    context.globalAlpha = 0.4;
    context.fillStyle = frame.mat;
    const count = Math.max(5, Math.round(tile.w / 90));
    for (let i = 0; i < count; i += 1) {
      const x = (tile.w / count) * (i + 0.5);
      const height = tile.h * (0.035 + rand(i + 11) * 0.045);
      const width = height * 0.5;
      context.beginPath();
      context.moveTo(x, tile.h - height);
      context.lineTo(x + width / 2, tile.h);
      context.lineTo(x - width / 2, tile.h);
      context.closePath();
      context.fill();
    }
    context.restore();

    context.save();
    for (let i = 0; i < 9; i += 1) {
      context.globalAlpha = 0.25 + rand(i + 19) * 0.3;
      context.fillStyle = frame.accent;
      leaf(
        context,
        rand(i + 6) * tile.w,
        rand(i + 29) * tile.h,
        Math.min(tile.w, tile.h) * (0.014 + rand(i + 37) * 0.022),
        rand(i + 43) * Math.PI,
      );
    }
    context.restore();
  },
  cell: (context, frame, cell) => {
    outlineCell(context, cell, frame.photoRadius, frame.sub, 2.5, 0.65);
    context.save();
    context.globalAlpha = 0.9;
    context.fillStyle = frame.accent;
    leaf(context, cell.x + cell.w - 20, cell.y + 20, 15, -0.5);
    context.restore();
  },
};

// ── 크래프트 노트 ────────────────────────────────────────────────────
// 종이결 + 박음질 테두리 + 사진 귀퉁이의 마스킹 테이프. 스크랩북처럼.
const kraft: Painter = {
  tile: (context, frame, tile) => {
    context.save();
    const step = 17;
    context.fillStyle = frame.ink;
    for (let y = step; y < tile.h; y += step) {
      context.globalAlpha = 0.05;
      for (let x = step; x < tile.w; x += step) {
        context.beginPath();
        context.arc(x + ((y / step) % 2) * (step / 2), y, 2.2, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();

    // 박음질(스티치) 테두리
    context.save();
    context.globalAlpha = 0.45;
    context.strokeStyle = frame.ink;
    context.lineWidth = 3;
    context.lineCap = "butt";
    context.setLineDash([11, 9]);
    const inset = Math.round(Math.min(tile.w, tile.h) * 0.032);
    context.strokeRect(inset, inset, tile.w - inset * 2, tile.h - inset * 2);
    context.restore();
  },
  cell: (context, frame, cell, index) => {
    outlineCell(context, cell, frame.photoRadius, frame.ink, 2, 0.35);
    // 홀수·짝수 컷의 테이프 방향을 바꿔 손으로 붙인 느낌을 냅니다.
    const flip = index % 2 === 0 ? 1 : -1;
    const tapeWidth = Math.min(cell.w, cell.h) * 0.34;
    const tapeHeight = Math.min(cell.w, cell.h) * 0.11;
    tape(context, cell.x + 6, cell.y + 6, tapeWidth, tapeHeight, flip * -0.7, frame.accent);
    tape(
      context,
      cell.x + cell.w - 6,
      cell.y + cell.h - 6,
      tapeWidth,
      tapeHeight,
      flip * -0.7,
      frame.sub,
    );
  },
};

// ── 기본(장식 없는 프레임용) ─────────────────────────────────────────
const plain: Painter = {
  tile: (context, frame, tile) => {
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
  },
};

const PAINTERS: Record<Frame["decor"], Painter> = {
  plain,
  classic: mono,
  arcade,
  riso,
  film,
  soda,
  blossom,
  forest,
  kraft,
};

/** 조각 바탕색을 칠하고 프레임 장식을 얹습니다(사진 아래). */
export function paintTile(
  context: CanvasRenderingContext2D,
  frame: Frame,
  tile: Tile,
  title: TextSlot,
) {
  context.fillStyle = frame.paper;
  context.fillRect(0, 0, tile.w, tile.h);
  PAINTERS[frame.decor].tile(context, frame, tile, title);
}

/** 사진 한 칸을 그린 직후의 장식(테두리·테이프·번호 등). */
export function paintCell(
  context: CanvasRenderingContext2D,
  frame: Frame,
  cell: LayoutCell,
  index: number,
  tile: Tile,
) {
  PAINTERS[frame.decor].cell?.(context, frame, cell, index, tile);
}
