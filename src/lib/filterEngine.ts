import type { FilterDef } from "../types";
import { makeBlurredCanvas } from "./canvas";
import { applyFilmGrade } from "./filmGrade";

// ── 필터 엔진 ──────────────────────────────────────────────────────
// 캔버스 context.filter 는 iPadOS 에서 실험 플래그 뒤에 있어 기본 비활성입니다
// (2026-07 기준, WebKit 구현은 있으나 꺼짐) — 즉 iPad 는 항상 아래 픽셀 폴백을 탑니다.
// 감지는 실제 1×1 픽셀에 grayscale 을 적용해 결과를 읽어 확인하므로, 파싱만 되고
// 렌더링이 안 되는 구현이나 향후 플래그 활성화에도 안전합니다. (Chrome 등은 네이티브 GPU 경로)

export const supportsCanvasFilter = (() => {
  try {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const context = probe.getContext("2d", { willReadFrequently: true });
    if (!context || typeof context.filter !== "string") return false;
    const red = document.createElement("canvas");
    red.width = red.height = 1;
    const redContext = red.getContext("2d")!;
    redContext.fillStyle = "#f00";
    redContext.fillRect(0, 0, 1, 1);
    context.filter = "grayscale(1)";
    context.drawImage(red, 0, 0);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return r === g && g === b; // 필터가 실제로 렌더링에 적용됐는지 확인
  } catch {
    return false;
  }
})();

/** 네이티브 filter 로 사본을 만듭니다(지원 기기 전용, GPU 가속). */
function filteredCopy(source: HTMLCanvasElement, css: string): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const context = out.getContext("2d", { alpha: false })!;
  context.filter = css;
  context.drawImage(source, 0, 0);
  context.filter = "none";
  return out;
}

const saturateMatrix = (s: number) => [
  0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
];

const sepiaMatrix = (a: number) => {
  const k = 1 - a;
  return [
    0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k,
    0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k,
    0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k,
  ];
};

const hueRotateMatrix = (deg: number) => {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
};

// CSS filter 문자열(blur 제외)을 단계별 행렬+오프셋 목록으로 파싱합니다.
// CSS 필터는 각 단계 결과를 [0,255]로 클램프한 뒤 다음 단계에 넘기므로(8비트 중간 버퍼),
// 미리보기와 정확히 일치하려면 하나의 행렬로 합성하지 않고 단계별로 적용·클램프해야 합니다.
// (사전 합성 방식은 뽀샤시·화사의 하이라이트에서 미리보기 대비 최대 Δ14 오차 실측 → 단계별은 Δ2 이하)
type FilterStep = { m: number[]; o: number[] };

function parseFilterSteps(css: string): FilterStep[] {
  const steps: FilterStep[] = [];
  const scale = (v: number) => [v, 0, 0, 0, v, 0, 0, 0, v];
  const regex = /([\w-]+)\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(css))) {
    const fn = match[1];
    const raw = match[2].trim();
    const value = raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
    if (Number.isNaN(value)) continue;
    if (fn === "brightness") steps.push({ m: scale(value), o: [0, 0, 0] });
    else if (fn === "contrast") steps.push({ m: scale(value), o: Array(3).fill(127.5 * (1 - value)) });
    else if (fn === "saturate") steps.push({ m: saturateMatrix(value), o: [0, 0, 0] });
    else if (fn === "grayscale") steps.push({ m: saturateMatrix(1 - value), o: [0, 0, 0] });
    else if (fn === "sepia") steps.push({ m: sepiaMatrix(value), o: [0, 0, 0] });
    else if (fn === "hue-rotate") steps.push({ m: hueRotateMatrix(value), o: [0, 0, 0] });
    // blur() 등은 여기서 무시 — 공간 필터는 softenPixels/글로우 단계에서 처리합니다.
  }
  return steps;
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** 캔버스 픽셀에 필터를 직접 적용합니다(ctx.filter 미지원 기기 폴백). */
function filterCanvasPixels(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  css: string,
) {
  const steps = parseFilterSteps(css);
  if (!steps.length) return;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const stepCount = steps.length;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    for (let s = 0; s < stepCount; s += 1) {
      const m = steps[s].m;
      const o = steps[s].o;
      const nr = clamp255(m[0] * r + m[1] * g + m[2] * b + o[0]);
      const ng = clamp255(m[3] * r + m[4] * g + m[5] * b + o[1]);
      const nb = clamp255(m[6] * r + m[7] * g + m[8] * b + o[2]);
      r = nr;
      g = ng;
      b = nb;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  context.putImageData(image, 0, 0);
}

// 약한 소프트닝(피부 결 정리) 폴백 — 미리보기의 blur(N px) = σ N/2 가우시안을
// 분리형 3탭 커널 [w, 1-2w, w] 로 근사합니다. 커널 분산 = 2w 이므로 w = σ²/(2·패스수).
// 고정 박스(σ0.58)가 아니라 σ에 맞춘 가변 커널이라 화사(blur 0.6px, σ0.33)처럼
// 아주 약한 블러도 미리보기보다 과하게 뭉개지 않습니다.
function softenPixels(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  sigma: number,
) {
  const passes = sigma > 0.81 ? 2 : 1;
  const w = Math.min(1 / 3, (sigma * sigma) / (2 * passes));
  if (w <= 0.005) return;
  const center = 1 - 2 * w;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const line = new Float32Array(Math.max(width, height) * 3);
  for (let pass = 0; pass < passes; pass += 1) {
    for (let y = 0; y < height; y += 1) {
      const rowStart = y * width * 4;
      for (let x = 0; x < width; x += 1) {
        const i = rowStart + x * 4;
        line[x * 3] = data[i];
        line[x * 3 + 1] = data[i + 1];
        line[x * 3 + 2] = data[i + 2];
      }
      for (let x = 1; x < width - 1; x += 1) {
        const i = rowStart + x * 4;
        data[i] = line[(x - 1) * 3] * w + line[x * 3] * center + line[(x + 1) * 3] * w;
        data[i + 1] = line[(x - 1) * 3 + 1] * w + line[x * 3 + 1] * center + line[(x + 1) * 3 + 1] * w;
        data[i + 2] = line[(x - 1) * 3 + 2] * w + line[x * 3 + 2] * center + line[(x + 1) * 3 + 2] * w;
      }
    }
    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < height; y += 1) {
        const i = (y * width + x) * 4;
        line[y * 3] = data[i];
        line[y * 3 + 1] = data[i + 1];
        line[y * 3 + 2] = data[i + 2];
      }
      for (let y = 1; y < height - 1; y += 1) {
        const i = (y * width + x) * 4;
        data[i] = line[(y - 1) * 3] * w + line[y * 3] * center + line[(y + 1) * 3] * w;
        data[i + 1] = line[(y - 1) * 3 + 1] * w + line[y * 3 + 1] * center + line[(y + 1) * 3 + 1] * w;
        data[i + 2] = line[(y - 1) * 3 + 2] * w + line[y * 3 + 2] * center + line[(y + 1) * 3 + 2] * w;
      }
    }
  }
  context.putImageData(image, 0, 0);
}

