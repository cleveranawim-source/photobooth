# 한 화면에 한 가지 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 포토부스 흐름을 "찍기 버튼 → 모양 → 프레임 → 프레임 안에서 촬영 → 여분과 바꾸기 → 인쇄"로 바꾸고, 촬영 화면이 인화물 그 자체가 되게 한다.

**Architecture:** 화면 흐름은 `App.tsx`의 `phase` 상태를 `start | shape | frame | camera | swap | result | admin`으로 늘려 처리한다. 촬영·바꾸기 화면은 공용 `PrintStage` 컴포넌트가 그린다: 조각(tile) 한 장을 `composePrint`로 합성한 이미지 위에 여분 칸·활성 칸을 조각 좌표계(300dpi px)로 겹치고, 순수 함수 `stageTransform`이 계산한 `translate/scale` 하나로 통째로 변환한다. 활성 칸 안에 기존 `<video>`·필름 캔버스·카운트다운이 들어가며, 촬영 자체(`captureVideoFrame`, `centerCrop`, 줌 상한)는 손대지 않는다.

**Tech Stack:** React 19, TypeScript 5.8, Vite 7, 캔버스 2D. 단위 테스트는 vitest(새로 추가), 흐름 검증은 Python Playwright(이미 설치됨) 스크립트 `tools/verify-flow.py`.

**Spec:** `docs/superpowers/specs/2026-11-01-one-thing-flow-design.md`

## Global Constraints

- 팔레트(소다 팝, `styles.css`의 `--paper/--ink/--accent…`), 폰트(Paperlogy 자가호스팅), 인화물 합성(`lib/compose.ts`, `lib/decor.ts`), 필터 엔진, 촬영 크롭(`centerCrop`)·해상도(`captureWidth = cell.w * 2`)는 바꾸지 않는다.
- 화면마다 결정은 하나. 고르는 화면에는 "다음" 버튼이 없고, 누르면 넘어간다.
- 촬영 화면의 활성 칸 높이는 조각 영역 높이의 40% 이상. 넘치면 활성 칸이 영역 가운데에 오도록 조각을 민다(넘치는 축만, 0.4초 이징).
- 두 조각 레이아웃은 촬영·바꾸기 화면에서 첫 조각만 보여준다(`singleTileLayout`).
- 카피는 한국어 해요체. 카메라 오류는 "선생님을 불러주세요"로 끝난다.
- iPad Safari(iPadOS 16+) 가로 1180×820·세로 820×1180에서 start·shape·frame·camera·swap·result 화면이 각각 한 화면에 들어가고(문서 스크롤 없음) 가로 넘침이 없어야 한다. 촬영 버튼은 어느 방향에서도 보인다.
- 서버 없음, 정적 빌드. `npm run build`(tsc -b 포함)가 통과해야 한다.

## Review Focus

- 관리자가 모양 하나·프레임 하나만 켠 경우: 시작 버튼을 누르면 2·3 화면을 건너뛰고 바로 카메라로 간다. 카메라에서 "뒤로"는 시작 화면이다. → Task 4 검증 스크립트의 `skip` 변형.
- 카메라 권한 거부: 3 프레임 화면에 머물며 "선생님을 불러주세요" 오류가 카드 위에 보이고, 다른 프레임을 다시 눌러 재시도할 수 있다. → Task 4 `deny` 변형.
- `shootCount`가 칸 수와 같을 때 5 바꾸기 화면을 건너뛰고 바로 완성으로 간다. → Task 6 `exact` 변형.
- 가로 4컷 띠에서 여분 칸이 조각 오른쪽에 붙고 내용이 영역보다 넓어져 활성 칸이 가로로 밀린다(음수 x). → Task 1 단위 테스트 + Task 5 `band` 변형 스크린샷.
- 2·3 화면에서 학생이 자리를 뜨면 `idleSeconds` 뒤 시작 화면으로 돌아간다. → Task 7 `idle` 변형.

---

### Task 1: 무대 기하 — 여분 칸 배치·변환·바꾸기 (순수 함수 + vitest)

**Files:**
- Modify: `package.json` (devDependency `vitest`, script `"test": "vitest run"`)
- Create: `src/lib/stageGeometry.ts`
- Test: `src/lib/stageGeometry.test.ts`

**Interfaces:**
- Consumes: `Layout`, `LayoutCell` (`src/types.ts`), `findLayout` (`src/config/layouts.ts`)
- Produces:
  - `type Rect = { x: number; y: number; w: number; h: number }`
  - `const SLOT_GAP = 20` (조각 단위 px)
  - `captureSlots(layout: Layout, total: number): LayoutCell[]` — 조각 칸 뒤에 여분 칸을 같은 크기로 이어 붙인 목록(길이 `max(total, cells.length)`). 방향: `tile.w > tile.h`면 오른쪽(칸들의 서로 다른 y 값을 행으로 써서 열 단위로 채움), 아니면 아래(칸들의 서로 다른 x 값을 열로 써서 행 단위로 채움). 첫 여분은 조각 가장자리에서 `SLOT_GAP` 떨어진다.
  - `contentBounds(layout: Layout, slots: LayoutCell[]): Rect` — 조각 사각형 `(0,0,tile.w,tile.h)`과 모든 칸의 합집합.
  - `type StageTransform = { scale: number; x: number; y: number }` — CSS `translate(x px, y px) scale(scale)`, 원점 좌상단, x·y는 화면 px.
  - `stageTransform(area: { w: number; h: number }, bounds: Rect, active: Rect | null, minCellFraction = 0.4): StageTransform` — `fit = min(area.w/bounds.w, area.h/bounds.h)`; `active`가 있으면 `scale = max(fit, minCellFraction * area.h / active.h)`, 없으면 `fit`. 축마다 내용이 영역에 들어가면 가운데 정렬, 넘치면 활성 칸 중심이 영역 중심에 오도록 민다.
  - `swapSlots(order: number[], a: number, b: number): number[]` — 두 자리를 맞바꾼 새 배열. `a === b`면 입력과 같은 내용.

