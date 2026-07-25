import { useState } from "react";
import type { Frame, Layout } from "../types";
import { Icon } from "../components/Icon";
import { FrameSwatch } from "../components/Previews";
import type { Clip } from "../lib/timelapse";

type Props = {
  composite: string;
  layout: Layout;
  layouts: Layout[];
  frames: Frame[];
  frameKey: string;
  caption: string;
  copies: number;
  clip: Clip | null;
  /** 타임랩스를 만들고 있는 중인지 — 촬영을 거친 경우에만 true 입니다. */
  clipPending: boolean;
  /** 다시 꾸미는 중(재합성) */
  busy: boolean;
  onFrame: (key: string) => void;
  onLayout: (key: string) => void;
  onCaption: (value: string) => void;
  onPrint: () => void;
  onShare: () => void;
  onSaveClip: () => void;
  onRestart: () => void;
};

export function ResultScreen({
  composite,
  layout,
  layouts,
  frames,
  frameKey,
  caption,
  copies,
  clip,
  clipPending,
  busy,
  onFrame,
  onLayout,
  onCaption,
  onPrint,
  onShare,
  onSaveClip,
  onRestart,
}: Props) {
  const [dressing, setDressing] = useState(false);

  return (
    <main className="result no-print">
      <div className="print-mat">
        <img
          className={`composite${busy ? " busy" : ""}`}
          src={composite}
          alt="완성된 사진"
          style={{ aspectRatio: `${layout.paper.w} / ${layout.paper.h}` }}
        />
        {busy && <p className="recomposing">다시 꾸미는 중…</p>}
      </div>

      <div className="result-actions">
        <h2>다 됐어요!</h2>
        <p className="result-hint">
          {layout.paper.w}×{layout.paper.h}인치 용지 기준입니다.
          {layout.tiles.length > 1 && " 인화 후 안내선을 따라 자르면 두 장이 돼요."}
        </p>

        <button className="action-button print-action" onClick={onPrint}>
          <Icon name="print" />
          <span>
            <strong>사진 인쇄하기{copies > 1 ? ` (${copies}장)` : ""}</strong>
            <small>프린터 고르는 창이 열려요</small>
          </span>
        </button>

        <button className="action-button" onClick={onShare}>
          <Icon name="download" />
          <span>
            <strong>iPad에 저장·공유</strong>
            <small>사진 앱 또는 AirDrop</small>
          </span>
        </button>

        {clip && (
          <button className="action-button" onClick={onSaveClip}>
            <Icon name="video" />
            <span>
              <strong>타임랩스 영상 저장</strong>
              <small>촬영하던 순간이 짧은 영상으로</small>
            </span>
          </button>
        )}
        {clipPending && <p className="clip-pending">타임랩스 영상을 만드는 중이에요…</p>}

        {/* 사진은 그대로 두고 겉모습만 바꿉니다 — 다시 찍을 필요가 없습니다. */}
        <button
          className="dress-toggle"
          aria-expanded={dressing}
          onClick={() => setDressing((previous) => !previous)}
        >
          <Icon name="sparkle" /> 다르게 꾸며보기
          <span className="chevron">{dressing ? "▲" : "▼"}</span>
        </button>

        {dressing && (
          <div className="dress-panel">
            <p className="option-note">사진은 그대로예요. 겉모습만 바꿔서 다시 만들어 드려요.</p>

            <h3>프레임</h3>
            <div className="chip-list tight">
              {frames.map((item) => (
                <button
                  key={item.key}
                  className={`frame-chip${item.key === frameKey ? " selected" : ""}`}
                  aria-pressed={item.key === frameKey}
                  onClick={() => onFrame(item.key)}
                >
                  <FrameSwatch frame={item} />
                  <span>
                    <strong>{item.name}</strong>
                  </span>
                </button>
              ))}
            </div>

            <h3>모양</h3>
            <div className="chip-list tight">
              {layouts.map((item) => (
                <button
                  key={item.key}
                  className={`pill${item.key === layout.key ? " selected" : ""}`}
                  aria-pressed={item.key === layout.key}
                  onClick={() => onLayout(item.key)}
                >
                  {item.name}
                </button>
              ))}
            </div>

            <h3>사진 아래 문구</h3>
            <input
              className="text-field"
              value={caption}
              maxLength={20}
              onChange={(event) => onCaption(event.target.value)}
              placeholder="오늘, 참 좋다"
            />
          </div>
        )}

        <button className="ghost-button" onClick={onRestart}>
          <Icon name="redo" /> 새로 찍기
        </button>
      </div>
    </main>
  );
}
