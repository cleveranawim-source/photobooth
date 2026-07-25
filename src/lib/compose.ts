import type { Frame, Layout, TextSlot } from "../types";
import { FONT_STACKS } from "../config/frames";
import { drawCover, loadImage, roundedRect } from "./canvas";
import { paintCell, paintTile } from "./decor";

// 인화용 합성기. 레이아웃(칸 위치)과 프레임(색·장식)만 보고 그리므로,
// 새 레이아웃·프레임을 추가할 때 이 파일은 건드리지 않아도 됩니다.

/**
 * 300dpi 면 인쇄에는 충분하지만, 저장해서 폰으로 확대해 보는 화질을 위해 2배로 그립니다.
 * 촬영도 이 배율에 맞춰 잡으므로(capture 의 targetWidth) 사진은 1:1 로 들어갑니다 — 무손실.
 */
const SUPERSAMPLE = 2;
const DPI = 300;

/**
 * 캔버스는 아직 안 받은 웹폰트로 그리라고 하면 **조용히 기본 폰트로 떨어집니다**(오류도 없음).
 * 그래서 그리기 전에 실제로 찍을 글자를 넘겨 필요한 서브셋까지 확실히 받아 둡니다.
 * (구글 서브셋 폰트는 unicode-range 로 쪼개져 있어, 쓰는 글자를 알려줘야 그 조각을 받습니다.)
 */
async function ensurePrintFonts(sample: string) {
  if (!document.fonts?.load) return;
  const faces = Object.values(FONT_STACKS).map((stack) => `800 52px ${stack}`);
  try {
    await Promise.all(faces.map((face) => document.fonts.load(face, sample)));
  } catch {
    // 폰트를 못 받아도 기본 글꼴로 그립니다 — 인화 자체가 막히면 안 되니까요.
  }
}

const dateStamp = () =>
  new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );

function drawText(
  context: CanvasRenderingContext2D,
  text: string,
  slot: TextSlot,
  options: { font: string; weight: number; color: string; tracking?: number; plate?: boolean },
) {
  if (!text) return;
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${options.weight} ${slot.size}px ${options.font}`;
  // letterSpacing 은 Safari 17.4+/Chrome 지원. 미지원 기기에서는 조용히 무시됩니다.
  if (options.tracking) context.letterSpacing = `${options.tracking}px`;

  // 알록달록한 바탕에서는 글자만 얹으면 안 읽혀, 흰 라벨판을 깔아 줍니다(스티커처럼).
  if (options.plate) {
    const measured = Math.min(context.measureText(text).width, slot.maxWidth ?? Infinity);
    const plateW = measured + slot.size * 0.9;
    const plateH = slot.size * 1.6;
    context.save();
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#1a1a1a";
    context.lineWidth = Math.max(2, slot.size * 0.085);
    context.lineJoin = "round";
    roundedRect(context, slot.x - plateW / 2, slot.y - plateH / 2, plateW, plateH, plateH * 0.38);
    context.fill();
    context.stroke();
    context.restore();
  }

  context.fillStyle = options.color;
  context.fillText(text, slot.x, slot.y, slot.maxWidth);
  context.restore();
}

/**
 * 사진이 없는 가장 넓은 띠(위·아래·왼쪽·오른쪽)를 찾습니다. 로고 자리를 레이아웃마다
 * 따로 정하지 않아도 되도록, 남는 공간이 가장 큰 쪽에 알아서 넣습니다.
 * (세로 스트립은 발치, 가로 띠는 왼쪽 라벨 자리가 잡힙니다.)
 */
function widestBand(layout: Layout) {
  const cells = layout.cells;
  const x0 = Math.min(...cells.map((c) => c.x));
  const y0 = Math.min(...cells.map((c) => c.y));
  const x1 = Math.max(...cells.map((c) => c.x + c.w));
  const y1 = Math.max(...cells.map((c) => c.y + c.h));
  const bands = [
    { x: 0, y: 0, w: layout.tile.w, h: y0 },
    { x: 0, y: y1, w: layout.tile.w, h: layout.tile.h - y1 },
    { x: 0, y: 0, w: x0, h: layout.tile.h },
    { x: x1, y: 0, w: layout.tile.w - x1, h: layout.tile.h },
  ];
  return bands.reduce((best, b) => (b.w * b.h > best.w * best.h ? b : best));
}

const inside = (rect: { x: number; y: number; w: number; h: number }, x: number, y: number) =>
  x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

export type ComposeInput = {
  images: string[];
  frame: Frame;
  layout: Layout;
  title: string;
  tagline: string;
  caption: string;
  /**
   * 300dpi 대비 배율. 기본 2배는 인화·저장용이고, 선택 화면 썸네일은 0.2 정도로 줄여 씁니다.
   * 썸네일도 **같은 그리기 코드**를 타야 고를 때 본 것과 실제 인화물이 어긋나지 않습니다.
   */
  scale?: number;
  quality?: number;
};

export async function composePrint({
  images,
  frame,
  layout,
  title,
  tagline,
  caption,
  scale = SUPERSAMPLE,
  quality = 0.92,
}: ComposeInput): Promise<string> {
  const stamp = dateStamp();
  const [loaded, logo] = await Promise.all([
    Promise.all(images.slice(0, layout.cells.length).map(loadImage)),
    // 로고를 못 받아도 인화는 되게 — 그 경우 원래대로 글자를 씁니다.
    frame.logo
      ? loadImage(`${import.meta.env.BASE_URL}${frame.logo}`).catch(() => null)
      : Promise.resolve(null),
    ensurePrintFonts(`${title}${tagline}${tagline.toUpperCase()}${caption}${stamp}#0123456789`),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(layout.paper.w * DPI * scale);
  canvas.height = Math.round(layout.paper.h * DPI * scale);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("사진을 만들 수 없습니다.");
  // 아래 그리기 코드는 전부 300dpi 좌표계를 그대로 씁니다.
  context.scale(scale, scale);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const titleFont = FONT_STACKS[frame.titleFont];
  const bodyFont = FONT_STACKS.sans;
  const monoFont = FONT_STACKS.mono;
  // 로고 자리는 장식도 비켜 가야 그림이 또렷하게 읽힙니다.
  const logoBand = logo ? widestBand(layout) : null;

  layout.tiles.forEach((tile, tileIndex) => {
    context.save();
    context.translate(tile.x, tile.y);
    context.beginPath();
    context.rect(0, 0, layout.tile.w, layout.tile.h);
    context.clip();

    paintTile(context, frame, layout.tile, layout.title, layout.cells, logoBand);

    layout.cells.forEach((cell, index) => {
      const image = loaded[index];
      context.save();
      roundedRect(context, cell.x, cell.y, cell.w, cell.h, frame.photoRadius);
      context.clip();
      context.fillStyle = frame.mat;
      context.fillRect(cell.x, cell.y, cell.w, cell.h);
      if (image) {
        drawCover(context, image, image.naturalWidth, image.naturalHeight, cell.x, cell.y, cell.w, cell.h);
      }
      context.restore();
      // 사진 위·둘레 장식(테두리·테이프·컷 번호 등)은 클립을 푼 뒤에 그립니다.
      paintCell(context, frame, cell, index, layout.tile);
    });

    if (logo && logoBand) {
      // 로고가 주인공인 프레임 — 이름·영문 문구·아래 문구는 생략하고 그림만 크게 넣습니다.
      const fit = Math.min(
        (logoBand.w * 0.9) / logo.naturalWidth,
        (logoBand.h * 0.86) / logo.naturalHeight,
      );
      const lw = logo.naturalWidth * fit;
      const lh = logo.naturalHeight * fit;
      context.drawImage(
        logo,
        logoBand.x + (logoBand.w - lw) / 2,
        logoBand.y + (logoBand.h - lh) / 2,
        lw,
        lh,
      );
    } else {
      drawText(context, title, layout.title, { font: titleFont, weight: 800, color: frame.ink, plate: frame.textPlate });
      drawText(context, tagline.toUpperCase(), layout.tagline, {
        font: bodyFont,
        weight: 700,
        color: frame.accent,
        tracking: Math.max(1, Math.round(layout.tagline.size * 0.14)),
        plate: frame.textPlate,
      });
      drawText(context, caption, layout.caption, { font: titleFont, weight: 800, color: frame.ink, plate: frame.textPlate });
    }

    // 날짜 도장은 로고 자리와 겹치면 생략합니다 — 로고를 작게 줄이는 것보다 낫습니다.
    if (!logoBand || !inside(logoBand, layout.stamp.x, layout.stamp.y)) {
      context.globalAlpha = 0.7;
      drawText(
        context,
        layout.tiles.length > 1 ? `${stamp}  ·  #${String(tileIndex + 1).padStart(2, "0")}` : stamp,
        layout.stamp,
        { font: monoFont, weight: 600, color: frame.sub, plate: frame.textPlate },
      );
      context.globalAlpha = 1;
    }

    context.restore();
  });

  if (layout.cut && layout.tiles.length > 1) {
    const paperWidth = layout.paper.w * DPI;
    const paperHeight = layout.paper.h * DPI;
    context.save();
    context.strokeStyle = frame.sub;
    context.globalAlpha = 0.7;
    context.lineWidth = 4;
    context.setLineDash([18, 14]);
    context.beginPath();
    if (layout.cut === "vertical") {
      context.moveTo(paperWidth / 2, 18);
      context.lineTo(paperWidth / 2, paperHeight - 18);
    } else {
      context.moveTo(18, paperHeight / 2);
      context.lineTo(paperWidth - 18, paperHeight / 2);
    }
    context.stroke();
    context.restore();
  }

  // 2배 해상도라 0.92 로도 인쇄·확대 화질이 충분하고 파일 크기를 줄입니다.
  return canvas.toDataURL("image/jpeg", quality);
}

