import type { FilmGrade } from "../types";

// filterEngine 과 같은 식이지만 여기 따로 둡니다 — 서로 import 하면 순환 참조가 됩니다.
const saturateMatrix = (s: number) => [
  0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
];

/**
 * 필름 계조(톤커브) 엔진.
 *
 * CSS 필터(brightness·contrast·saturate…)는 전부 선형이라 필름의 핵심인
 * **들린 검정**과 **채널별 곡선**을 만들 수 없습니다. 그래서 채널마다 제어점을 두고
 * 그 사이를 선형 보간하는 커브를 따로 둡니다.
 *
 * 제어점의 뜻과 보간 방식을 SVG `feComponentTransfer type="table"` 과 똑같이 맞췄습니다.
 * 덕분에 라이브 미리보기(SVG 필터)와 결과물(아래 픽셀 연산)이 **근사가 아니라 정확히**
 * 같은 값을 냅니다. 색 공간도 SVG 쪽에 color-interpolation-filters="sRGB" 를 지정해
 * 여기 계산(sRGB)과 맞춥니다. (SVG 필터 기본값은 linearRGB 라 그냥 두면 어긋납니다.)
 */

/** 제어점 표를 256칸 룩업표로 펼칩니다. SVG table 보간과 같은 식입니다. */
function buildLut(table: number[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const n = table.length - 1;
  for (let i = 0; i < 256; i += 1) {
    const t = (i / 255) * n;
    const k = Math.min(n - 1, Math.floor(t));
    const f = t - k;
    lut[i] = Math.round((table[k] + (table[k + 1] - table[k]) * f) * 255);
  }
  return lut;
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * 룩업표를 조회할 정수 인덱스.
 * 채도 단계를 거치면 값이 소수가 되는데, 타입드 배열을 소수로 조회하면 undefined 가 나오고
 * 그걸 Uint8ClampedArray 에 넣으면 0(검정)이 됩니다 — 반드시 정수로 반올림해야 합니다.
 */
const toIndex = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/**
 * 캔버스 픽셀에 필름 계조를 입힙니다. 채도 → 톤커브 → 그레인 순서이며,
 * 이 순서가 SVG 쪽 필터 체인과 같아야 미리보기와 결과가 일치합니다.
 */
export function applyFilmGrade(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  grade: FilmGrade,
  /** 라이브 미리보기에서는 그레인을 건너뜁니다 — 화면 크기에선 안 보이는데 매 프레임 비쌉니다. */
  skipGrain = false,
) {
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const lutR = buildLut(grade.r);
  const lutG = buildLut(grade.g);
  const lutB = buildLut(grade.b);
  const saturation = grade.saturation ?? 1;
  const m = saturateMatrix(saturation);
  const useSaturation = saturation !== 1;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    if (useSaturation) {
      const nr = clamp255(m[0] * r + m[1] * g + m[2] * b);
      const ng = clamp255(m[3] * r + m[4] * g + m[5] * b);
      const nb = clamp255(m[6] * r + m[7] * g + m[8] * b);
      r = nr;
      g = ng;
      b = nb;
    }
    data[i] = lutR[toIndex(r)];
    data[i + 1] = lutG[toIndex(g)];
    data[i + 2] = lutB[toIndex(b)];
  }

  // 필름 그레인 — 미리보기 크기에서는 보이지 않는 미세 질감이라 결과물에만 넣습니다.
  // 난수는 고정 시드 LCG 라 같은 사진이면 항상 같은 결과가 나옵니다(다시 꾸미기 때 일관).
  if (grade.grain && !skipGrain) {
    const amp = grade.grain * 30;
    let seed = 1;
    for (let i = 0; i < data.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      // 중간톤에 가장 도드라지게 — 완전한 검정·흰색에는 알갱이가 잘 안 보입니다.
      const luma = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      const weight = 1 - Math.abs(luma - 0.5) * 1.6;
      if (weight <= 0) continue;
      const n = (seed / 0x7fffffff - 0.5) * amp * weight;
      data[i] = clamp255(data[i] + n);
      data[i + 1] = clamp255(data[i + 1] + n);
      data[i + 2] = clamp255(data[i + 2] + n);
    }
  }

  context.putImageData(image, 0, 0);
}

/** 라이브 미리보기용 SVG 필터의 id */
export const filmFilterId = (key: string) => `film-${key}`;
