import type { FilmGrade, HueBand } from "../types";

// ── 룩 엔진 ──────────────────────────────────────────────────────────
// 보정 앱의 프리셋처럼 여러 단계(색조별 조정 → 채도·생동감 → 톤커브 → 분리 톤 → 페이드)를 거치지만,
// 사진의 픽셀마다 그 단계를 다 돌리지는 않습니다. 룩 하나당 33×33×33 격자의 **3D 룩업표**를 한 번
// 구워 두고(약 3만 6천 색), 픽셀은 그 표를 삼선형 보간으로 조회합니다 — 단계가 아무리 많아져도
// 픽셀당 비용이 같고, 미리보기(라이브)와 결과물(인화)이 **같은 표**를 써서 색이 정확히 일치합니다.
// 공간 효과(비네트·그레인)는 색이 아니라 자리에 따라 달라지므로 표 뒤에 따로 입힙니다.

export const LUT_SIZE = 33;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── 톤커브: 같은 간격 제어점을 잇는 단조 3차 곡선(Fritsch–Carlson) ─────────
// 선형으로 이으면 제어점마다 기울기가 꺾여 피부처럼 완만한 면에 띠가 집니다. 단조 조건을 지키므로
// 제어점이 오르기만 하면 곡선도 오르기만 하고(계조 역전 없음), 제어점은 정확히 지납니다.
export function makeCurve(points: number[]): (x: number) => number {
  const n = points.length;
  if (n < 2) return (x) => x;
  const h = 1 / (n - 1);
  const d = new Array<number>(n - 1);
  for (let k = 0; k < n - 1; k += 1) d[k] = (points[k + 1] - points[k]) / h;
  const m = new Array<number>(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k += 1) m[k] = d[k - 1] * d[k] > 0 ? (d[k - 1] + d[k]) / 2 : 0;
  for (let k = 0; k < n - 1; k += 1) {
    if (d[k] === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const a = m[k] / d[k];
    const b = m[k + 1] / d[k];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[k] = tau * a * d[k];
      m[k + 1] = tau * b * d[k];
    }
  }
  return (x: number) => {
    const t0 = clamp01(x) * (n - 1);
    const k = Math.min(n - 2, Math.floor(t0));
    const t = t0 - k;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return clamp01(h00 * points[k] + h10 * h * m[k] + h01 * points[k + 1] + h11 * h * m[k + 1]);
  };
}

/** 제어점 표를 256칸 룩업표로 펼칩니다(8비트 출력). */
export function buildCurveLut(points: number[]): Uint8ClampedArray {
  const curve = makeCurve(points);
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i += 1) lut[i] = Math.round(curve(i / 255) * 255);
  return lut;
}

// ── 색 공간 ──────────────────────────────────────────────────────────
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

/** RGB(0~1) → HSL(h 0~360, s·l 0~1) */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta < 1e-9) return [0, 0, l];
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

// 색조 띠의 중심(°). 보정 앱의 HSL 패널과 같은 배치 — 주황(살색)·노랑은 촘촘하고 초록·파랑은 넓게.
const BAND_CENTERS: Record<HueBand, number> = {
  red: 0,
  orange: 30,
  yellow: 60,
  green: 120,
  aqua: 180,
  blue: 240,
  purple: 280,
  magenta: 320,
};
const BANDS = Object.keys(BAND_CENTERS) as HueBand[];

/**
 * 색조 h 가 띠 band 에 속하는 정도(0~1). 이웃 띠의 중심에서 0 이 되는 올림 코사인 창이라
 * 이웃끼리 더하면 항상 1 — 경계에서 색이 끊기지 않고, 띠 하나만 조정해도 옆 색은 그대로입니다.
 */