- [ ] **Step 1: vitest 설치**

Run: `npm install -D vitest@^3.2 && npm pkg set scripts.test="vitest run"`
Expected: `package.json` devDependencies에 vitest, `npm test`가 "No test files found"로 종료.

- [ ] **Step 2: 실패하는 테스트 작성** — `src/lib/stageGeometry.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { findLayout } from "../config/layouts";
import { captureSlots, contentBounds, stageTransform, swapSlots, SLOT_GAP } from "./stageGeometry";

const strip2 = findLayout("strip2"); const band2 = findLayout("band2");
const grid4 = findLayout("grid4"); const single = findLayout("single");

describe("captureSlots", () => {
  it("칸 수와 같으면 조각 칸 그대로", () => { expect(captureSlots(strip2, 4)).toEqual(strip2.cells); });
  it("세로 조각은 아래로 쌓인다", () => {
    const slots = captureSlots(strip2, 6);
    expect(slots).toHaveLength(6);
    expect(slots[4]).toEqual({ x: 40, y: 1800 + SLOT_GAP, w: 520, h: 316 });
    expect(slots[5]).toEqual({ x: 40, y: 1800 + SLOT_GAP + 316 + SLOT_GAP, w: 520, h: 316 });
  });
  it("가로 띠는 오른쪽으로 이어진다", () => {
    const slots = captureSlots(band2, 6);
    expect(slots[4]).toEqual({ x: 1800 + SLOT_GAP, y: 80, w: 346, h: 440 });
    expect(slots[5]).toEqual({ x: 1800 + SLOT_GAP + 346 + SLOT_GAP, y: 80, w: 346, h: 440 });
  });
  it("격자는 열 두 개를 써서 행으로 채운다", () => {
    const slots = captureSlots(grid4, 7);
    expect(slots[4]).toEqual({ x: 70, y: 1800 + SLOT_GAP, w: 515, h: 660 });
    expect(slots[5]).toEqual({ x: 615, y: 1800 + SLOT_GAP, w: 515, h: 660 });
    expect(slots[6]).toEqual({ x: 70, y: 1800 + SLOT_GAP + 660 + SLOT_GAP, w: 515, h: 660 });
  });
  it("단컷 여분은 아래", () => {
    expect(captureSlots(single, 2)[1]).toEqual({ x: 90, y: 1800 + SLOT_GAP, w: 1020, h: 1020 });
  });
});

describe("contentBounds", () => {
  it("세로 조각 + 여분 2", () => {
    expect(contentBounds(strip2, captureSlots(strip2, 6))).toEqual({ x: 0, y: 0, w: 600, h: 2472 });
  });
  it("가로 띠 + 여분 2", () => {
    expect(contentBounds(band2, captureSlots(band2, 6))).toEqual({ x: 0, y: 0, w: 2532, h: 600 });
  });
});

describe("stageTransform", () => {
  const area = { w: 760, h: 700 };
  it("활성 칸이 40% 이상이 되도록 키우고, 세로로 넘치면 활성 칸을 가운데로", () => {
    const slots = captureSlots(strip2, 6);
    const t = stageTransform(area, contentBounds(strip2, slots), slots[0]);
    expect(t.scale).toBeCloseTo(0.8861, 3);
    expect(t.x).toBeCloseTo((760 - 600 * t.scale) / 2, 1);
    expect(t.y).toBeCloseTo(350 - (166 + 158) * t.scale, 1);
  });
  it("통째로 들어가면 fit 배율로 가운데", () => {
    const t = stageTransform(area, { x: 0, y: 0, w: 1200, h: 1800 }, single.cells[0]);
    expect(t.scale).toBeCloseTo(700 / 1800, 4);
    expect(t.x).toBeCloseTo((760 - 1200 * t.scale) / 2, 1);
    expect(t.y).toBeCloseTo(0, 1);
  });
  it("가로 띠 마지막 여분은 가로로 밀려 x 가 음수", () => {
    const slots = captureSlots(band2, 6);
    const t = stageTransform(area, contentBounds(band2, slots), slots[5]);
    expect(t.scale).toBeCloseTo(0.4 * 700 / 440, 4);
    expect(t.x).toBeCloseTo(380 - (2186 + 173) * t.scale, 1);
    expect(t.y).toBeCloseTo((700 - 600 * t.scale) / 2, 1);
  });
  it("활성 칸이 없으면 fit", () => {
    const t = stageTransform(area, { x: 0, y: 0, w: 600, h: 2472 }, null);
    expect(t.scale).toBeCloseTo(700 / 2472, 4);
  });
});

describe("swapSlots", () => {
  it("두 자리를 바꾼 새 배열", () => {
    const order = [0, 1, 2, 3, 4, 5];
    expect(swapSlots(order, 1, 4)).toEqual([0, 4, 2, 3, 1, 5]);
    expect(order).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("같은 자리면 그대로", () => { expect(swapSlots([0, 1, 2], 2, 2)).toEqual([0, 1, 2]); });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module './stageGeometry'`