/** 카메라 없이 전체 흐름을 둘러볼 때 쓰는 가짜 사진들. */
export function makeSampleShots(count: number, ratio: number) {
  const palettes = [
    ["#f7b3c9", "#814d6a"],
    ["#a8d9d4", "#2b716f"],
    ["#f6cf83", "#8c572e"],
    ["#b9c6ef", "#4c568f"],
    ["#e7b7f0", "#6b3f7a"],
    ["#b6e5b0", "#3f6b3a"],
  ];
  return Array.from({ length: count }, (_, index) => {
    const [background, ink] = palettes[index % palettes.length];
    const width = 900;
    const height = Math.round(width / ratio);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height * 0.46;
    const head = Math.min(width, height) * 0.22;
    context.fillStyle = "rgba(255,255,255,.45)";
    context.beginPath();
    context.arc(width * 0.24, height * 0.24, head * 0.9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ink;
    context.beginPath();
    context.arc(cx, cy, head, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = background;
    context.beginPath();
    context.arc(cx - head * 0.34, cy - head * 0.16, head * 0.1, 0, Math.PI * 2);
    context.arc(cx + head * 0.34, cy - head * 0.16, head * 0.1, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = background;
    context.lineWidth = head * 0.11;
    context.lineCap = "round";
    context.beginPath();
    context.arc(cx, cy + head * 0.12, head * 0.44, 0.2, Math.PI - 0.2);
    context.stroke();
    context.fillStyle = "rgba(255,255,255,.8)";
    context.font = `800 ${Math.round(height * 0.09)}px ${FONT_STACKS.sans}`;
    context.textAlign = "center";
    context.fillText(`SAMPLE ${index + 1}`, cx, height * 0.87);
    return canvas.toDataURL("image/jpeg", 0.9);
  });
}