function bandWeight(h: number, band: HueBand): number {
  const index = BANDS.indexOf(band);
  const center = BAND_CENTERS[band];
  const prev = BAND_CENTERS[BANDS[(index + BANDS.length - 1) % BANDS.length]];
  const next = BAND_CENTERS[BANDS[(index + 1) % BANDS.length]];
  let delta = h - center;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const width = delta >= 0 ? (next - center + 360) % 360 || 360 : (center - prev + 360) % 360 || 360;
  const t = Math.abs(delta) / width;
  if (t >= 1) return 0;
  return 0.5 + 0.5 * Math.cos(Math.PI * t);
}

/** 살색(주황 띠) 정도 — 생동감이 얼굴을 과하게 물들이지 않도록 보호하는 데 씁니다. */
const skinWeight = (h: number) => bandWeight(h, "orange");

const SPLIT_STRENGTH = 0.6;

type Compiled = {
  curveR: (x: number) => number;
  curveG: (x: number) => number;
  curveB: (x: number) => number;
  bands: { band: HueBand; hue: number; sat: number; lum: number }[];
  shadowTint: [number, number, number] | null;
  shadowAmount: number;
  highlightTint: [number, number, number] | null;
  highlightAmount: number;
};

const compiledCache = new WeakMap<FilmGrade, Compiled>();

function compile(grade: FilmGrade): Compiled {
  const cached = compiledCache.get(grade);
  if (cached) return cached;
  const tint = (hue: number): [number, number, number] => {
    const [r, g, b] = hslToRgb(hue, 1, 0.5);
    return [r - 0.5, g - 0.5, b - 0.5];
  };
  const compiled: Compiled = {
    curveR: makeCurve(grade.r),
    curveG: makeCurve(grade.g),
    curveB: makeCurve(grade.b),
    bands: BANDS.filter((band) => grade.hsl?.[band]).map((band) => ({
      band,
      hue: grade.hsl?.[band]?.hue ?? 0,
      sat: grade.hsl?.[band]?.sat ?? 0,
      lum: grade.hsl?.[band]?.lum ?? 0,
    })),
    shadowTint: grade.split?.shadows ? tint(grade.split.shadows[0]) : null,
    shadowAmount: grade.split?.shadows?.[1] ?? 0,
    highlightTint: grade.split?.highlights ? tint(grade.split.highlights[0]) : null,
    highlightAmount: grade.split?.highlights?.[1] ?? 0,
  };
  compiledCache.set(grade, compiled);
  return compiled;
}

/**
 * 픽셀 하나(0~1)에 룩을 적용합니다 — 룩업표를 굽는 기준 계산이자, 테스트가 검증하는 기준입니다.
 * 순서: 색조별 조정 → 채도 → 생동감 → 톤커브 → 분리 톤 → 페이드.
 */
