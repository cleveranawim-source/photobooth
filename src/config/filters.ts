import type { FilterDef } from "../types";

// previewCss 가 있는 필터는 라이브 미리보기에 그 값을 쓰고, 결과물에도 같은 값을 굽습니다
// (lib/filterEngine 의 WYSIWYG 베이크). blur 는 피부 결을 정리하는 약한 소프트닝입니다.
export const FILTERS: FilterDef[] = [
  { key: "none", name: "원본", css: "none" },
  {
    key: "soft",
    name: "뽀샤시",
    css: "brightness(1.12) contrast(0.9) saturate(1.06) sepia(0.04)",
    previewCss: "brightness(1.2) contrast(0.9) saturate(1.06) sepia(0.04) blur(1.4px)",
    bloom: 1,
  },
  {
    key: "glow",
    name: "화사",
    css: "brightness(1.1) contrast(0.94) saturate(1.14) sepia(0.04)",
    previewCss: "brightness(1.14) contrast(0.94) saturate(1.14) sepia(0.04) blur(0.6px)",
    bloom: 0.5,
  },
  { key: "vivid", name: "선명", css: "saturate(1.5) contrast(1.12)" },
  { key: "warm", name: "따뜻", css: "sepia(0.3) saturate(1.35) brightness(1.06)" },
  { key: "cool", name: "시원", css: "saturate(1.16) contrast(1.05) brightness(1.04) hue-rotate(-12deg)" },
  { key: "mono", name: "흑백", css: "grayscale(1) contrast(1.1) brightness(1.03)" },
  { key: "vintage", name: "빈티지", css: "sepia(0.5) contrast(1.02) brightness(1.04) saturate(1.2)" },
];

export const findFilter = (key: string): FilterDef =>
  FILTERS.find((filter) => filter.key === key) ?? FILTERS[0];