- [ ] **Step 4: `src/lib/stageGeometry.ts` 구현** — Interfaces의 네 함수와 두 타입. 파일 머리 주석에 "조각 좌표계(300dpi px), 여분은 조각 바깥으로 이어 붙는다"를 적는다.

- [ ] **Step 5: 통과 확인**

Run: `npm test`
Expected: PASS (13 tests)

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json src/lib/stageGeometry.ts src/lib/stageGeometry.test.ts
git commit -m "무대 기하: 여분 칸 배치·활성 칸 변환·바꾸기 (vitest 도입)"
```

---

### Task 2: 설정·타입·레이아웃 보조 — `enabledFilters`, `singleTileLayout`, 새 Phase

**Files:**
- Modify: `src/types.ts` (Phase, Settings)
- Modify: `src/lib/settings.ts`
- Modify: `src/config/layouts.ts`
- Test: `src/lib/settings.test.ts`, `src/config/layouts.test.ts`

**Interfaces:**
- Produces:
  - `type Phase = "start" | "shape" | "frame" | "camera" | "swap" | "result" | "admin"`
  - `Settings.enabledFilters: string[]` (비우면 기본 넷). `shootCount`는 유지(1~8).
  - `DEFAULT_QUICK_FILTERS = ["none", "clear", "warmDay", "mono"]` (`settings.ts` export)
  - `visibleFilters(settings: Settings): FilterDef[]` — `enabledFilters`가 비면 `DEFAULT_QUICK_FILTERS`, 아니면 그 목록. 결과 순서는 `FILTERS` 순서.
  - `loadSettings`가 `enabledFilters`를 `keepKnown(saved.enabledFilters, FILTERS 키)`로 읽는다. 저장된 옛 설정(키 없음)은 `[]`.
  - `singleTileLayout(layout: Layout): Layout` (`config/layouts.ts`) — 조각이 하나면 같은 객체, 둘이면 `{ ...layout, paper: { w: tile.w / 300, h: tile.h / 300 }, tiles: [{ x: 0, y: 0 }], cut: null }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/config/layouts.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { findLayout, singleTileLayout } from "./layouts";
