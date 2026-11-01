// 앱 전체가 공유하는 타입. 설정(config/*)은 전부 데이터이고, 그리기 코드(lib/compose)는
// 이 타입만 보고 동작하도록 해서 프레임·레이아웃을 추가할 때 그리기 코드를 안 고쳐도 되게 합니다.

/** 손님이 지나는 화면. start→shape→frame→camera→(swap)→result 순서이고, admin 은 운영자용. */
export type Phase = "start" | "shape" | "frame" | "camera" | "swap" | "result" | "admin";

/** 전면 카메라(렌즈)가 있는 화면 가장자리 — "여기를 봐요!" 를 그쪽 화면 끝에 붙여 시선을 렌즈로 모읍니다. */
export type CamEdge = "top" | "left" | "right";

/** iPad 를 세운 방향. CSS 의 (orientation: portrait) 와 같은 기준입니다. */
export type Orientation = "landscape" | "portrait";

/**
 * 방향마다 다른 렌즈 위치. iPad 를 돌리면 같은 렌즈가 다른 변으로 가므로(가로 위 ↔ 세로 옆)
 * 값 하나로는 두 방향이 동시에 맞을 수 없습니다. 웹에서는 렌즈 위치를 알 수 없어 관리자가 방향마다 고릅니다.
 */
export type CamEdges = Record<Orientation, CamEdge>;

/** 인화물 장식 스타일. lib/decor.ts 가 이 값에 따라 바탕과 사진칸을 다르게 꾸밉니다. */
export type Decor =
  | "plain"
  | "classic"
  | "arcade"
  | "riso"
  | "film"
  | "soda"
  | "blossom"
  | "forest"
  | "kraft"
  | "sticker"
  | "ocean"
  | "autumn"
  | "snow"
  | "starry"
  | "confetti"
  | "chalk";

export type FontKey = "sans" | "serif" | "mono" | "hand";

/**
 * 인화물(종이)의 옷차림. **앱 화면 색과는 무관합니다** — 앱 인터페이스는 styles.css 에
 * 고정된 한 가지 팔레트를 쓰고, 프레임은 오직 인쇄되는 결과물에만 적용됩니다.
 * 그래서 프레임을 고르는 자리에서는 반드시 인화물 미리보기를 함께 보여줘야 합니다.
 */
export type Frame = {
  key: string;
  name: string;
  hint: string;
  /** 인화물 바탕색 */
  paper: string;
  /** 사진 셀 뒤에 깔리는 색 (사진이 덮기 전 잠깐 보입니다) */
  mat: string;
  ink: string;
  sub: string;
  accent: string;
  decor: Decor;
  titleFont: FontKey;
  photoRadius: number;
  /**
   * 글자를 흰 라벨판 위에 얹을지. 바탕이 알록달록한 프레임은 이걸 켜야 글자가 읽힙니다
   * (스티커 콜라주처럼). 켜지 않으면 종이 위에 바로 씁니다.
   */
  textPlate?: boolean;
  /**
   * 인화물에 얹을 로고 이미지(public 기준 경로). 지정하면 **이름·영문 문구·아래 문구 대신**
   * 이 그림이 들어갑니다 — 행사 로고가 주인공인 프레임용입니다. 날짜 도장은 그대로 찍힙니다.
   * 사진이 없는 가장 넓은 여백을 찾아 그 안에 맞춰 넣으므로 레이아웃마다 자리가 달라집니다.
   */
  logo?: string;
  /**
   * 로고와 짝을 이루는 작은 표식(행사 태그 등). 두 번째로 넓은 여백에 들어갑니다 —
   * 세로 스트립이면 머리 쪽입니다. 로고가 있을 때만 그립니다.
   */
  badge?: string;
};

export type LayoutCell = { x: number; y: number; w: number; h: number };

/** 인화물 위 텍스트 한 줄. y 는 조각(tile) 좌표계, size 는 300dpi 기준 px. */
export type TextSlot = { x: number; y: number; size: number; maxWidth?: number };

export type Layout = {
  key: string;
  name: string;
  hint: string;
  /** 인쇄 용지 크기(인치) — @page size 와 캔버스 크기를 여기서 끌어냅니다. */
  paper: { w: number; h: number };
  /** 반복되는 조각 하나의 논리 크기(300dpi px) */
  tile: { w: number; h: number };
  /** 용지 위 조각들의 좌상단 위치. 길이 2 면 같은 내용이 두 벌 찍혀 잘라 나눠 갖습니다. */
  tiles: { x: number; y: number }[];
  /** 조각 좌표계 안의 사진 칸. 길이가 곧 필요한 사진 수입니다. */
  cells: LayoutCell[];
  title: TextSlot;
  tagline: TextSlot;
  caption: TextSlot;
  stamp: TextSlot;
  /** 잘라내는 안내선 방향 — 조각이 둘일 때만 그립니다. */
  cut: "vertical" | "horizontal" | null;
};

