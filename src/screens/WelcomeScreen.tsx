import { useRef, useState } from "react";
import type { Frame, Layout } from "../types";
import { Icon } from "../components/Icon";
import { LayoutShape, PrintPreview } from "../components/Previews";
import { framePreviewKey } from "../hooks/usePrintPreviews";

type Props = {
  title: string;
  tagline: string;
  frame: Frame;
  frames: Frame[];
  layouts: Layout[];
  frameKey: string;
  layoutKey: string;
  caption: string;
  shootCount: number;
  needed: number;
  /** 실제 합성기로 만든 작은 인화물 미리보기 (usePrintPreviews) */
  previews: Record<string, string>;
  /** 카메라를 못 켠 이유 — 시작 버튼 바로 옆에 띄웁니다. */
  error: string | null;
  onFrame: (key: string) => void;
  onLayout: (key: string) => void;
  onCaption: (value: string) => void;
  onStart: () => void;
  onSample: () => void;
  onAdmin: () => void;
};

/** 처음에 보여줄 프레임 수. 이보다 많으면 "더 보기" 카드로 접습니다(청킹). */
const COLLAPSED = 6;

export function WelcomeScreen({
  title,
  tagline,
  frame,
  frames,
  layouts,
  frameKey,
  layoutKey,
  caption,
  shootCount,
  needed,
  previews,
  error,
  onFrame,
  onLayout,
  onCaption,
  onStart,
  onSample,
  onAdmin,
}: Props) {
  // 관리자 화면은 제목을 2초 길게 눌러 엽니다 — 손님 눈에 띄지 않게.
  const pressTimer = useRef(0);
  const holdStart = () => {
    window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(onAdmin, 2000);
  };
  const holdEnd = () => window.clearTimeout(pressTimer.current);

  const activeLayout = layouts.find((layout) => layout.key === layoutKey) ?? layouts[0];

  // 행사 로고가 든 프레임이 맨 앞 — 오늘 행사용으로 켜 둔 것이 손님 눈에 먼저 들어오게.
  const ordered = [...frames.filter((item) => item.logo), ...frames.filter((item) => !item.logo)];
  const [showAll, setShowAll] = useState(false);
  const selectedIndex = ordered.findIndex((item) => item.key === frameKey);
  const collapsible = ordered.length > COLLAPSED + 1;
  const expanded = showAll || !collapsible || selectedIndex >= COLLAPSED;
  const visibleFrames = expanded ? ordered : ordered.slice(0, COLLAPSED);

  return (
    <main className="welcome no-print">
      {/* 왼쪽 — 지금 고른 조합이 어떻게 인화되는지 큰 그림으로 보여줍니다. */}
      <div className="welcome-hero">
        <h1
          className="brand"
          onPointerDown={holdStart}
          onPointerUp={holdEnd}
          onPointerLeave={holdEnd}
          onContextMenu={(event) => event.preventDefault()}
        >
          {title}
        </h1>
        <p className="brand-tagline">{tagline}</p>

        <div className="hero-preview">
          <PrintPreview
            layout={activeLayout}
            frame={frame}
            src={previews[framePreviewKey(frameKey)]}
            alt="지금 고른 조합의 인화물 미리보기"
          />
        </div>

        <p className="welcome-lead">
          {shootCount === needed
            ? `${shootCount}장을 찍어 인화해요.`
            : `${shootCount}장을 찍고 그중 ${needed}장을 골라 인화해요.`}{" "}
          사진은 이 iPad 안에서만 처리돼요.
        </p>
      </div>

      {/* 오른쪽 — 고르기. 가로에서는 시작 버튼이 왼쪽 열 아래에 있어 목록을 덮지 않습니다. */}
      <div className="welcome-options">
        <section className="option-group">
          <h2>어떤 모양으로 찍을까요?</h2>
          <div className="layout-list">
            {layouts.map((layout) => (
              <button
                key={layout.key}
                className={`layout-card${layout.key === layoutKey ? " selected" : ""}`}
                aria-pressed={layout.key === layoutKey}
                onClick={() => onLayout(layout.key)}
              >
                {layout.key === layoutKey && <span className="pick-mark" aria-hidden="true">✓</span>}
                <span className="shape-slot">
                  <LayoutShape layout={layout} />
                </span>
                <strong>{layout.name}</strong>
                <small>{layout.hint}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="option-group">
          <h2>
            어떤 프레임에 담을까요? <small>옆으로 넘겨서 더 보기</small>
          </h2>
          <div className="frame-row">
            {visibleFrames.map((item) => (
              <button
                key={item.key}
                className={`frame-card${item.key === frameKey ? " selected" : ""}${item.logo ? " event" : ""}`}
                aria-pressed={item.key === frameKey}
                onClick={() => onFrame(item.key)}
              >
                {item.key === frameKey && <span className="pick-mark" aria-hidden="true">✓</span>}
                {item.logo && <span className="event-badge">행사</span>}
                <span className="thumb-slot">
                  <PrintPreview
                    layout={activeLayout}
                    frame={item}
                    src={previews[framePreviewKey(item.key)]}
                    alt={`${item.name} 미리보기`}
                  />
                </span>
                <strong>{item.name}</strong>
                <small>{item.hint}</small>
              </button>
            ))}
            {!expanded && (
              <button className="frame-card more-card" onClick={() => setShowAll(true)}>
                <b>+{ordered.length - COLLAPSED}</b>
                프레임 더 보기
              </button>
            )}
          </div>
        </section>

        <section className="option-group">
          <h2>
            사진 아래 문구 <small>나중에 바꿔도 돼요</small>
          </h2>
          <input
            className="text-field"
            value={caption}
            maxLength={20}
            onChange={(event) => onCaption(event.target.value)}
            placeholder="오늘, 참 좋다"
            aria-label="사진 아래 문구"
          />
        </section>
      </div>

      {/* 다 고른 뒤 누르는 자리. 가로에서는 왼쪽 열 아래, 세로에서는 바닥에 붙어 따라옵니다. */}
      <div className="start-block">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" onClick={onStart}>
          <Icon name="camera" />
          촬영 시작
        </button>
        <button className="text-link" onClick={onSample}>
          카메라 없이 샘플로 둘러보기
        </button>
      </div>
    </main>
  );
}
