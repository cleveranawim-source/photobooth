import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Frame, Layout, LayoutCell } from "../types";
import { contentBounds, slotScreenRect, stageTransform, type Rect } from "../lib/stageGeometry";

/**
 * 인화물 무대 — 촬영·바꾸기 화면이 공유하는 "조각 + 여분 칸 + 활성 칸" 그림.
 *
 * 안의 모든 것은 조각 좌표계(300dpi px)로 놓이고, 바깥 상자(.print-stage-content)에
 * translate+scale 변환 하나만 걸립니다. 그래서 칸 위에 올리는 비디오·카운트다운도
 * 칸 좌표로 그냥 두면 되고, 활성 칸이 바뀔 때 변환만 바뀌어 필름이 감기듯 밀립니다.
 * 변환은 lib/stageGeometry 가 계산합니다(활성 칸 40% 규칙).
 */
export type PrintStageProps = {
  layout: Layout;
  frame: Frame;
  /** useTileImage 결과. 아직 없으면 종이색 사각형을 둡니다. */
  tileSrc: string | null;
  /** captureSlots 결과. index ≥ layout.cells.length 는 여분 칸. */
  slots: LayoutCell[];
  /** slots 와 같은 인덱스의 사진. 여분 칸에만 그립니다 — 조각 칸의 사진은 tileSrc 에 이미 있습니다. */
  shots: (string | undefined)[];
  /** 주황 테두리가 붙고 children 이 들어가는 칸 */
  activeIndex: number | null;
  /** 바꾸기 화면에서 고른 칸 */
  selectedIndex?: number | null;
  /** 있으면 칸마다 누를 수 있는 투명 버튼이 생깁니다. */
  onSlotTap?: (index: number) => void;
  /** 500ms 길게 누름 */
  onSlotHold?: (index: number) => void;
  /**
   * 바꾸기 화면의 표식 — 조각 위에 tile("인쇄할 사진"), 첫 여분 위에 extras("바꿀 수 있는 여분 2장"),
   * 여분마다 번호 배지. 있으면 표식이 걸터앉을 띠(CAPTION_HEADROOM)를 무대 위쪽에 비워 둡니다.
   */
  labels?: { tile: string; extras: string };
  /** 활성 칸 안에 그릴 것. 칸 좌표계 기준 absolute 로 놓으면 됩니다. */
  children?: ReactNode;
};

const HOLD_MS = 500;
/** 표식이 조각 위 가장자리에 반쯤 걸터앉을 자리(화면 px). 표식 높이 ≈ 32px. */
const CAPTION_HEADROOM = 44;
/** 여분 칸 테두리(.stage-extra border) 안쪽으로 배지를 들여 둥근 모서리와 겹치지 않게. */
const BADGE_INSET = 6;

const rectStyle = (slot: LayoutCell, radius: number) => ({
  left: slot.x,
  top: slot.y,
  width: slot.w,
  height: slot.h,
  borderRadius: radius,
});

// 표식·배지는 변환 바깥(화면 px)에 그립니다 — 배율과 무관하게 글자 크기가 같아야 작은 조각에서도 읽힙니다.
const captionStyle = (rect: Rect) => ({ left: rect.x + rect.w / 2, top: rect.y });
const badgeStyle = (rect: Rect) => ({ left: rect.x + BADGE_INSET, top: rect.y + rect.h - BADGE_INSET });

