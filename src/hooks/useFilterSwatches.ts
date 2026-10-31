import { useMemo } from "react";
import type { FilterDef } from "../types";
import { bakePreviewLook } from "../lib/filterEngine";

/**
 * 필터 고르기 칩에 넣을 작은 얼굴 썸네일.
 *
 * 이름만 보고는 "블루 아워"가 뭔지 알 수 없어, 같은 얼굴 그림에 각 필터를 **실제 엔진으로**
 * 입혀 보여줍니다. CSS 필터 근사가 아니라 인화에 쓰는 bakePreviewLook 을 그대로 돌리므로
 * 칩에서 본 색이 곧 결과물의 색입니다. 64px 짜리 12장이라 비용은 무시할 수준입니다.
 */
const SIZE = 64;
const cache = new Map<string, string>();

function drawFace(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true })!;
  // 배경(밝은 하늘) · 셔츠(남색) · 얼굴(살색) · 머리(짙은 갈색) · 볼(분홍) — 채널별 커브가
  // 어떻게 갈라지는지 한눈에 드러나는 색들만 골랐습니다.
  context.fillStyle = "#cfe3f2";
  context.fillRect(0, 0, SIZE, SIZE);
  context.fillStyle = "#3f6b8f";
  context.beginPath();
  context.arc(SIZE / 2, SIZE + 6, 26, Math.PI, 0);
  context.fill();
  context.fillStyle = "#e8c3a0";
  context.beginPath();
  context.arc(SIZE / 2, SIZE * 0.47, 17, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#4a3328";
  context.beginPath();
  context.arc(SIZE / 2, SIZE * 0.42, 17.5, Math.PI * 1.05, Math.PI * 1.95);
  context.fill();
  context.fillStyle = "#e59a8a";
  context.beginPath();
  context.arc(SIZE * 0.4, SIZE * 0.53, 3.2, 0, Math.PI * 2);
  context.arc(SIZE * 0.6, SIZE * 0.53, 3.2, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#3a2a22";
  context.beginPath();
  context.arc(SIZE * 0.43, SIZE * 0.46, 1.6, 0, Math.PI * 2);
  context.arc(SIZE * 0.57, SIZE * 0.46, 1.6, 0, Math.PI * 2);
  context.fill();
  return canvas;
}

export function useFilterSwatches(filters: FilterDef[]) {
  return useMemo(() => {
    const result: Record<string, string> = {};
    for (const filter of filters) {
      const cached = cache.get(filter.key);
      if (cached !== undefined) {
        result[filter.key] = cached;
        continue;
      }
      let url = "";
      try {
        url = bakePreviewLook(drawFace(), filter, 0).toDataURL("image/jpeg", 0.85);
      } catch {
        // 썸네일을 못 만들면 이름만 보입니다 — 촬영 자체는 막지 않습니다.
      }
      cache.set(filter.key, url);
      result[filter.key] = url;
    }
    return result;
  }, [filters]);
}
