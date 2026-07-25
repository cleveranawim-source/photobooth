import type { Layout } from "../types";
import { Icon } from "../components/Icon";
import type { Clip } from "../lib/timelapse";

type Props = {
  composite: string;
  layout: Layout;
  copies: number;
  clip: Clip | null;
  /** 타임랩스를 만들고 있는 중인지 — 촬영을 거친 경우에만 true 입니다. */
  clipPending: boolean;
  onPrint: () => void;
  onShare: () => void;
  onSaveClip: () => void;
  onRestart: () => void;
};

export function ResultScreen({
  composite,
  layout,
  copies,
  clip,
  clipPending,
  onPrint,
  onShare,
  onSaveClip,
  onRestart,
}: Props) {
  return (
    <main className="result no-print">
      <div className="print-mat">
        <img
          className="composite"
          src={composite}
          alt="완성된 사진"
          style={{ aspectRatio: `${layout.paper.w} / ${layout.paper.h}` }}
        />
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
            <small>AirPrint 프린터 선택</small>
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

        <button className="ghost-button" onClick={onRestart}>
          <Icon name="redo" /> 새로 찍기
        </button>
      </div>
    </main>
  );
}