export function PrintStage({
  layout,
  frame,
  tileSrc,
  slots,
  shots,
  activeIndex,
  selectedIndex = null,
  onSlotTap,
  onSlotHold,
  labels,
  children,
}: PrintStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });

  // 무대가 받은 실제 크기 — 뷰포트가 아니라 이 상자 기준으로 40% 규칙을 적용합니다.
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => setArea({ w: element.clientWidth, h: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const bounds = useMemo(() => contentBounds(layout, slots), [layout, slots]);
  const active = activeIndex !== null ? (slots[activeIndex] ?? null) : null;
  const measured = area.w > 0 && area.h > 0;
  // 측정 전에도 내용은 그립니다 — 그래야 활성 칸 안의 <video> 가 첫 커밋에 생겨 App 이
  // 스트림을 붙일 수 있습니다. 보이지는 않게 두고(visibility), 첫 배치는 애니메이션 없이,
  // 그 다음 변화부터 필름처럼 밀립니다(settled).
  const transform = measured
    ? stageTransform(area, bounds, active, 0.4, labels ? CAPTION_HEADROOM : 0)
    : { scale: 1, x: 0, y: 0 };
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (measured && !settled) setSettled(true);
  }, [measured, settled]);
  const cellCount = layout.cells.length;

  // 길게 누르면 크게 보기. 길게 누른 뒤 손을 떼며 생기는 click 은 선택으로 치지 않습니다.
  const holdTimer = useRef(0);
  const held = useRef(false);
  const startHold = (index: number) => {
    if (!onSlotHold) return;
    held.current = false;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      held.current = true;
      onSlotHold(index);
    }, HOLD_MS);
  };
  const cancelHold = () => window.clearTimeout(holdTimer.current);
  const tap = (index: number) => {
    if (held.current) {
      held.current = false;
      return;
    }
    onSlotTap?.(index);
  };

  const slotLabel = (index: number) =>
    index < cellCount ? `${index + 1}번째 칸` : `여분 ${index - cellCount + 1}`;

  return (
    <div ref={containerRef} className="print-stage">
      <div
        className={`print-stage-content${settled ? " settled" : ""}`}
        style={{
          width: bounds.w,
          height: bounds.h,
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          visibility: measured ? undefined : "hidden",
        }}
      >
          {tileSrc ? (
            <img
              className="stage-tile"
              src={tileSrc}
              alt=""
              width={layout.tile.w}
              height={layout.tile.h}
              draggable={false}
            />
          ) : (
            <div
              className="stage-tile"
              style={{ width: layout.tile.w, height: layout.tile.h, background: frame.paper }}
            />
          )}

          {slots.map(
            (slot, index) =>
              index >= cellCount && (
                <div
                  key={`extra-${index}`}
                  className="stage-extra"
                  style={{
                    ...rectStyle(slot, frame.photoRadius),
                    background: frame.mat,
                    color: frame.sub,
                    fontSize: Math.round(slot.h * 0.12),
                  }}
                >
                  {shots[index] ? (
                    <img src={shots[index]} alt={slotLabel(index)} draggable={false} />
                  ) : (
                    <span>{slotLabel(index)}</span>
                  )}
                </div>
              ),
          )}

          {onSlotTap &&
            slots.map((slot, index) => (
              <button
                key={`hit-${index}`}
                type="button"
                className={`stage-hit${selectedIndex === index ? " stage-selected" : ""}`}
                style={rectStyle(slot, frame.photoRadius)}
                aria-label={slotLabel(index)}
                aria-pressed={selectedIndex === index}
                onClick={() => tap(index)}
                onPointerDown={() => startHold(index)}
                onPointerUp={cancelHold}
                onPointerCancel={cancelHold}
                onPointerLeave={cancelHold}
                onContextMenu={(event) => event.preventDefault()}
              />
            ))}

          {active && (
            <div key="active" className="stage-active" style={rectStyle(active, frame.photoRadius)}>
              {children}
            </div>
          )}
      </div>

      {labels && measured && (
        <>
          <span
            className="stage-caption print"
            style={captionStyle(slotScreenRect(transform, { x: 0, y: 0, w: layout.tile.w, h: layout.tile.h }))}
          >
            {labels.tile}
          </span>
          {slots[cellCount] && (
            <span className="stage-caption extra" style={captionStyle(slotScreenRect(transform, slots[cellCount]))}>
              {labels.extras}
            </span>
          )}
          {slots.map(
            (slot, index) =>
              index >= cellCount && (
                <span key={`badge-${index}`} className="stage-badge" style={badgeStyle(slotScreenRect(transform, slot))}>
                  {slotLabel(index)}
                </span>
              ),
          )}
        </>
      )}
    </div>
  );
}
