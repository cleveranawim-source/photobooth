import { useRef, type RefObject } from "react";
import type { CamEdge, FilmGrade, FilterDef, Frame, Layout, LayoutCell } from "../types";
import { Icon } from "../components/Icon";
import { PrintStage } from "../components/PrintStage";
import { FilterChips } from "../components/FilterChips";
import { useFilmPreview } from "../hooks/useFilmPreview";
import { MAX_ZOOM } from "../lib/canvas";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  glowVideoRef: RefObject<HTMLVideoElement | null>;
  previewFilter: string;
  glowFilter: string;
  glowStrength: number;
  layout: Layout;
  frame: Frame;
  /** 조각 그림(useTileImage). 찍은 칸은 이미 사진이 들어가 있습니다. */
  tileSrc: string | null;
  /** 촬영 칸 전부(captureSlots). 조각 칸 수를 넘는 것은 여분. */
  slots: LayoutCell[];
  /** 지금까지 찍힌 사진(슬롯 순서) */
  shots: string[];
  /** 다음에 찍힐 칸 — 카메라가 이 칸 안에 보입니다. */
  activeIndex: number;
  camEdge: CamEdge;
  countdown: number | null;
  shotIndex: number;
  total: number;
  shooting: boolean;
  ready: boolean;
  status: string;
  flash: boolean;
  filters: FilterDef[];
  filterKey: string;
  /** 지금 고른 필터의 필름 계조. 있으면 미리보기를 캔버스로 직접 그립니다. */
  film?: FilmGrade;
  /** 핀치 줌 배율(1 = 기본). 촬영과 공유해야 해서 App 이 들고 있습니다. */
  zoom: number;
  /** 인화 화질이 안 깎이는 줌 상한. 1 이면 여유가 없다는 뜻이라 핀치를 막습니다. */
  maxZoom: number;
  onZoom: (value: number) => void;
  onFilter: (key: string) => void;
  onShoot: () => void;
};

/**
 * 4 촬영 — 화면이 곧 인화물. 고른 프레임 조각이 크게 있고, 다음 빈 칸 안에 내 얼굴이
 * 실시간으로 비칩니다. 찍히면 그 칸이 사진으로 굳고(조각 그림이 다시 합성됨) 다음 칸이
 * 활성화됩니다. 칸 수를 넘는 여분은 조각 바깥 칸에 이어서 찍힙니다.
 */
