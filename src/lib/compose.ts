import type { Frame, Layout, TextSlot } from "../types";
import { FONT_STACKS } from "../config/frames";
import { drawCover, loadImage, roundedRect } from "./canvas";
import { paintTile } from "./decor";

// 인화용 합성기. 레이아웃(칸 위치)과 프레임(색·장식)만 보고 그리므로,
// 새 레이아웃·프레임을 추가할 때 이 파일은 건드리지 않아도 됩니다.

/**
 * 300dpi 면 인쇄에는 충분하지만, 저장해서 폰으로 확대해 보는 화질을 위해 2배로 그립니다.
 * 촬영도 이 배율에 맞춰 잡으므로(capture 의 targetWidth) 사진은 1:1 로 들어갑니다 — 무손실.
 */
const SUPERSAMPLE = 2;
const DPI = 300;

const dateStamp = () =>
  new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );

function drawText(
  context: CanvasRenderingContext2D,
  text: string,
  slot: TextSlot,
  options: { font: string; weight: number; color: string; tracking?: number },
) {
  if (!text) return;
  context.save();
  context.fillStyle = options.color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${options.weight} ${slot.size}px ${options.font}`;
  // letterSpacing 은 Safari 17.4+/Chrome 지원. 미지원 기기에서는 조용히 무시됩니다.
  if (options.tracking) context.letterSpacing = `${options.tracking}px`;
  context.fillText(text, slot.x, slot.y, slot.maxWidth);
  context.restore();
}

export type ComposeInput = {
  images: string[];
  frame: Frame;
  layout: Layout;
  title: string;
  tagline: string;
  caption: string;
};

export async function composePrint({
  images,
  frame,
  layout,
  title,
  tagline,
  caption,
}: ComposeInput): Promise<string> {
  const loaded = await Promise.all(images.slice(0, layout.cells.length).map(loadImage));
  const canvas = document.createElement("canvas");
  canvas.width = layout.paper.w * DPI * SUPERSAMPLE;
  canvas.height = layout.paper.h * DPI * SUPERSAMPLE;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("사진을 만들 수 없습니다.");
  // 아래 그리기 코드는 전부 300dpi 좌표계를 그대로 씁니다.
  context.scale(SUPERSAMPLE, SUPERSAMPLE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const titleFont = FONT_STACKS[frame.titleFont];
  const bodyFont = FONT_STACKS.sans;
  const monoFont = FONT_STACKS.mono;
  const stamp = dateStamp();

  layout.tiles.forEach((tile, tileIndex) => {
    context.save();
    context.translate(tile.x, tile.y);
    context.beginPath();
    context.rect(0, 0, layout.tile.w, layout.tile.h);
    context.clip();

    paintTile(context, frame, layout.tile, layout.title);

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
    });

    drawText(context, title, layout.title, { font: titleFont, weight: 800, color: frame.ink });
    drawText(context, tagline.toUpperCase(), layout.tagline, {
      font: bodyFont,
      weight: 700,
      color: frame.accent,
      tracking: Math.max(1, Math.round(layout.tagline.size * 0.14)),
    });
    drawText(context, caption, layout.caption, { font: titleFont, weight: 800, color: frame.ink });

    context.globalAlpha = 0.7;
    drawText(
      context,
      layout.tiles.length > 1 ? `${stamp}  ·  #${String(tileIndex + 1).padStart(2, "0")}` : stamp,
      layout.stamp,
      { font: monoFont, weight: 600, color: frame.sub },
    );
    context.globalAlpha = 1;

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
  return canvas.toDataURL("image/jpeg", 0.92);
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