/** 색조 띠 — 보정 앱의 HSL 패널과 같은 여덟 구간. 살색은 orange(주황)에 들어갑니다. */
export type HueBand = "red" | "orange" | "yellow" | "green" | "aqua" | "blue" | "purple" | "magenta";

/** 한 색조 띠의 조정. hue 는 도(°) 이동, sat·lum 은 -1~1. */
export type HslTweak = { hue?: number; sat?: number; lum?: number };

/**
 * 룩(색 보정) 정의. 보정 앱의 "프리셋"에 해당하며, 전부 lib/filmGrade 가 3D 룩업표로 구워
 * 미리보기와 결과물에 **같은 표**를 씁니다 — 그래서 화면에서 본 색이 그대로 인화됩니다.
 *
 * 적용 순서: 색조별 조정(hsl) → 채도·생동감 → 채널별 톤커브(r·g·b) → 분리 톤(split) → 페이드.
 * 톤커브는 제어점(0~1, 같은 간격) 사이를 **부드러운 단조 곡선**으로 잇습니다 — 선형으로 이으면
 * 제어점마다 계조가 꺾여 피부 같은 완만한 면에 띠가 집니다.
 */
export type FilmGrade = {
  r: number[];
  g: number[];
  b: number[];
  /** 채도 (1 = 그대로). 커브보다 먼저 적용됩니다. */
  saturation?: number;
  /** 생동감(-1~1). 채도가 낮은 색을 더 많이 올리고 살색은 덜 건드립니다 — 채도보다 티가 덜 나게 쨍해집니다. */
  vibrance?: number;
  /** 색조별 조정 — 예: 초록을 빼고 살색을 밝히기. */
  hsl?: Partial<Record<HueBand, HslTweak>>;
  /** 분리 톤 — 그림자·밝은 부분을 서로 다른 색조(°)로 물들입니다. 세기 0~1. */
  split?: { shadows?: [hue: number, amount: number]; highlights?: [hue: number, amount: number] };
  /** 페이드(0~1) — 검정을 부드럽게 들어 올려 바랜 느낌. 흰색은 그대로 둡니다. */
  fade?: number;
  /** 비네트(0~1) — 가장자리를 살짝 어둡게. 시선을 가운데(얼굴)로 모읍니다. */
  vignette?: number;
  /** 그레인 세기(0~1). 미리보기엔 안 보이는 미세 질감이라 결과물에만 넣습니다. */
  grain?: number;
  /** 그레인 알갱이 크기(px, 결과물 기준). 기본 1.6 — 1 이면 디지털 노이즈처럼 보입니다. */
  grainSize?: number;
};

export type FilterDef = {
  key: string;
  name: string;
  /** 결과물에 굽는 기본 보정(CSS filter 문법) */
  css: string;
  /** 라이브 미리보기용. 없으면 css 를 씁니다. */
  previewCss?: string;
  /** 뽀샤시 글로우 세기(0~1) — 밝은 부분을 흐리게 덧입혀 은은히 번지게 합니다. */
  bloom?: number;
  /** 필름 톤커브. 있으면 css 보정 뒤에 이어서 적용됩니다. */
  film?: FilmGrade;
};

/** 관리자 모드에서 저장하는 운영 설정. localStorage 에 통째로 보관합니다. */
export type Settings = {
  /** 인화물 상단에 찍히는 이름. 학교·행사에 맞게 바꿔 씁니다. */
  title: string;
  /** 이름 아래 작은 영문 문구 */
  tagline: string;
  /** 사진 아래 문구 (촬영자가 바꿀 수 있고, 여기 값이 기본값) */
  caption: string;
  /** 한 번에 인쇄할 매수 */
  copies: number;
  /** 촬영 컷 수. 레이아웃이 필요한 수보다 많으면 고르는 화면이 뜹니다. */
  shootCount: number;
  /** 방향마다의 렌즈 위치 — 촬영 중 "여기를 봐요!" 가 붙는 화면 가장자리 */
  camEdges: CamEdges;
  /** 촬영 카운트다운 초 */
  countdown: number;
  /** 완성·선택·촬영 대기 화면 방치 시 자동 초기화까지 걸리는 초 (촬영 시퀀스 중엔 제외) */
  idleSeconds: number;
  /** 손님에게 보여줄 프레임 목록(비우면 전부) */
  enabledFrames: string[];
  enabledLayouts: string[];
  /** 손님에게 보여줄 필터 목록(비우면 기본 여덟 — 원본·화사·따뜻한 날·여름·팝·노을·빈티지·흑백) */
  enabledFilters: string[];
  defaultFrame: string;
  defaultLayout: string;
  /** 관리자 화면 잠금 PIN */
  pin: string;
  /** 촬영 과정 타임랩스 저장 버튼 노출 여부 */
  timelapse: boolean;
  /** 피부 보정 세기(0~100, 0 이면 끔). 결과물에만 적용되고 미리보기에는 안 걸립니다. */
  skinSmooth: number;
};
