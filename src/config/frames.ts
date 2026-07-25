import type { Frame } from "../types";

// 프레임 = **인화물의 옷차림**(바탕색·글자색·장식)입니다. 앱 화면 색은 여기서 오지 않고
// styles.css 의 고정 팔레트를 씁니다 — 프레임을 바꿔도 앱 인터페이스는 그대로입니다.
// 대신 프레임 선택 화면이 인화물 미리보기(components/Previews)를 보여줍니다.
//
// surface/onAccent 같은 화면 전용 색은 여기 없습니다. 합성기(lib/compose)와 장식(lib/decor)이
// 쓰는 색만 둡니다: paper · mat · ink · sub · accent.
export const FRAMES: Frame[] = [
  {
    key: "arcade",
    name: "네온 아케이드",
    hint: "신나고 톡톡 튀게",
    paper: "#0d0b26",
    mat: "#2b2668",
    ink: "#ffffff",
    sub: "#38e8ff",
    accent: "#ff4d9d",
    decor: "arcade",
    titleFont: "sans",
    photoRadius: 20,
  },
  {
    key: "riso",
    name: "리소 페이퍼",
    hint: "따뜻하고 힙하게",
    paper: "#f4ecdc",
    mat: "#c9d4f0",
    ink: "#1f3a8a",
    sub: "#5a6ba8",
    accent: "#f2622e",
    decor: "riso",
    titleFont: "sans",
    photoRadius: 4,
  },
  {
    key: "mono",
    name: "모노크롬 스튜디오",
    hint: "격식 있고 차분하게",
    paper: "#12100e",
    mat: "#3f3a34",
    ink: "#f2ede3",
    sub: "#8a8175",
    accent: "#b4483a",
    decor: "classic",
    titleFont: "serif",
    photoRadius: 2,
  },
  {
    key: "film",
    name: "필름 스트립",
    hint: "레트로 필름처럼",
    paper: "#1a1a1a",
    mat: "#454540",
    ink: "#f5f5f0",
    sub: "#9a9a92",
    accent: "#e8c547",
    decor: "film",
    titleFont: "mono",
    photoRadius: 6,
  },
  {
    key: "soda",
    name: "소다 팝",
    hint: "상큼하고 시원하게",
    paper: "#eaf6ff",
    mat: "#c4e2f7",
    ink: "#123a5c",
    sub: "#5b7f9c",
    accent: "#ff9f1c",
    decor: "plain",
    titleFont: "sans",
    photoRadius: 24,
  },
  {
    key: "blossom",
    name: "체리 블라썸",
    hint: "사랑스럽고 보드랍게",
    paper: "#fff0f3",
    mat: "#f9d3de",
    ink: "#6b1f38",
    sub: "#a86379",
    accent: "#e0518a",
    decor: "plain",
    titleFont: "serif",
    photoRadius: 24,
  },
  {
    key: "forest",
    name: "포레스트",
    hint: "깊고 고요하게",
    paper: "#16302a",
    mat: "#356054",
    ink: "#f0ece0",
    sub: "#94b3a5",
    accent: "#8fd694",
    decor: "plain",
    titleFont: "serif",
    photoRadius: 14,
  },
  {
    key: "kraft",
    name: "크래프트 노트",
    hint: "손편지처럼 소박하게",
    paper: "#e0cfae",
    mat: "#c2ab84",
    ink: "#3b2f21",
    sub: "#7b6a52",
    accent: "#c25b2e",
    decor: "riso",
    titleFont: "mono",
    photoRadius: 8,
  },
];

export const DEFAULT_FRAME = FRAMES[0].key;

export const findFrame = (key: string): Frame =>
  FRAMES.find((frame) => frame.key === key) ?? FRAMES[0];

export const FONT_STACKS: Record<Frame["titleFont"], string> = {
  sans: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', sans-serif",
  serif: "'Apple SD Gothic Neo', Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};
