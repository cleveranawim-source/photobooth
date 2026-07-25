import type { RefObject } from "react";
import type { CamEdge, FilterDef } from "../types";
import { Icon } from "../components/Icon";

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
  onFilter,
  onShoot,
  onBack,
}: Props) {
  return (
    <main className={`capture no-print edge-${camEdge}`}>
      <div className="stage">
        <div className="viewfinder" style={{ aspectRatio: `${ratio}` }}>
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