// ── WYSIWYG 베이크 ─────────────────────────────────────────────────
// 결과물이 라이브 미리보기와 똑같아 보이도록, 미리보기 화면의 레이어 구성을 그대로 굽습니다:
//   ① 메인: previewCss(밝기·색 보정 + 약한 소프트닝 블러 — 피부 결 정리)
//   ② 글로우(뽀샤시 계열): css+blur+brightness(1.32) 사본을 screen 블렌드(α = bloom×0.72)
// 메인에 css(어두운 버전)만 굽고 소프트닝을 빠뜨리면 결과물이 미리보기보다
// 어둡고(Δ밝기 ≈ 13) 노이즈가 3.5배 남습니다 — 기존 앱에서 실측으로 확인된 함정입니다.
// 미리보기 blur 값은 표시 크기(≈940px) 기준 CSS px 이므로 캡처 해상도로 환산합니다.
const PREVIEW_REFERENCE_WIDTH = 940;

const extractBlurPx = (css: string) => {
  const match = /blur\(([\d.]+)px\)/.exec(css);
  return match ? parseFloat(match[1]) : 0;
};

const scaleBlur = (css: string, scale: number) =>
  css.replace(/blur\(([\d.]+)px\)/g, (_, v) => `blur(${(parseFloat(v) * scale).toFixed(1)}px)`);

/**
 * 라이브 미리보기에 쓸 CSS filter 문자열(메인 레이어).
 * 필름 계조는 여기서 다루지 않습니다 — CSS 로 표현할 수 없고, SVG 필터는 Safari 가
 * <video> 에 적용해 주지 않아서, hooks/useFilmPreview 가 캔버스에 직접 그립니다.
 */
export const previewFilterCss = (filter: FilterDef) => filter.previewCss ?? filter.css;

/** 라이브 미리보기 글로우 레이어에 쓸 CSS filter 문자열 */
export const glowFilterCss = (filter: FilterDef) =>
  `${filter.css === "none" ? "" : filter.css} blur(10px) brightness(1.32)`.trim();

export function bakePreviewLook(source: HTMLCanvasElement, filter: FilterDef): HTMLCanvasElement {
  const width = source.width;
  const height = source.height;
  const scale = width / PREVIEW_REFERENCE_WIDTH;
  const mainCss = previewFilterCss(filter);
  const bloom = filter.bloom ?? 0;

  // ① 메인 레이어
  let main: HTMLCanvasElement;
  if (supportsCanvasFilter) {
    main = mainCss === "none" ? source : filteredCopy(source, scaleBlur(mainCss, scale));
  } else {
    main = source;
    if (mainCss !== "none") {
      const context = main.getContext("2d", { alpha: false })!;
      filterCanvasPixels(context, width, height, mainCss);
      const blurPx = extractBlurPx(mainCss) * scale;
      // CSS blur(N px) = σ N/2 — σ를 그대로 전달해 커널이 세기를 맞춥니다
      if (blurPx > 0.2) softenPixels(context, width, height, blurPx / 2);
    }
  }

  // ② 글로우 레이어 (미리보기의 글로우 비디오와 동일 구성)
  if (bloom > 0) {
    let glow: HTMLCanvasElement;
    if (supportsCanvasFilter) {
      glow = filteredCopy(
        source,
        `${filter.css === "none" ? "" : filter.css} blur(${Math.round(10 * scale)}px) brightness(1.32)`.trim(),
      );
    } else {
      glow = makeBlurredCanvas(source, width, height, 9);
      const glowContext = glow.getContext("2d", { willReadFrequently: true })!;
      filterCanvasPixels(
        glowContext,
        width,
        height,
        `${filter.css === "none" ? "" : filter.css} brightness(1.32)`.trim(),
      );
    }
    const context = main.getContext("2d", { alpha: false })!;
    context.globalCompositeOperation = "screen";
    context.globalAlpha = bloom * 0.72;
    context.drawImage(glow, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
  }

  // ③ 필름 계조 — 미리보기의 SVG 필터와 같은 제어점·같은 순서라 결과가 일치합니다.
  if (filter.film) {
    applyFilmGrade(main.getContext("2d", { alpha: false })!, width, height, filter.film);
  }
  return main;
}