export function gradePixel(grade: FilmGrade, r: number, g: number, b: number): [number, number, number] {
  const c = compile(grade);
  const saturation = grade.saturation ?? 1;
  const vibrance = grade.vibrance ?? 0;

  // ① 색조별 조정 + 생동감 — HSL 에서 한 번에
  if (c.bands.length || vibrance !== 0) {
    let [h, s, l] = rgbToHsl(r, g, b);
    if (s > 1e-6) {
      let hueShift = 0;
      let satScale = 1;
      let lumShift = 0;
      for (const item of c.bands) {
        const w = bandWeight(h, item.band);
        if (w <= 0) continue;
        hueShift += w * item.hue;
        satScale *= 1 + w * item.sat;
        lumShift += w * item.lum;
      }
      if (vibrance !== 0) {
        // 채도가 낮을수록 많이, 살색은 덜 — 얼굴이 주황으로 타지 않게
        satScale *= 1 + vibrance * (1 - s) * (1 - 0.6 * skinWeight(h));
      }
      h += hueShift;
      s = clamp01(s * Math.max(0, satScale));
      if (lumShift > 0) l += lumShift * 0.5 * (1 - l);
      else if (lumShift < 0) l += lumShift * 0.5 * l;
      [r, g, b] = hslToRgb(h, s, clamp01(l));
    }
  }

  // ② 채도 — 밝기(Rec.601)를 지키는 행렬. 0 이면 무채색.
  if (saturation !== 1) {
    const y = LUMA_R * r + LUMA_G * g + LUMA_B * b;
    r = y + (r - y) * saturation;
    g = y + (g - y) * saturation;
    b = y + (b - y) * saturation;
  }

  // ③ 채널별 톤커브
  r = c.curveR(clamp01(r));
  g = c.curveG(clamp01(g));
  b = c.curveB(clamp01(b));

  // ④ 분리 톤 — 어두운 곳은 shadows 색조로, 밝은 곳은 highlights 색조로
  if (c.shadowTint || c.highlightTint) {
    const y = LUMA_R * r + LUMA_G * g + LUMA_B * b;
    if (c.shadowTint) {
      const w = (1 - y) * (1 - y) * c.shadowAmount * SPLIT_STRENGTH;
      r += w * c.shadowTint[0];
      g += w * c.shadowTint[1];
      b += w * c.shadowTint[2];
    }
    if (c.highlightTint) {
      const w = y * y * c.highlightAmount * SPLIT_STRENGTH;
      r += w * c.highlightTint[0];
      g += w * c.highlightTint[1];
      b += w * c.highlightTint[2];
    }
    r = clamp01(r);
    g = clamp01(g);
    b = clamp01(b);
  }

  // ⑤ 페이드 — 검정만 들어 올리고 흰색은 그대로(세제곱 감쇠)
  const fade = grade.fade ?? 0;
  if (fade > 0) {
    r += fade * (1 - r) ** 3;
    g += fade * (1 - g) ** 3;
    b += fade * (1 - b) ** 3;
  }
  return [r, g, b];
}

// ── 3D 룩업표 ─────────────────────────────────────────────────────────
const lutCache = new WeakMap<FilmGrade, Float32Array>();

/** 룩 하나를 33³ 표로 굽습니다(출력 0~255 실수). 룩 객체마다 한 번만 — 이후는 캐시. */
export function buildLut3d(grade: FilmGrade): Float32Array {
  const cached = lutCache.get(grade);
  if (cached) return cached;
  const n = LUT_SIZE;
  const lut = new Float32Array(n * n * n * 3);
  let offset = 0;
  for (let bi = 0; bi < n; bi += 1) {
    for (let gi = 0; gi < n; gi += 1) {
      for (let ri = 0; ri < n; ri += 1) {
        const [r, g, b] = gradePixel(grade, ri / (n - 1), gi / (n - 1), bi / (n - 1));
        lut[offset] = r * 255;
        lut[offset + 1] = g * 255;
        lut[offset + 2] = b * 255;
        offset += 3;
      }
    }
  }
  lutCache.set(grade, lut);
  return lut;
}

/** RGBA 픽셀 배열에 룩업표를 삼선형 보간으로 적용합니다(제자리). */
export function applyLut3d(data: Uint8ClampedArray, lut: Float32Array) {
  const n = LUT_SIZE;
  const scale = (n - 1) / 255;
  const strideG = n * 3;
  const strideB = n * n * 3;
  for (let i = 0; i < data.length; i += 4) {
    const rf = data[i] * scale;
    const gf = data[i + 1] * scale;
    const bf = data[i + 2] * scale;
    let r0 = rf | 0;
    let g0 = gf | 0;
    let b0 = bf | 0;
    if (r0 >= n - 1) r0 = n - 2;
    if (g0 >= n - 1) g0 = n - 2;
    if (b0 >= n - 1) b0 = n - 2;
    const tr = rf - r0;
    const tg = gf - g0;
    const tb = bf - b0;
    const base = r0 * 3 + g0 * strideG + b0 * strideB;
    // 8개 꼭짓점을 r → g → b 순서로 섞습니다.
    for (let ch = 0; ch < 3; ch += 1) {
      const o = base + ch;
      const c00 = lut[o] + (lut[o + 3] - lut[o]) * tr;
      const c10 = lut[o + strideG] + (lut[o + strideG + 3] - lut[o + strideG]) * tr;
      const c01 = lut[o + strideB] + (lut[o + strideB + 3] - lut[o + strideB]) * tr;
      const c11 = lut[o + strideB + strideG] + (lut[o + strideB + strideG + 3] - lut[o + strideB + strideG]) * tr;
      const c0 = c00 + (c10 - c00) * tg;
      const c1 = c01 + (c11 - c01) * tg;
      data[i + ch] = c0 + (c1 - c0) * tb; // Uint8ClampedArray 가 반올림합니다(0.5 를 더하면 두 번 반올림)
    }
  }
}

