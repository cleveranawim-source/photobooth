import { useRef, type RefObject } from "react";
import type { CamEdge, FilmGrade, FilterDef } from "../types";
import { Icon } from "../components/Icon";
import { useFilmPreview } from "../hooks/useFilmPreview";
import { MAX_ZOOM } from "../lib/canvas";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  glowVideoRef: RefObject<HTMLVideoElement | null>;
  previewFilter: string;
  glowFilter: string;
  glowStrength: number;
  ratio: number;
  camEdge: CamEdge;
  countdown: number | null;
  shotIndex: number;
  total: number;
  shooting: boolean;
  ready: boolean;
  status: string;
  flash: boolean;
  resolution: string | null;
  /** 지금까지 찍힌 사진들 — 아래에 하나씩 쌓여 진행이 눈에 보이게 합니다. */
  shots: string[];
  filters: FilterDef[];
  filterKey: string;
  /** 지금 고른 필터의 필름 계조. 있으면 미리보기를 캔버스로 직접 그립니다. */
  film?: FilmGrade;
  /** 핀치 줌 배율(1 = 기본). 촬영과 공유해야 해서 App 이 들고 있습니다. */
  zoom: number;
  onZoom: (value: number) => void;
  onFilter: (key: string) => void;
  onShoot: () => void;
  onBack: () => void;
};

export function CaptureScreen({
  videoRef,
  glowVideoRef,
  previewFilter,
  glowFilter,
  glowStrength,
  ratio,
  camEdge,
  countdown,
  shotIndex,
  total,
  shooting,
  ready,
  status,
  flash,
  resolution,
  shots,
  filters,
  filterKey,
  film,
  zoom,
  onZoom,
  onFilter,
  onShoot,
  onBack,
}: Props) {
  const filmCanvasRef = useRef<HTMLCanvasElement>(null);
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

  const onPointerDown = (event: React.PointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) pinchStart.current = { distance: spread(), zoom };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const start = pinchStart.current;
    if (pointers.current.size !== 2 || !start || start.distance <= 0) return;
    const next = (start.zoom * spread()) / start.distance;
    onZoom(Math.min(MAX_ZOOM, Math.max(1, Number(next.toFixed(2)))));
  };

  const endPointer = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    // 한 손가락만 남아도 기준 거리는 버립니다 — 안 그러면 다음 핀치가 튑니다.
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  return (
    <main className={`capture no-print edge-${camEdge}`}>
      <div className="stage">
        <div
          className="viewfinder"
          style={
            { "--vf-ratio": `${ratio}`, "--cam-zoom": `${zoom}` } as React.CSSProperties
          }
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
            style={{ filter: previewFilter === "none" ? undefined : previewFilter }}
          />
          {glowStrength > 0 && (
            <video
              ref={glowVideoRef}
              className="cam glow"
              playsInline
              muted
              autoPlay
              aria-hidden="true"
              style={{ filter: glowFilter, opacity: glowStrength * 0.72 }}
            />
          )}
          {/* 필름 계조 미리보기 — 비디오 위를 덮습니다(픽셀 안에서 이미 좌우 반전돼 있어
              .cam 처럼 CSS 로 뒤집지 않습니다). */}
          {film && <canvas ref={filmCanvasRef} className="cam-canvas" aria-hidden="true" />}
          {flash && <div className="flash" />}
          {countdown !== null && (
            // key 를 숫자로 두면 매 초 다시 그려져 링 애니메이션이 처음부터 돕니다.
            <div key={countdown} className={`countdown${countdown === 1 ? " last" : ""}`}>
              <svg className="countdown-ring" viewBox="0 0 100 100" aria-hidden="true">
                <circle className="ring-track" cx="50" cy="50" r="45" />
                <circle className="ring-fill" cx="50" cy="50" r="45" />
              </svg>
              <span>{countdown}</span>
            </div>
          )}
          {shooting && <div className="look-here">📷 여기를 봐요!</div>}
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

        {/* 찍은 사진이 하나씩 채워집니다 — 점만 켜지는 것보다 진행이 훨씬 잘 보입니다. */}
        <div className="shot-tray" aria-label={`${total}장 중 ${shotIndex}장 촬영`}>
          {Array.from({ length: total }, (_, index) => (
            <div
              key={index}
              className={`tray-slot${shots[index] ? " filled" : ""}`}
              style={{ aspectRatio: `${ratio}` }}
            >
              {shots[index] ? <img src={shots[index]} alt={`${index + 1}번째 사진`} /> : index + 1}
            </div>
          ))}
        </div>

        <p className="status">{!ready && !shooting ? "카메라를 준비하는 중이에요…" : status}</p>
      </div>

      {/* 보정은 이름만 봐선 알 수 없어, 내 얼굴에 적용된 걸 보며 고르게 합니다. */}
      <div className="filter-bar">
        {filters.map((item) => (
          <button
            key={item.key}
            className={`pill${item.key === filterKey ? " selected" : ""}`}
            aria-pressed={item.key === filterKey}
            disabled={shooting}
            onClick={() => onFilter(item.key)}
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className="capture-actions">
        <button className="ghost-button" onClick={onBack} disabled={shooting}>
          <Icon name="back" /> 처음으로
        </button>
        <button className="primary-button" onClick={onShoot} disabled={!ready || shooting}>
          <Icon name="camera" />
          {shooting ? "촬영 중" : `${total}장 찍기`}
        </button>
        {resolution && <span className="cam-res">카메라 {resolution}</span>}
      </div>
    </main>
  );
}
