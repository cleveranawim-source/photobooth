import type { CamEdge, CamEdges, Settings } from "../types";
import { DEFAULT_FRAME, FRAMES } from "../config/frames";
import { DEFAULT_LAYOUT, LAYOUTS } from "../config/layouts";
import { FILTERS } from "../config/filters";

const STORAGE_KEY = "photobooth-settings-v1";

export const DEFAULT_SETTINGS: Settings = {
  title: "우리들의 순간",
  tagline: "photo booth",
  caption: "오늘, 참 좋다",
  copies: 1,
  shootCount: 6,
  // 이 키오스크의 iPad 는 렌즈가 짧은 변에 있는 기종(2021년까지의 Pro·Air·일반 iPad)을 렌즈가 오른쪽으로
  // 가게 가로로 세워 씁니다 — 가로 오른쪽, 세로 위. 렌즈가 긴 변에 있는 2022년 이후 기종(10세대·Air M2/M3·
  // Pro M4)은 반대로 가로 위, 세로 옆이라 관리자가 바꿔 둡니다. 실기기에서 확인한 값입니다(2026-11-01).
  camEdges: { landscape: "right", portrait: "top" },
  countdown: 5,
  idleSeconds: 90,
  enabledFrames: [],
  enabledLayouts: [],
  enabledFilters: [],
  defaultFrame: DEFAULT_FRAME,
  defaultLayout: DEFAULT_LAYOUT,
  pin: "0000",
  timelapse: true,
  // 중학생 대상 기본값. 더 올리면 얼굴이 매끈해지는 대신 인화물에서 질감이 사라집니다.
  skinSmooth: 40,
};

/**
 * 관리자가 필터를 따로 고르지 않았을 때 보이는 여덟. 은은한 것(맑게·크림·필름·블루 아워)은 빼고
 * 한눈에 다른 것들로 — 손님이 "필터가 있긴 한가" 하지 않도록. 순서는 FILTERS 를 따릅니다.
 */
export const DEFAULT_QUICK_FILTERS = ["none", "glow", "warmDay", "summer", "pop", "golden", "vintage", "mono"];

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
};

const keepKnown = (value: unknown, known: string[]) =>
  Array.isArray(value) ? value.filter((item): item is string => known.includes(item as string)) : [];

const isCamEdge = (value: unknown): value is CamEdge =>
  value === "top" || value === "left" || value === "right";

/**
 * 방향별 렌즈 위치. 예전 저장본은 `camEdge` 하나뿐인데, 그때 관리자 설명이 "가로 거치" 기준이었으므로
 * 가로 값으로 옮기고 세로는 기본값(위)을 씁니다.
 */
function readCamEdges(saved: Record<string, unknown>): CamEdges {
  const fallback = DEFAULT_SETTINGS.camEdges;
  const edges = saved.camEdges;
  if (edges && typeof edges === "object") {
    const { landscape, portrait } = edges as Record<string, unknown>;
    return {
      landscape: isCamEdge(landscape) ? landscape : fallback.landscape,
      portrait: isCamEdge(portrait) ? portrait : fallback.portrait,
    };
  }
  if (isCamEdge(saved.camEdge)) return { landscape: saved.camEdge, portrait: fallback.portrait };
  return { ...fallback };
}

/**
 * 저장된 값을 지금 앱의 설정 모양으로 맞춥니다. 앱을 업데이트해 프레임·레이아웃이 바뀌어도
 * 깨지지 않도록 모르는 값은 버리고 기본값으로 되돌립니다.
 */
export function normalizeSettings(saved: Record<string, unknown>): Settings {
  const s = saved as Partial<Settings>;
  const frameKeys = FRAMES.map((frame) => frame.key);
  const layoutKeys = LAYOUTS.map((layout) => layout.key);
  const filterKeys = FILTERS.map((filter) => filter.key);
  return {
    title: typeof s.title === "string" ? s.title.slice(0, 24) : DEFAULT_SETTINGS.title,
    tagline: typeof s.tagline === "string" ? s.tagline.slice(0, 32) : DEFAULT_SETTINGS.tagline,
    caption: typeof s.caption === "string" ? s.caption.slice(0, 24) : DEFAULT_SETTINGS.caption,
    copies: clampNumber(s.copies, 1, 10, DEFAULT_SETTINGS.copies),
    shootCount: clampNumber(s.shootCount, 1, 8, DEFAULT_SETTINGS.shootCount),
    camEdges: readCamEdges(saved),
    countdown: clampNumber(s.countdown, 3, 10, DEFAULT_SETTINGS.countdown),
    idleSeconds: clampNumber(s.idleSeconds, 20, 600, DEFAULT_SETTINGS.idleSeconds),
    enabledFrames: keepKnown(s.enabledFrames, frameKeys),
    enabledLayouts: keepKnown(s.enabledLayouts, layoutKeys),
    enabledFilters: keepKnown(s.enabledFilters, filterKeys),
    defaultFrame: frameKeys.includes(s.defaultFrame ?? "")
      ? (s.defaultFrame as string)
      : DEFAULT_SETTINGS.defaultFrame,
    defaultLayout: layoutKeys.includes(s.defaultLayout ?? "")
      ? (s.defaultLayout as string)
      : DEFAULT_SETTINGS.defaultLayout,
    pin: typeof s.pin === "string" && /^\d{4}$/.test(s.pin) ? s.pin : DEFAULT_SETTINGS.pin,
    timelapse: typeof s.timelapse === "boolean" ? s.timelapse : DEFAULT_SETTINGS.timelapse,
    skinSmooth: clampNumber(s.skinSmooth, 0, 100, DEFAULT_SETTINGS.skinSmooth),
  };
}

/** 저장된 설정을 읽습니다. 없거나 깨졌으면 기본값. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    return normalizeSettings(parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {});
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 프라이빗 모드 등 저장 불가 — 이번 세션 동안만 유지됩니다.
  }
}

/** 손님에게 보여줄 프레임 목록. 관리자가 아무것도 안 고르면 전부 보여줍니다. */
export const visibleFrames = (settings: Settings) =>
  settings.enabledFrames.length
    ? FRAMES.filter((frame) => settings.enabledFrames.includes(frame.key))
    : FRAMES;

export const visibleLayouts = (settings: Settings) =>
  settings.enabledLayouts.length
    ? LAYOUTS.filter((layout) => settings.enabledLayouts.includes(layout.key))
    : LAYOUTS;

/** 손님에게 보여줄 필터 목록. 관리자가 안 골랐으면 기본 일곱. 순서는 FILTERS 를 따릅니다. */
export const visibleFilters = (settings: Settings) => {
  const keys = settings.enabledFilters.length ? settings.enabledFilters : DEFAULT_QUICK_FILTERS;
  return FILTERS.filter((filter) => keys.includes(filter.key));
};
