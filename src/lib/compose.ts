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

type Band = { x: number; y: number; w: number; h: number };

/**
 * 사진이 없는 빈 띠(위·아래·왼쪽·오른쪽)를 **넓은 순으로** 돌려줍니다.
 * 로고 자리를 레이아웃마다 따로 정하지 않아도 되도록, 남는 공간이 큰 쪽부터 씁니다
 * (세로 스트립이면 주제는 발치, 행사 태그는 머리 쪽).
 *
 * 조각 가장자리에 닿는 변은 안쪽으로 물립니다 — **인화지 테두리 2~3mm 는 프린터가
 * 늘 잘라냅니다**(가장자리 없는 인쇄의 오버스프레이). 실제 인화물에서 하단 로고가
 * 잘려 나온 적이 있어 넣은 여백입니다.
 */
function emptyBands(layout: Layout): Band[] {
  const cells = layout.cells;
  const x0 = Math.min(...cells.map((c) => c.x));
  const y0 = Math.min(...cells.map((c) => c.y));
  const x1 = Math.max(...cells.map((c) => c.x + c.w));
  const y1 = Math.max(...cells.map((c) => c.y + c.h));
  const safe = Math.min(layout.paper.w, layout.paper.h) * DPI * 0.04;

  const trim = (b: Band): Band => {
    const left = b.x <= 0 ? safe : 0;
    const right = b.x + b.w >= layout.tile.w ? safe : 0;
    const top = b.y <= 0 ? safe : 0;
    const bottom = b.y + b.h >= layout.tile.h ? safe : 0;
    return { x: b.x + left, y: b.y + top, w: b.w - left - right, h: b.h - top - bottom };
  };

  return [
    { x: 0, y: 0, w: layout.tile.w, h: y0 },
    { x: 0, y: y1, w: layout.tile.w, h: layout.tile.h - y1 },
    { x: 0, y: 0, w: x0, h: layout.tile.h },
    { x: x1, y: 0, w: layout.tile.w - x1, h: layout.tile.h },
  ]
    .map(trim)
    .filter((b) => b.w > 0 && b.h > 0)
    .sort((a, b) => b.w * b.h - a.w * a.h);
}

/**
 * 띠 안에 그림을 비율 그대로 최대한 크게 넣습니다. **띠와 그림의 방향이 어긋나면 눕힙니다.**
 *
 * 가로로 긴 로고를 세로로 긴 띠(가로 4컷 띠 ×2 의 왼쪽 여백)에 그냥 넣으면, 폭에 맞춰
 * 줄어들면서 띠 높이의 5분의 1만 쓰고 주제가 안 읽힙니다 — 실측 256×94 vs 띠 272×504.
 * 돌려 넣으면 175×474 로 **넓이가 3.4배**가 되고, 책갈피 모양 인화물의 책등처럼 보입니다.
 *
 * 방향이 맞는 띠(세로 4컷의 발치)에서는 돌리면 오히려 작아지므로 그대로 둡니다.
 */
function drawFit(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  band: Band,
  fill = 0.94,
) {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  const plain = Math.min((band.w * fill) / iw, (band.h * fill) / ih);
  const turned = Math.min((band.w * fill) / ih, (band.h * fill) / iw);

  // 고만고만하게 커지는 정도면 돌리지 않습니다 — 읽기 불편해지는 값만 치릅니다.
  if (turned > plain * 1.15) {
    context.save();
    context.translate(band.x + band.w / 2, band.y + band.h / 2);
    // 위→아래로 읽히는 방향(한국 책등 관행). 이 로고는 [자물쇠 그림][글자] 가로 락업이라
    // 이 방향이어야 자물쇠가 위에 오고, 반대(−90°)면 자물쇠가 발치에 깔려 어색합니다.
    context.rotate(Math.PI / 2);
    context.drawImage(image, (-iw * turned) / 2, (-ih * turned) / 2, iw * turned, ih * turned);
    context.restore();
    return;
  }

  const w = iw * plain;
  const h = ih * plain;
  context.drawImage(image, band.x + (band.w - w) / 2, band.y + (band.h - h) / 2, w, h);
}

const inside = (rect: Band, x: number, y: number) =>
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
  // 로고·태그를 못 받아도 인화는 되게 — 그 경우 원래대로 글자를 씁니다.
  const fetchArt = (path?: string) =>
    path ? loadImage(`${import.meta.env.BASE_URL}${path}`).catch(() => null) : Promise.resolve(null);
  const [loaded, logo, badge] = await Promise.all([
    Promise.all(images.slice(0, layout.cells.length).map(loadImage)),
    fetchArt(frame.logo),
    fetchArt(frame.badge),
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
  // 넓은 여백부터 주제 → 행사 태그 순으로 씁니다. 그 자리는 장식도 비켜 갑니다.
  // 너무 얇은 띠는 아예 거릅니다 — 가로 4컷 띠 ×2 의 위/아래 여백은 1704×32 라
  // 태그를 넣어봐야 55×30 짜리 점이 됩니다. 알아볼 수 없게 넣느니 빼는 편이 낫습니다
  // (날짜 도장을 로고와 겹칠 때 생략하는 것과 같은 판단).
  const usable = (logo ? emptyBands(layout) : []).filter(
    (band) => Math.min(band.w, band.h) >= Math.min(layout.tile.w, layout.tile.h) * 0.08,
  );
  const logoBand = usable[0] ?? null;
  const badgeBand = badge ? (usable[1] ?? null) : null;
  const reserved = [logoBand, badgeBand].filter((b): b is Band => !!b);

  layout.tiles.forEach((tile, tileIndex) => {
    context.save();
    context.translate(tile.x, tile.y);
    context.beginPath();
    context.rect(0, 0, layout.tile.w, layout.tile.h);
    context.clip();

    paintTile(context, frame, layout.tile, layout.title, layout.cells, reserved);

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
      // 로고가 주인공인 프레임 — 이름·영문 문구·아래 문구는 생략하고 그림만 넣습니다.
      drawFit(context, logo, logoBand);
      if (badge && badgeBand) drawFit(context, badge, badgeBand);
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

    // 날짜 도장은 로고·태그 자리와 겹치면 생략합니다 — 그림을 줄이는 것보다 낫습니다.
    if (!reserved.some((band) => inside(band, layout.stamp.x, layout.stamp.y))) {
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
