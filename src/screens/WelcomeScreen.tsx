import { useRef } from "react";
import type { Frame, Layout } from "../types";
import { Icon } from "../components/Icon";
import { PrintPreview } from "../components/Previews";
import { framePreviewKey, layoutPreviewKey } from "../hooks/usePrintPreviews";

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
  onFrame: (key: string) => void;
  onLayout: (key: string) => void;
  onCaption: (value: string) => void;
  onStart: () => void;
  onSample: () => void;
  onAdmin: () => void;
};

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
            ? `${shootCount}장을 찍어 인화합니다.`
            : `${shootCount}장을 찍고 그중 ${needed}장을 골라 인화합니다.`}{" "}
          사진은 이 기기 안에서만 처리되고 어디로도 전송되지 않아요.
        </p>
      </div>

      {/* 오른쪽 — 고른 다음 맨 아래 버튼으로 시작합니다(고르기 → 시작 순서). */}
      <div className="welcome-options">
        <section className="option-group">
          <h2>
            <Icon name="grid" /> 어떤 모양으로 찍을까요?
          </h2>
          <div className="layout-list">
            {layouts.map((layout) => (
              <button
                key={layout.key}
                className={`layout-card${layout.key === layoutKey ? " selected" : ""}`}
                aria-pressed={layout.key === layoutKey}
                onClick={() => onLayout(layout.key)}
              >
                <span className="thumb-slot">
                  <PrintPreview
                    layout={layout}
                    frame={frame}
                    src={previews[layoutPreviewKey(layout.key)]}
                    alt={`${layout.name} 미리보기`}
                  />
                </span>
                <strong>{layout.name}</strong>
                <small>{layout.hint}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="option-group">
          <h2>
            <Icon name="sparkle" /> 어떤 프레임에 담을까요?
          </h2>
          <p className="option-note">인쇄되는 사진의 디자인이에요. 앱 화면 색과는 상관없습니다.</p>
          <div className="frame-list">
            {frames.map((item) => (
              <button
                key={item.key}
                className={`frame-card${item.key === frameKey ? " selected" : ""}`}
                aria-pressed={item.key === frameKey}
                onClick={() => onFrame(item.key)}
              >
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
          </div>
        </section>

        <section className="option-group">
          <h2>사진 아래 문구</h2>
          <input
            className="text-field"
            value={caption}
            maxLength={20}
            onChange={(event) => onCaption(event.target.value)}
            placeholder="오늘, 참 좋다"
          />
          <p className="option-note">보정 효과는 촬영 화면에서 얼굴을 보며 고를 수 있어요.</p>
        </section>

        {/* 다 고른 뒤 누르는 자리. 세로 화면에서 스크롤이 길어져도 바닥에 붙어 따라옵니다. */}
        <div className="start-bar">
          <button className="primary-button" onClick={onStart}>
            <Icon name="camera" />
            촬영 시작
          </button>
          <button className="text-link" onClick={onSample}>
            카메라 없이 샘플로 둘러보기
          </button>
        </div>
      </div>
    </main>
  );
}
