// ── 피부 보정 ─────────────────────────────────────────────────────────
// 그냥 흐리게 하면 눈매·머리카락까지 뭉개져 밀랍인형이 됩니다. 두 가지로 막습니다:
//
//   ① 살색 마스크 — YCbCr 색차 평면에서 피부가 모이는 구간(Cb 77~127, Cr 133~173)
//      안에서만 동작합니다. 옷·배경·칠판은 건드리지 않습니다. 이 구간은 피부색 자체보다
//      **색조**로 갈라지는 자리라 밝은 피부와 어두운 피부가 같이 들어옵니다.
//
//   ② 디테일 보존 — 원본과 흐린 사본의 밝기차가 크면(눈매·콧날·입술선·머리카락 경계)
//      보정을 뺍니다. 차이가 작은 곳(볼·이마의 결과 얼룩)에만 들어갑니다.
//      이게 없으면 마스크가 아무리 정확해도 이목구비가 녹습니다.
//
// 라이브 미리보기에는 걸지 않습니다 — 그레인과 같은 이유입니다. 미리보기 크기에서는
// 차이가 거의 안 보이는데 매 프레임 getImageData 를 두 번 하는 비용이 큽니다.

import { makeBlurredCanvas } from "./canvas";

/** low~high 안이면 1, 경계에서 edge 만큼 부드럽게 0 으로 떨어집니다(마스크 경계 티 방지). */
const ramp = (value: number, low: number, high: number, edge: number) => {
  const inside = Math.min(value - low, high - value);
  if (inside <= 0) return 0;
  return inside >= edge ? 1 : inside / edge;
};

/** 이보다 큰 명암차는 이목구비로 보고 손대지 않습니다(0~255 기준). */
const DETAIL_LIMIT = 14;

export function smoothSkin(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  /** 0(끔) ~ 1(최대) */
  strength: number,
) {
  if (strength <= 0) return;

  // 잡티 한 개 크기에 맞춘 반경입니다. 사진 해상도가 달라져도 결과가 같아 보이도록
  // 폭에 비례시킵니다 — 고정값으로 두면 큰 사진에서는 보정이 안 먹은 것처럼 보입니다.
  const downscale = Math.max(2, Math.round(width / 120));
  const blurredCanvas = makeBlurredCanvas(context.canvas, width, height, downscale);
  const blurred = blurredCanvas
    .getContext("2d", { willReadFrequently: true })!
    .getImageData(0, 0, width, height).data;

  const image = context.getImageData(0, 0, width, height);
  const data = image.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    const cb = -0.169 * r - 0.331 * g + 0.5 * b + 128;
    const cr = 0.5 * r - 0.419 * g - 0.081 * b + 128;
    // 아주 어두운 그림자와 날아간 하이라이트는 색차가 못 믿을 값이라 함께 제외합니다.
    const skin = ramp(cb, 77, 127, 8) * ramp(cr, 133, 173, 8) * ramp(luma, 40, 250, 20);
    if (skin <= 0) continue;

    const blurredLuma = blurred[i] * 0.299 + blurred[i + 1] * 0.587 + blurred[i + 2] * 0.114;
    const detail = Math.abs(luma - blurredLuma);
    const keep = detail >= DETAIL_LIMIT ? 1 : detail / DETAIL_LIMIT;

    const weight = strength * skin * (1 - keep);
    if (weight <= 0) continue;

    // Uint8ClampedArray 라 대입할 때 알아서 반올림·클램프됩니다.
    data[i] = r + (blurred[i] - r) * weight;
    data[i + 1] = g + (blurred[i + 1] - g) * weight;
    data[i + 2] = b + (blurred[i + 2] - b) * weight;
  }

  context.putImageData(image, 0, 0);
}
