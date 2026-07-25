import type { RefObject } from "react";
import type { CamEdge } from "../types";
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
            <div className={`countdown${countdown === 1 ? " last" : ""}`}>{countdown}</div>
          )}
          {shooting && <div className="look-here">📷 여기를 봐요!</div>}
        </div>

        <div className="shot-dots" aria-label={`${total}장 중 ${shotIndex}장 촬영`}>
          {Array.from({ length: total }, (_, index) => (
            <span key={index} className={index < shotIndex ? "done" : ""} />
          ))}
        </div>
        {/* 첫 프레임이 들어오기 전에는 촬영 버튼이 잠겨 있으므로, 왜 못 누르는지 알려줍니다. */}
        <p className="status">{!ready && !shooting ? "카메라를 준비하는 중이에요…" : status}</p>
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
