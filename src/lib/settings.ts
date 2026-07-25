import type { Settings } from "../types";
import { DEFAULT_FRAME, FRAMES } from "../config/frames";
import { DEFAULT_LAYOUT, LAYOUTS } from "../config/layouts";

const STORAGE_KEY = "photobooth-settings-v1";

export const DEFAULT_SETTINGS: Settings = {
  title: "우리들의 순간",
  tagline: "photo booth",
  caption: "오늘, 참 좋다",
  copies: 1,
  shootCount: 6,
  camEdge: "top",
  countdown: 5,
  idleSeconds: 90,
  enabledFrames: [],
  enabledLayouts: [],
  defaultFrame: DEFAULT_FRAME,
  defaultLayout: DEFAULT_LAYOUT,
  pin: "0000",
  timelapse: true,
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
};

const keepKnown = (value: unknown, known: string[]) =>
  Array.isArray(value) ? value.filter((item): item is string => known.includes(item as string)) : [];

/**
 * 저장된 설정을 읽습니다. 앱을 업데이트해 프레임·레이아웃이 바뀌어도 깨지지 않도록
 * 모르는 값은 버리고 기본값으로 되돌립니다.
 */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const saved = JSON.parse(raw) as Partial<Settings>;
    const frameKeys = FRAMES.map((frame) => frame.key);
    const layoutKeys = LAYOUTS.map((layout) => layout.key);
    return {
      title: typeof saved.title === "string" ? saved.title.slice(0, 24) : DEFAULT_SETTINGS.title,
      tagline:
        typeof saved.tagline === "string" ? saved.tagline.slice(0, 32) : DEFAULT_SETTINGS.tagline,
      caption:
        typeof saved.caption === "string" ? saved.caption.slice(0, 24) : DEFAULT_SETTINGS.caption,
      copies: clampNumber(saved.copies, 1, 10, DEFAULT_SETTINGS.copies),
      shootCount: clampNumber(saved.shootCount, 1, 8, DEFAULT_SETTINGS.shootCount),
      camEdge:
        saved.camEdge === "left" || saved.camEdge === "right" || saved.camEdge === "top"
          ? saved.camEdge
          : DEFAULT_SETTINGS.camEdge,
      countdown: clampNumber(saved.countdown, 3, 10, DEFAULT_SETTINGS.countdown),
      idleSeconds: clampNumber(saved.idleSeconds, 20, 600, DEFAULT_SETTINGS.idleSeconds),
      enabledFrames: keepKnown(saved.enabledFrames, frameKeys),
      enabledLayouts: keepKnown(saved.enabledLayouts, layoutKeys),
      defaultFrame: frameKeys.includes(saved.defaultFrame ?? "")
        ? (saved.defaultFrame as string)
        : DEFAULT_SETTINGS.defaultFrame,
      defaultLayout: layoutKeys.includes(saved.defaultLayout ?? "")
        ? (saved.defaultLayout as string)
        : DEFAULT_SETTINGS.defaultLayout,
      pin: typeof saved.pin === "string" && /^\d{4}$/.test(saved.pin) ? saved.pin : DEFAULT_SETTINGS.pin,
      timelapse: typeof saved.timelapse === "boolean" ? saved.timelapse : DEFAULT_SETTINGS.timelapse,
    };
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