describe("singleTileLayout", () => {
  it("두 조각 레이아웃은 첫 조각만 남는다", () => {
    const one = singleTileLayout(findLayout("strip2"));
    expect(one.paper).toEqual({ w: 2, h: 6 });
    expect(one.tiles).toEqual([{ x: 0, y: 0 }]);
    expect(one.cut).toBeNull();
    expect(one.cells).toBe(findLayout("strip2").cells);
  });
  it("한 조각이면 같은 객체", () => { const g = findLayout("grid4"); expect(singleTileLayout(g)).toBe(g); });
});
```
`src/lib/settings.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_QUICK_FILTERS, DEFAULT_SETTINGS, visibleFilters } from "./settings";
describe("visibleFilters", () => {
  it("비우면 기본 넷", () => {
    expect(visibleFilters({ ...DEFAULT_SETTINGS, enabledFilters: [] }).map((f) => f.key)).toEqual(DEFAULT_QUICK_FILTERS);
  });
  it("고른 것만, FILTERS 순서로", () => {
    expect(visibleFilters({ ...DEFAULT_SETTINGS, enabledFilters: ["pop", "mono"] }).map((f) => f.key)).toEqual(["mono", "pop"]);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test` / Expected: FAIL (`singleTileLayout`, `visibleFilters` 없음, 타입 오류)

- [ ] **Step 3: 구현** — `types.ts`의 `Phase`·`Settings.enabledFilters`(주석: 비우면 기본 넷), `settings.ts`의 `DEFAULT_SETTINGS.enabledFilters: []`·`DEFAULT_QUICK_FILTERS`·`visibleFilters`·`loadSettings` 읽기, `layouts.ts`의 `singleTileLayout`. 빌드가 깨지지 않도록 `App.tsx`와 `components/Steps.tsx`에 남은 옛 리터럴을 이름만 바꾼다: `"welcome"` → `"start"`, `"select"` → `"swap"` (`useState<Phase>(…)`, `setPhase(…)`, `phase === …` 비교, `Steps.tsx`의 `STEP_OF` 키 전부). 옛 화면(Welcome·Select)은 새 이름 아래 그대로 렌더되며 Task 4·6에서 교체된다.

- [ ] **Step 4: 통과 확인** — Run: `npm test && npm run build` / Expected: PASS, 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add src/types.ts src/lib/settings.ts src/lib/settings.test.ts src/config/layouts.ts src/config/layouts.test.ts src/App.tsx
git commit -m "설정: enabledFilters + singleTileLayout + 새 Phase"
```

---

### Task 3: `PrintStage` 컴포넌트 + `useTileImage` + `StepDots`

**Files:**
- Create: `src/components/PrintStage.tsx`
- Create: `src/hooks/useTileImage.ts`
- Rewrite: `src/components/Steps.tsx` (`Steps` → `StepDots`)
- Modify: `src/styles.css` (새 블록 `/* ── 인화물 무대 ── */`, `.steps` 블록을 `.step-dots`로 교체)

**Interfaces:**
- Consumes: Task 1의 `captureSlots`·`contentBounds`·`stageTransform`, Task 2의 `singleTileLayout`, `composePrint` (`lib/compose.ts`)
- Produces:
  - `useTileImage(input: { frame: Frame; layout: Layout; images: string[]; title: string; tagline: string; caption: string }): string | null` — `composePrint({ images, frame, layout: singleTileLayout(layout), title, tagline, caption, scale: 1, quality: 0.85 })` 결과. 입력이 바뀌면 다시 만들되 새 그림이 올 때까지 이전 그림을 유지. `images`는 호출 쪽이 `useMemo`로 고정한 배열이어야 한다(의존성으로 그대로 쓴다). 언마운트·입력 변경 시 늦게 도착한 결과는 버린다.
  - `PrintStage` props:
    ```ts
    type PrintStageProps = {
      layout: Layout; frame: Frame;
      tileSrc: string | null;            // useTileImage 결과. null 이면 frame.paper 색 사각형
      slots: LayoutCell[];               // captureSlots 결과. index ≥ layout.cells.length 는 여분
      shots: (string | undefined)[];     // slots 와 같은 인덱스. 여분 칸에만 그린다(조각 칸은 tileSrc 에 이미 있음)
      activeIndex: number | null;        // 주황 테두리 + children 이 들어가는 칸
      selectedIndex?: number | null;     // 바꾸기 화면에서 고른 칸(남색 테두리)
      onSlotTap?: (index: number) => void;   // 있으면 칸마다 투명 버튼(aria-label "N번째 칸" / "여분 N")
      onSlotHold?: (index: number) => void;  // 500ms 길게 누름
      children?: ReactNode;              // 활성 칸 안. 칸 좌표계(조각 px) 기준 absolute
    };
    ```
    컨테이너 `.print-stage`(부모를 꽉 채움, `overflow: hidden`)의 크기를 `ResizeObserver`로 재서 `area`로 쓰고, `.print-stage-content`(width/height = bounds, `transform-origin: 0 0`, `transition: transform .4s cubic-bezier(.22,1,.36,1)`)에 `stageTransform` 결과를 건다. 활성 칸 박스는 `key="active"`로 자리가 고정되어 칸이 바뀌어도 안의 `<video>`가 다시 붙지 않는다. 여분 칸 라벨 "여분 N"의 글자 크기는 `slot.h * 0.12`.
  - `StepDots({ current, total = 3 }: { current: number; total?: number })` — `aria-label="{total}단계 중 {current}단계"`, 현재 점은 길쭉한 남색.

- [ ] **Step 1: `useTileImage` 작성** — 위 시그니처. `useEffect` 의존성 `[frame, layout, images, title, tagline, caption]`, `cancelled` 플래그.

- [ ] **Step 2: `PrintStage` 작성** — 위 구조. 활성 칸 스타일: `border: 6px solid var(--accent)`(조각 단위라 scale 에 함께 줄어듦), `box-shadow: 0 0 0 10px rgba(255,159,28,.3)`, `border-radius: frame.photoRadius`. 고른 칸: `outline: 8px solid var(--ink)`.

- [ ] **Step 3: `StepDots` 작성, `Steps` 제거** — `App.tsx`에서 `<Steps phase={phase} />` 호출을 지운다(새 상단 바는 Task 4).

- [ ] **Step 4: CSS** — `.print-stage`, `.print-stage-content`, `.stage-tile`, `.stage-extra`, `.stage-extra img`, `.stage-hit`(투명, `background: none; border: 0`), `.stage-active`, `.stage-selected`, `.step-dots`. `@media (prefers-reduced-motion: reduce)` 블록이 이미 transition 을 끄므로 추가 처리 없음.

- [ ] **Step 5: 빌드 확인** — Run: `npm run build && npm test` / Expected: 성공(아직 어느 화면도 PrintStage 를 쓰지 않으므로 `noUnusedLocals` 경고는 없다 — export 된 심볼은 검사 대상이 아니다)

- [ ] **Step 6: 커밋**

```bash
git add src/components/PrintStage.tsx src/hooks/useTileImage.ts src/components/Steps.tsx src/styles.css src/App.tsx
git commit -m "PrintStage: 조각 + 여분 칸 + 활성 칸을 한 변환으로 그리는 무대"
```

---

### Task 4: 시작·모양·프레임 화면과 흐름 배선 (+ 검증 스크립트 1부)

**Files:**
- Create: `src/screens/StartScreen.tsx`, `src/screens/ShapeScreen.tsx`, `src/screens/FrameScreen.tsx`
- Delete: `src/screens/WelcomeScreen.tsx`
- Modify: `src/App.tsx`, `src/hooks/usePrintPreviews.ts` (`layouts` 입력과 `layoutPreviewKey` 제거), `src/styles.css` (`/* ── 환영 화면 ── */` 블록 전체를 `/* ── 시작 ── */`, `/* ── 모양 ── */`, `/* ── 프레임 ── */`로 교체)
- Create: `tools/verify-flow.py`

**Interfaces:**
- Consumes: `LayoutShape`, `PrintPreview` (`components/Previews.tsx`), `framePreviewKey`, `StepDots`, `useCamera().start`
- Produces:
  - `StartScreen({ title, tagline, samples, onStart, onAdmin }: { title: string; tagline: string; samples: string[]; onStart: () => void; onAdmin: () => void })` — 제목(2초 길게 누르면 `onAdmin`), 부제, "사진 찍기" 버튼(`.start-button`, 높이 ≥ 96px, 글자 40px), 아래 샘플 인화물 최대 3장(`<img>`, 누를 수 없음).
  - `ShapeScreen({ layouts, onPick, onBack }: { layouts: Layout[]; onPick: (key: string) => void; onBack: () => void })` — 제목 "어떤 모양으로 찍을까요?", 카드 `button.shape-card`(실루엣·이름·설명, 최소 높이 360px).
  - `FrameScreen({ frames, layout, previews, error, onPick, onBack }: { frames: Frame[]; layout: Layout; previews: Record<string, string>; error: string | null; onPick: (key: string) => void; onBack: () => void })` — 제목 "어떤 프레임에 담을까요?", 가로 스크롤 카드 `button.frame-pick`(폭 300px, `scroll-snap-align: center`, 미리보기·이름·설명, `logo` 있으면 "행사" 뱃지). `error`가 있으면 제목 아래 `p.error[role=alert]`.
  - App 상태·함수:
    - `const orderedFrames = useMemo(() => [...frames.filter((f) => f.logo), ...frames.filter((f) => !f.logo)], [frames])`
    - `goShape()`: `layouts.length === 1`이면 `setLayoutKey(layouts[0].key); goFrame()` 아니면 `setPhase("shape")`
    - `goFrame()`: `orderedFrames.length === 1`이면 `setFrameKey(...); void startCamera()` 아니면 `setPhase("frame")`
    - `pickShape(key)`, `pickFrame(key)`: 값을 넣고 다음으로. `startCamera()`는 실패 시 phase 를 바꾸지 않는다(오류는 `error`로 FrameScreen 에 전달).
    - 뒤로: shape → `reset()`; frame → `layouts.length === 1 ? reset() : setPhase("shape")`; camera → `orderedFrames.length === 1 ? (layouts.length === 1 ? reset() : setPhase("shape")) : setPhase("frame")`, 촬영 중엔 비활성, 돌아가면 `shots`·`shotIndex`를 비운다.
    - 상단 바: `start`·`admin`에서는 없음. `shape/frame/camera`에서는 왼쪽 "처음으로 / 모양 다시 / 프레임 다시" + 가운데 `StepDots current={1|2|3}`. `swap/result`에서는 `.logo` 글자만.
    - 유휴 초기화 활성 조건: `phase === "shape" || "frame" || "swap" || "result" || (phase === "camera" && !shooting)`.
    - `usePrintPreviews({ frames: orderedFrames, frame, layout, title, tagline, caption })`; `samples = orderedFrames.slice(0, 3).map((f) => previews[framePreviewKey(f.key)]).filter(Boolean)`.
  - `tools/verify-flow.py` (python3, Playwright): `python3 tools/verify-flow.py <out_dir> [--only start,shape,frame,camera]`. 인자 없이 실행하면 가로 1180×820·세로 820×1180 두 컨텍스트를 병렬로 돌리며, 기본 설정(`localStorage.photobooth-settings-v1`에 `{"countdown":3,"idleSeconds":20}`)으로 start → "사진 찍기" → shape → "세로 4컷" → frame → 첫 카드 → `.capture`와 `.status` 텍스트 "찍기"를 기다린다. 화면마다 스크린샷을 `<out_dir>/<land|port>-<phase>.png`로 저장하고 `document.documentElement.scrollWidth <= innerWidth`, `scrollHeight <= innerHeight`, 콘솔 오류 없음을 확인한다. 변형: `--skip`(설정 `enabledLayouts:["single"], enabledFrames:["arcade"]` → 시작 버튼 뒤 바로 `.capture`), `--deny`(`--use-fake-ui-for-media-stream` 없이 띄워 첫 프레임 카드 뒤 `.frame-screen .error` 텍스트에 "선생님" 포함). 실패 시 어느 검사가 깨졌는지 출력하고 exit 1.

- [ ] **Step 1: `verify-flow.py` 작성(1부: start~camera, `--skip`, `--deny`)**

- [ ] **Step 2: 실행해 실패 확인** — Run: `npx vite --port 4173 --strictPort &` 후 `python3 tools/verify-flow.py /tmp/vf` / Expected: exit 1 ("사진 찍기" 버튼 없음)

- [ ] **Step 3: 세 화면 작성, `WelcomeScreen.tsx` 삭제, `usePrintPreviews`에서 `layouts`·`layoutPreviewKey` 제거**

- [ ] **Step 4: `App.tsx` 배선** — Interfaces의 함수·상단 바·유휴 조건. `CaptureScreen`은 아직 옛 것을 그대로 쓴다(Task 5에서 교체).

- [ ] **Step 5: CSS** — `.start`(세로 가운데 정렬, `.start-button`), `.shape-list`(4열 grid, 세로에서 2열), `.shape-card`, `.frame-scroll`(가로 snap, 세로 iPad 에서도 한 줄), `.frame-pick`, `.frame-pick .event-badge`(기존 `.event-badge` 재사용), `.topbar .step-dots`.

- [ ] **Step 6: 검증** — Run: `npm run build && python3 tools/verify-flow.py /tmp/vf && python3 tools/verify-flow.py /tmp/vf --skip && python3 tools/verify-flow.py /tmp/vf --deny` / Expected: 모두 exit 0. 스크린샷 `land-start/shape/frame/camera.png`, `port-*`를 열어 본다: 시작 화면은 버튼 하나와 샘플 셋, 모양은 카드 넷, 프레임은 행사 카드가 맨 앞.

- [ ] **Step 7: 커밋**

```bash
git add src/screens/StartScreen.tsx src/screens/ShapeScreen.tsx src/screens/FrameScreen.tsx src/App.tsx src/hooks/usePrintPreviews.ts src/styles.css tools/verify-flow.py
git rm src/screens/WelcomeScreen.tsx
git commit -m "흐름 1~3: 찍기 버튼 → 모양 → 프레임 (건너뛰기·권한 거부 포함)"
```

---

### Task 5: 프레임 안에서 촬영 — `CaptureScreen`을 `PrintStage` 위에 다시 짓기

**Files:**
- Rewrite: `src/screens/CaptureScreen.tsx`
- Modify: `src/App.tsx` (촬영 시퀀스·활성 칸·조각 그림), `src/styles.css` (`/* ── 촬영 화면 ── */` 블록 교체), `tools/verify-flow.py` (2부)

**Interfaces:**
- Consumes: `PrintStage`, `useTileImage`, `captureSlots`, `useFilmPreview`, `useFilterSwatches`, `centerCrop`·`MAX_ZOOM` (기존), `captureVideoFrame` (기존)
- Produces:
  - `CaptureScreen` props:
    ```ts
    type Props = {
      videoRef: RefObject<HTMLVideoElement | null>; glowVideoRef: RefObject<HTMLVideoElement | null>;
      previewFilter: string; glowFilter: string; glowStrength: number;
      layout: Layout; frame: Frame; tileSrc: string | null; slots: LayoutCell[]; shots: string[];
      activeIndex: number;                // 다음에 찍힐 칸
      camEdge: CamEdge; countdown: number | null; shotIndex: number; total: number;
      shooting: boolean; ready: boolean; status: string; flash: boolean;
      filters: FilterDef[]; filterKey: string; film?: FilmGrade;
      zoom: number; maxZoom: number;
      onZoom: (value: number) => void; onFilter: (key: string) => void; onShoot: () => void;
    };
    ```
    구조: `main.capture` = grid `minmax(0,1fr) 320px`(세로 iPad 에서는 1열, 무대가 위·조작이 아래). 왼쪽 `div.capture-stage`(flex 영역, 그 안에 `PrintStage`)와 그 위에 `camEdge`별 가장자리에 붙는 `.look-here`(촬영 중만). `PrintStage`의 children: `<video class="cam">`, 글로우 비디오, 필름 캔버스, `.flash`, 카운트다운(칸 가운데, 한 변 = `slots[activeIndex].h * 0.4`, 글자 = 그 48%), `.zoom-badge`. 핀치 핸들러는 활성 칸 박스가 아니라 children 을 감싸는 `div.cell-touch`(inset 0, `touch-action: none` when `canZoom`)에 건다. 오른쪽 `div.capture-side`: `p.status[aria-live=polite]`, 필터 칩(기존 `.filter-chip` 재사용, 한 줄 스크롤), `button.primary-button.shoot`(촬영 중 "찍는 중 · {shotIndex} / {total}", 아니면 "{total}장 찍기").
  - App:
    - `slots = useMemo(() => captureSlots(layout, totalShots), [layout, totalShots])`
    - `tileImages = useMemo(() => shots.slice(0, needed), [shots, needed])`; `tileSrc = useTileImage({ frame, layout, images: tileImages, title: settings.title, tagline: settings.tagline, caption })`
    - `activeIndex = Math.min(shotIndex, slots.length - 1)`
    - `runSequence`는 지금과 같되 상태 문구만: 촬영 전 `"주황 칸에 내 얼굴이 들어가요. 준비되면 찍기를 눌러요"`, 칸 i(<needed)에 `"{i+1}번째 칸이에요"`, 여분 k 에 `"여분 {k}번째예요"`. 끝나면 `totalShots > needed`면 `setOrder(shots.map((_, i) => i)); setPhase("swap")`(order 상태는 Task 6에서 선언 — 이 Task 에서는 `useState<number[]>([])`만 추가), 아니면 지금처럼 합성 → result.
    - `.app--fit`은 `phase === "camera" || phase === "swap"`.
  - `verify-flow.py` 2부: camera 에서 "장 찍기" 누르고 1.6초 뒤 `*-countdown.png`, `.swap`(또는 `.result`)을 60초 안에 기다린다. 촬영 중 한 화면 검사(scrollHeight ≤ innerHeight) 유지. `--band` 변형: shape 에서 "가로 4컷 띠"를 고르고 다섯 번째 칸 촬영 중(`.status` 텍스트 "여분 1") 스크린샷 `*-band-extra.png`.

- [ ] **Step 1: `verify-flow.py` 2부 추가** — Run: `python3 tools/verify-flow.py /tmp/vf` / Expected: exit 1 (`.swap` 없음)

- [ ] **Step 2: `CaptureScreen.tsx` 다시 쓰기** — 위 구조. 기존 핀치·필름 미리보기·줌 뱃지 코드는 그대로 옮긴다.

- [ ] **Step 3: `App.tsx`** — Interfaces의 파생값·상태 문구·끝 처리. `CaptureScreen`에 새 props 전달.

- [ ] **Step 4: CSS** — `.capture`(grid, 세로에서 `grid-template-rows: minmax(0,1fr) auto`), `.capture-stage`(position relative, min-height 0), `.capture-side`(flex column, gap 14px), `.shoot`(min-height 72px, 글자 24px), `.cell-touch`, `.countdown.in-cell`(absolute 가운데, 크기는 inline style), `.look-here`의 `edge-*` 규칙은 `.capture-stage` 기준으로 옮긴다. 옛 `.stage`, `.viewfinder`, `.shot-tray`, `.tray-slot` 규칙 삭제.

- [ ] **Step 5: 검증** — Run: `npm run build && python3 tools/verify-flow.py /tmp/vf && python3 tools/verify-flow.py /tmp/vf --band` / Expected: exit 0. `land-countdown.png`·`port-countdown.png`에서 활성 칸 높이가 무대 높이의 40% 이상이고 카운트다운이 칸 안에 있으며 찍기 버튼이 보인다. `land-band-extra.png`에서 여분 칸이 조각 오른쪽에 붙어 가운데 와 있다.

- [ ] **Step 6: 커밋**

```bash
git add src/screens/CaptureScreen.tsx src/App.tsx src/styles.css tools/verify-flow.py
git commit -m "흐름 4: 프레임 안에서 촬영 — 활성 칸에 카메라, 여분 칸까지 필름처럼 감김"
```

---

### Task 6: 바꾸기 화면 + 완성 화면 정리

**Files:**
- Create: `src/screens/SwapScreen.tsx`
- Delete: `src/screens/SelectScreen.tsx`
- Modify: `src/screens/ResultScreen.tsx`, `src/App.tsx`, `src/styles.css` (`/* ── 고르기 화면 ── */` 블록을 `/* ── 바꾸기 ── */`로 교체, `.zoom-overlay`는 유지), `tools/verify-flow.py` (3부)

**Interfaces:**
- Consumes: `PrintStage`, `useTileImage`, `swapSlots`
- Produces:
  - `SwapScreen` props:
    ```ts
    type Props = {
      layout: Layout; frame: Frame; tileSrc: string | null; slots: LayoutCell[];
      shots: (string | undefined)[];   // order 대로 재배열된 사진, slots 와 같은 인덱스
      selected: number | null; busy: boolean;
      onTap: (index: number) => void; onHold: (index: number) => void; onDone: () => void;
    };
    ```
    제목 "마음에 안 드는 칸이 있나요?", 설명 "칸을 누르고 여분 사진을 누르면 바뀌어요. 길게 누르면 크게 봐요.", `PrintStage`(activeIndex null, selectedIndex, onSlotTap, onSlotHold), 버튼 "이걸로 할래요" 하나(`busy`면 "만드는 중"). 길게 누른 칸은 기존 `.zoom-overlay`(닫기 버튼만)로 크게 보여준다 — overlay 상태는 SwapScreen 안에서 든다.
  - App:
    - `const [order, setOrder] = useState<number[]>([])`, `const [selectedSlot, setSelectedSlot] = useState<number | null>(null)`
    - `orderedShots = useMemo(() => order.map((i) => shots[i]), [order, shots])`; swap 화면의 `tileSrc`는 `useTileImage({ …, images: orderedShots.slice(0, needed) })` — camera 와 같은 훅 호출을 쓰되 `images`를 `phase === "swap" ? orderedShots.slice(0, needed) : shots.slice(0, needed)`로 고른 메모 배열 하나로 넘긴다.
    - `tapSlot(i)`: `selectedSlot === null → setSelectedSlot(i)`; `=== i → null`; 아니면 `setOrder(swapSlots(order, selectedSlot, i)); setSelectedSlot(null)`.
    - `finishSwap()`: `setSourceShots(orderedShots); compose(orderedShots.slice(0, needed))` → result (세대 확인은 기존 `finishSelect`와 같다).
    - `reset()`·`startCamera()`에서 `order`·`selectedSlot` 비움.
  - `ResultScreen` 변경: 버튼 글자 "인쇄하기{copies>1 ? ` (N장)` : ""}", "내 폰에 저장", `dress-toggle` 글자 "문구·프레임 바꾸기", 되돌리기 "처음부터 다시". `result-hint`·`done-toast`·`idle-note`·`sample-badge`·`dress-sheet`는 유지. props 는 바뀌지 않는다.
  - `verify-flow.py` 3부: swap 에서 `.stage-hit` 첫째(1번째 칸)와 다섯째(여분 1)를 눌러 스크린샷 `*-swap.png`, "이걸로 할래요" → `.result` → "인쇄하기" → `.done-toast` → `.idle-note`(≤ 20초) 스크린샷. `--exact` 변형: 설정 `shootCount: 4` → 촬영 뒤 `.swap` 없이 바로 `.result`.

- [ ] **Step 1: `verify-flow.py` 3부 추가** — Run: `python3 tools/verify-flow.py /tmp/vf` / Expected: exit 1 ("이걸로 할래요" 없음)

- [ ] **Step 2: `SwapScreen.tsx` 작성, `SelectScreen.tsx` 삭제, `ResultScreen.tsx` 글자 변경**

- [ ] **Step 3: `App.tsx`** — `order`·`selectedSlot`·`tapSlot`·`finishSwap`, `SwapScreen` 렌더, `SelectScreen`·`togglePick`·`picked`·`finishSelect` 제거.

- [ ] **Step 4: CSS** — `.swap`(grid `minmax(0,1fr) 340px`, 세로 1열), `.swap-stage`, `.swap-side`, `.stage-selected` 는 Task 3 것. 옛 `.shot-grid`, `.shot-card`, `.shot-pick`, `.zoom-button`, `.order-badge`, `.pick-progress`, `.select-actions` 삭제(`.admin-actions`는 남긴다).

- [ ] **Step 5: 검증** — Run: `npm run build && npm test && python3 tools/verify-flow.py /tmp/vf && python3 tools/verify-flow.py /tmp/vf --exact` / Expected: exit 0. `land-swap.png`에서 1번째 칸과 여분 1이 바뀌어 있고, `land-result.png`에 버튼 셋 + "처음부터 다시".

- [ ] **Step 6: 커밋**

```bash
git add src/screens/SwapScreen.tsx src/screens/ResultScreen.tsx src/App.tsx src/styles.css tools/verify-flow.py
git rm src/screens/SelectScreen.tsx
git commit -m "흐름 5·6: 여분과 바꾸기 + 완성 화면 버튼 셋"
```

---

### Task 7: 관리자 설정·샘플 이동·정리·README·최종 검증

**Files:**
- Modify: `src/screens/AdminScreen.tsx`, `src/App.tsx`, `src/styles.css`, `README.md`, `tools/verify-flow.py` (4부)

**Interfaces:**
- `AdminScreen` props 에 `onSample: () => void` 추가. 화면에 "손님에게 보여줄 보정" 칩 묶음(`FILTERS` 전부, `enabledFilters` 토글, 안내 "아무것도 고르지 않으면 원본·맑게·따뜻한 날·흑백을 보여줍니다")과 "샘플 인화물 보기" 버튼(`ghost-button`, 하단 `admin-actions`). 촬영 컷 수 안내는 "칸 수와 같게 두면 바꾸기 화면이 사라져요" 한 줄 추가.
- App: `openSample()`을 관리자에서만 부른다(`onSample={() => void openSample()}`). `visibleFilters(settings)`를 `CaptureScreen`의 `filters`로 넘기고, `filterKey` 초기값과 `applySettings` 뒤의 값은 그 목록 첫 키로 맞춘다(지금 값이 목록에 없을 때).
- `verify-flow.py` 4부: `--idle` 변형(설정 `idleSeconds: 20`, shape 화면에서 25초 대기 → `.start` 보임), admin 열기(start 제목 2.1초 길게 누르기 → PIN 0000) 스크린샷 `*-admin.png`, "샘플 인화물 보기" → `.result .sample-badge`.

- [ ] **Step 1: `verify-flow.py` 4부 추가** — Run: `python3 tools/verify-flow.py /tmp/vf --idle` / Expected: exit 1 ("샘플 인화물 보기" 없음)

- [ ] **Step 2: `AdminScreen.tsx`·`App.tsx` 수정**

- [ ] **Step 3: CSS 정리** — `styles.css`를 위에서 아래로 읽어 어느 화면도 쓰지 않는 선택자(옛 `.welcome-*`, `.hero-*`, `.start-block`, `.frame-row`, `.more-card`, `.layout-list`, `.layout-card`, `.pick-mark`, `.select`, `.screen-head` 중 안 쓰는 것)를 지운다. 기준: `grep -rn "className" src | grep -o '"[^"]*"'`에 나오지 않는 클래스.

- [ ] **Step 4: README** — "들어 있는 것"의 첫 줄을 "찍기 버튼 하나 → 모양 → 프레임 → 프레임 안에서 촬영(여분 포함) → 여분과 바꾸기 → 인쇄"로, "구조"의 `screens/` 줄을 "시작 · 모양 · 프레임 · 촬영 · 바꾸기 · 완성 · 관리자"로. 실행 절에 `npm test`와 `python3 tools/verify-flow.py <폴더>` 한 줄씩.

- [ ] **Step 5: 최종 검증** — Run: `npm run build && npm test && for v in "" --skip --deny --band --exact --idle; do python3 tools/verify-flow.py /tmp/vf $v || exit 1; done` 그리고 `"<impeccable 스크립트>" detect --json src/screens src/components src/App.tsx index.html` / Expected: 전부 exit 0, 검출기 `[]`. 스크린샷 전부를 열어 Global Constraints 의 "한 화면에 들어간다"를 눈으로 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add -A src README.md tools/verify-flow.py
git commit -m "관리자: 보정 선택·샘플 보기 이동, CSS 정리, README"
```
