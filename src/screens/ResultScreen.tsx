import { useState } from "react";
import type { FilterDef, Frame, Layout } from "../types";
import { Icon } from "../components/Icon";
import { FilterChips } from "../components/FilterChips";
import { FrameSwatch } from "../components/Previews";
import type { Clip } from "../lib/timelapse";

type Props = {
  composite: string;
  layout: Layout;
  layouts: Layout[];
  frames: Frame[];
  frameKey: string;
  /** 완성 화면에서 바꿀 수 있는 필터. 비어 있으면(샘플) 필터 줄을 숨깁니다. */
  filters: FilterDef[];
  filterKey: string;
  caption: string;
  copies: number;
  clip: Clip | null;
  /** 타임랩스를 만들고 있는 중인지 — 촬영을 거친 경우에만 true 입니다. */
  clipPending: boolean;
  /** 다시 꾸미는 중(재합성) */
  busy: boolean;
  /** 인쇄 창을 한 번이라도 열었는지 — 끝맺음 문구와 버튼 순서가 바뀝니다. */
  printed: boolean;
  /** 카메라 없이 둘러보는 샘플인지 */
  sample: boolean;
  /** 자동 초기화까지 남은 초(예고 구간에만 값이 있음) */
  secondsLeft: number | null;
  onFrame: (key: string) => void;
  onLayout: (key: string) => void;
  onFilter: (key: string) => void;
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
  filters,
  filterKey,
  caption,
  copies,
  clip,
  clipPending,
  busy,
  printed,
  sample,
  secondsLeft,
  onFrame,
  onLayout,
  onFilter,
  onCaption,
  onPrint,
  onShare,
  onSaveClip,
  onRestart,
}: Props) {
  const [dressing, setDressing] = useState(false);
  const twoTiles = layout.tiles.length > 1;
  const cutHint = twoTiles ? "가운데 선을 따라 자르면 두 장이 돼요." : null;

  const printButton = (
    <button className={`action-button${printed ? "" : " hero-action"}`} onClick={onPrint}>
      <Icon name="print" />
      <span>
        <strong>{printed ? "한 장 더 인쇄" : `인쇄하기${copies > 1 ? ` (${copies}장)` : ""}`}</strong>
        <small>{printed ? "같은 사진을 한 번 더" : "프린터 고르는 창이 열려요"}</small>
      </span>
    </button>
  );

  const shareButton = (
    <button className={`action-button${printed ? " hero-action" : ""}`} onClick={onShare}>
      <Icon name="download" />
      <span>
        <strong>내 폰에 저장</strong>
        <small>사진 앱 또는 AirDrop</small>
      </span>
    </button>
  );

  return (
    <main className="result no-print">
      <div className="print-mat">
        <img
          className={`composite${busy ? " busy" : ""}`}
          src={composite}
          alt="완성된 사진"
          style={{ aspectRatio: `${layout.paper.w} / ${layout.paper.h}` }}
        />
        {busy && (
          <p className="recomposing" role="status">
            다시 꾸미는 중…
          </p>
        )}
      </div>

      <div className="result-actions">
        <h2>
          다 됐어요!{sample && <span className="sample-badge">샘플이에요</span>}
        </h2>

        {/* 끝맺음은 앱이 맡습니다 — 인쇄 창이 닫힌 뒤에도 화면이 그대로면 손님은 또 누릅니다. */}
        {printed ? (
          <div className="done-toast" role="status">
            <span className="done-mark" aria-hidden="true">
              ✓
            </span>
            <span>
              인쇄로 보냈어요. 프린터 옆에서 받아가세요.
              {cutHint && <small>{cutHint}</small>}
            </span>
          </div>
        ) : (
          cutHint && <p className="result-hint">{cutHint}</p>
        )}

        {printed ? shareButton : printButton}
        {printed ? printButton : shareButton}

        {clip && (
          <button className="action-button" onClick={onSaveClip}>
            <Icon name="video" />
            <span>
              <strong>타임랩스 영상 저장</strong>
              <small>촬영하던 순간이 짧은 영상으로</small>
            </span>
          </button>
        )}
        {clipPending && (
          <p className="clip-pending" role="status">
            타임랩스 영상을 만드는 중이에요…
          </p>
        )}

        {/* 보조 동작은 작은 알약 한 줄 — 크기 셋(인쇄 > 저장 > 보조)으로 무엇을 먼저 누르는지 보입니다.
            꾸미기는 사진은 그대로 두고 겉모습만 바꿉니다 — 다시 찍을 필요가 없습니다. */}
        <div className="result-minor">
          <button
            className="pill-button dress-toggle"
            aria-expanded={dressing}
            onClick={() => setDressing((previous) => !previous)}
          >
            <Icon name="sparkle" /> 필터·문구·프레임 바꾸기
          </button>
          <button className="pill-button restart" onClick={onRestart}>
            <Icon name="redo" /> 처음부터 다시
          </button>
        </div>

        {/* 조용히 사라지던 90초 — 마지막 구간엔 남은 시간을 보여주고 누르면 계속되게 합니다. */}
        {secondsLeft !== null && (
          <div className="idle-note" role="status">
            <span>{secondsLeft}초 뒤 처음 화면으로 돌아가요</span>
            <span className="idle-bar" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (secondsLeft / 20) * 100)}%` }} />
            </span>
            <span>화면을 누르면 계속</span>
          </div>
        )}
      </div>

      {/* 꾸미기는 아래에서 올라오는 시트 — 오른쪽 열이 길어져 사진이 밀려나지 않습니다. */}
      {dressing && (
        <div className="dress-sheet" role="dialog" aria-label="다르게 꾸며보기">
          <div className="sheet-head">
            <p className="option-note">다시 찍지 않아도 돼요. 필터와 겉모습만 바꿔서 다시 만들어 드려요.</p>
            <button className="ghost-button" onClick={() => setDressing(false)}>
              닫기
            </button>
          </div>

          {filters.length > 0 && (
            <>
              <h3>필터</h3>
              <FilterChips filters={filters} value={filterKey} onChange={onFilter} />
            </>
          )}

          <h3>프레임</h3>
          <div className="chip-row">
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

          <div className="sheet-row">
            <div>
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
            </div>
            <div className="sheet-caption">
              <h3>사진 아래 문구</h3>
              <input
                className="text-field"
                value={caption}
                maxLength={20}
                onChange={(event) => onCaption(event.target.value)}
                placeholder="오늘, 참 좋다"
                aria-label="사진 아래 문구"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