export function CaptureScreen({
  videoRef,
  glowVideoRef,
  previewFilter,
  glowFilter,
  glowStrength,
  layout,
  frame,
  tileSrc,
  slots,
  shots,
  activeIndex,
  camEdge,
  countdown,
  shotIndex,
  total,
  shooting,
  ready,
  status,
  flash,
  filters,
  filterKey,
  film,
  zoom,
  maxZoom,
  onZoom,
  onFilter,
  onShoot,
}: Props) {
  const filmCanvasRef = useRef<HTMLCanvasElement>(null);
  const active = slots[Math.min(activeIndex, slots.length - 1)];
  const cellCount = layout.cells.length;
  // 모든 칸은 같은 크기라 비율도 하나입니다 — 촬영 크롭(centerCrop)과 같은 값.
  const ratio = active.w / active.h;
  useFilmPreview(videoRef, filmCanvasRef, film, ratio, zoom);

  // ── 핀치 줌 ────────────────────────────────────────────────────────
  // 포인터 이벤트로 직접 셉니다. Safari 의 gesturechange 는 iOS 전용이라 아이패드에서만 돌고,
  // 손님이 노트북·안드로이드로 열어볼 수도 있어 표준 이벤트가 안전합니다.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);

  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  // 여유가 없는 레이아웃·카메라 조합에서는 핀치 자체를 받지 않습니다.
  // 당길 수는 있는데 인화가 흐려지는 것보다, 아예 안 당겨지는 편이 정직합니다.
  const canZoom = maxZoom > 1;

  const onPointerDown = (event: React.PointerEvent) => {
    if (!canZoom) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) pinchStart.current = { distance: spread(), zoom };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!canZoom || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const start = pinchStart.current;
    if (pointers.current.size !== 2 || !start || start.distance <= 0) return;
    const next = (start.zoom * spread()) / start.distance;
    const ceiling = Math.min(MAX_ZOOM, maxZoom);
    onZoom(Math.min(ceiling, Math.max(1, Number(next.toFixed(2)))));
  };

  const endPointer = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    // 한 손가락만 남아도 기준 거리는 버립니다 — 안 그러면 다음 핀치가 튑니다.
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  // 카운트다운은 활성 칸 안, 칸 높이의 40%. 조각 단위라 배율과 함께 줄어듭니다.
  const countdownSize = Math.round(active.h * 0.4);

  return (
    <main className={`capture no-print edge-${camEdge}`}>
      <div className="capture-stage">
        <PrintStage
          layout={layout}
          frame={frame}
          tileSrc={tileSrc}
          slots={slots}
          shots={slots.map((_, index) => shots[index])}
          activeIndex={activeIndex}
        >
          <div
            className="cell-touch"
            // 핀치를 우리가 처리할 때만 브라우저 기본 동작을 막습니다.
            style={{ touchAction: canZoom ? "none" : undefined }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onPointerLeave={endPointer}
          >
            <video
              ref={videoRef}
              className="cam"
              playsInline
              muted
              autoPlay
              style={{
                filter: previewFilter === "none" ? undefined : previewFilter,
                ["--cam-zoom" as string]: `${zoom}`,
              }}
            />
            {glowStrength > 0 && (
              <video
                ref={glowVideoRef}
                className="cam glow"
                playsInline
                muted
                autoPlay
                aria-hidden="true"
                style={{
                  filter: glowFilter,
                  opacity: glowStrength * 0.72,
                  ["--cam-zoom" as string]: `${zoom}`,
                }}
              />
            )}
            {/* 필름 계조 미리보기 — 비디오 위를 덮습니다(픽셀 안에서 이미 좌우 반전돼 있어
                .cam 처럼 CSS 로 뒤집지 않습니다). */}
            {film && <canvas ref={filmCanvasRef} className="cam-canvas" aria-hidden="true" />}
            {flash && <div className="flash" />}
            {countdown !== null && (
              // key 를 숫자로 두면 매 초 다시 그려져 링 애니메이션이 처음부터 돕니다.
              <div
                key={countdown}
                className={`countdown in-cell${countdown === 1 ? " last" : ""}`}
                style={{
                  width: countdownSize,
                  height: countdownSize,
                  fontSize: Math.round(countdownSize * 0.48),
                }}
              >
                <svg className="countdown-ring" viewBox="0 0 100 100" aria-hidden="true">
                  <circle className="ring-track" cx="50" cy="50" r="45" />
                  <circle className="ring-fill" cx="50" cy="50" r="45" />
                </svg>
                <span>{countdown}</span>
              </div>
            )}
          </div>
        </PrintStage>

        {/* 렌즈 쪽 **화면** 가장자리(position: fixed)에 붙여 시선을 렌즈로 보냅니다. 무대 열 안에 두면
            가로에서는 무대 가운데(렌즈보다 170px 왼쪽)에 뜹니다. 어느 변인지는 방향별 설정(camEdges). */}
        {shooting && (
          <div className="look-here">
            <Icon name="camera" /> 여기를 봐요!
          </div>
        )}
        {zoom > 1 && (
          // 확대 중일 때만 뜹니다. 되돌릴 방법이 없으면 손님이 당황해서 리셋 버튼을 같이 둡니다.
          <div className="zoom-badge">
            <span>{zoom.toFixed(1)}×</span>
            <button type="button" onClick={() => onZoom(1)}>
              되돌리기
            </button>
          </div>
        )}
      </div>

      <div className="capture-side">
        {/* 준비 중엔 한 줄 설명, 찍는 동안엔 큰 진행 숫자·장수 막대·칸 안내. 두 상태의 높이를 같게
            두어(min-height) 세로 모드에서 찍기를 누르는 순간 무대가 줄며 조각이 튀지 않게 합니다.
            숫자는 찍히는 아이가 아니라 옆에서 기다리는 친구·선생님이 보는 것이라 움직임 없이 둡니다.
            화면 낭독기도 진행을 들을 수 있게 aria-live 를 둡니다. */}
        <div className="capture-head">
          {shooting ? (
            <>
              <p className="shot-count">
                <b>{Math.min(shotIndex + 1, total)}</b>
                <span>/ {total}장</span>
              </p>
              <ol className="shot-bar" aria-hidden="true">
                {slots.map((_, index) => (
                  <li
                    key={index}
                    className={index < shotIndex ? "done" : index === shotIndex ? "now" : undefined}
                    data-extra={index >= cellCount || undefined}
                  />
                ))}
              </ol>
              <p className="status" aria-live="polite">
                {status}
              </p>
            </>
          ) : (
            <p className="status status-lead" aria-live="polite">
              {ready ? status : "카메라를 준비하는 중이에요…"}
            </p>
          )}
        </div>

        {/* 필터는 찍기 전에 고르고(미리보기에 바로 보임), 완성 화면에서 다시 바꿀 수도 있습니다. */}
        <FilterChips filters={filters} value={filterKey} disabled={shooting} onChange={onFilter} />

        <button className="primary-button shoot" onClick={onShoot} disabled={!ready || shooting}>
          <Icon name="camera" />
          {shooting ? "찍는 중이에요" : `${total}장 찍기`}
        </button>
      </div>
    </main>
  );
}