// ── 공간 효과 ─────────────────────────────────────────────────────────
/** 비네트 — 가운데는 그대로, 모서리로 갈수록 amount 만큼 어둡게. 부드러운 2.5제곱 감쇠. */
export function applyVignette(data: Uint8ClampedArray, width: number, height: number, amount: number) {
  if (amount <= 0) return;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const rowFactor = new Float32Array(height);
  const colFactor = new Float32Array(width);
  for (let y = 0; y < height; y += 1) rowFactor[y] = ((y - cy) / cy) ** 2;
  for (let x = 0; x < width; x += 1) colFactor[x] = ((x - cx) / cx) ** 2;
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const d = Math.sqrt((rowFactor[y] + colFactor[x]) / 2); // 모서리에서 1
      const f = 1 - amount * d ** 2.5;
      const i = row + x * 4;
      data[i] *= f;
      data[i + 1] *= f;
      data[i + 2] *= f;
    }
  }
}

/**
 * 필름 그레인 — 알갱이 크기(size px)의 값 노이즈를 쌍선형으로 부풀려 덧씌웁니다. 픽셀마다 독립
 * 난수를 더하면 디지털 노이즈처럼 보이고, 알갱이가 뭉쳐야 필름처럼 보입니다. 중간톤에 가장
 * 도드라지고 완전한 검정·흰색엔 거의 없습니다. 고정 시드라 같은 사진이면 항상 같은 결과입니다.
 */
export function applyGrain(data: Uint8ClampedArray, width: number, height: number, amount: number, size = 1.6) {
  if (amount <= 0) return;
  const cell = Math.max(1, size);
  const gridW = Math.ceil(width / cell) + 2;
  const gridH = Math.ceil(height / cell) + 2;
  const grid = new Float32Array(gridW * gridH);
  let seed = 1;
  for (let i = 0; i < grid.length; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    grid[i] = seed / 0x7fffffff - 0.5;
  }
  const amp = amount * 34;
  for (let y = 0; y < height; y += 1) {
    const gy = y / cell;
    const y0 = gy | 0;
    const ty = gy - y0;
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const gx = x / cell;
      const x0 = gx | 0;
      const tx = gx - x0;
      const a = grid[y0 * gridW + x0];
      const b = grid[y0 * gridW + x0 + 1];
      const c = grid[(y0 + 1) * gridW + x0];
      const d = grid[(y0 + 1) * gridW + x0 + 1];
      const noise = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
      const i = row + x * 4;
      const luma = (data[i] * LUMA_R + data[i + 1] * LUMA_G + data[i + 2] * LUMA_B) / 255;
      const weight = 1 - Math.abs(luma - 0.5) * 1.6;
      if (weight <= 0) continue;
      const n = noise * amp * weight;
      data[i] += n;
      data[i + 1] += n;
      data[i + 2] += n;
    }
  }
}

/**
 * 캔버스에 룩을 입힙니다 — 미리보기와 결과물이 같은 함수를 씁니다.
 * skipGrain: 라이브 미리보기에서는 그레인을 건너뜁니다(화면 크기에선 안 보이는데 매 프레임 비쌈).
 */
export function applyFilmGrade(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  grade: FilmGrade,
  skipGrain = false,
) {
  const image = context.getImageData(0, 0, width, height);
  applyLut3d(image.data, buildLut3d(grade));
  if (grade.vignette) applyVignette(image.data, width, height, grade.vignette);
  if (grade.grain && !skipGrain) applyGrain(image.data, width, height, grade.grain, grade.grainSize);
  context.putImageData(image, 0, 0);
}
