import { useRef } from "react";
import type { Frame, FilterDef, Layout } from "../types";
import { Icon } from "../components/Icon";
import { PrintPreview } from "../components/Previews";
import { shotsNeeded } from "../config/layouts";
import { framePreviewKey, layoutPreviewKey } from "../hooks/usePrintPreviews";

type Props = {
  title: string;
  tagline: string;
  frame: Frame;
  frames: Frame[];
  layouts: Layout[];
  filters: FilterDef[];
  frameKey: string;
  layoutKey: string;
  filterKey: string;
  caption: string;
  shootCount: number;
  /** 실제 합성기로 만든 작은 인화물 미리보기 (usePrintPreviews) */
  previews: Record<string, string>;
  onFrame: (key: string) => void;
  onLayout: (key: string) => void;
  onFilter: (key: string) => void;
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
  filters,
  frameKey,
  layoutKey,
  filterKey,
  caption,
  shootCount,
  previews,
  onFrame,
  onLayout,
  onFilter,
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
  const needed = shotsNeeded(activeLayout);

  return (
    <main className="welcome no-print">
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
        <p className="welcome-lead">
          {shootCount}장을 찍고 그중 {needed}장을 골라 인화합니다. 사진은 이 기기 안에서만
          처리되고 어디로도 전송되지 않아요.
        </p>
        <button className="primary-button" onClick={onStart}>
          <Icon name="camera" />
          촬영 시작
        </button>
        <button className="ghost-button" onClick={onSample}>
          카메라 없이 샘플로 둘러보기
        </button>
      </div>

      <div className="welcome-options">
        <section className="option-group">
          <h2>
            <Icon name="grid" /> 레이아웃
          </h2>
          <div className="layout-list">
            {layouts.map((layout) => (
              <button
                key={layout.key}
                className={`layout-card${layout.key === layoutKey ? " selected" : ""}`}
                aria-pressed={layout.key === layoutKey}
                onClick={() => onLayout(layout.key)}
              >
                <PrintPreview
                  layout={layout}
                  frame={frame}
                  src={previews[layoutPreviewKey(layout.key)]}
                  alt={`${layout.name} 미리보기`}
                />
                <strong>{layout.name}</strong>
                <small>{layout.hint}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="option-group">
          <h2>
            <Icon name="sparkle" /> 인화 프레임
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
                {/* 고른 레이아웃을 그 프레임으로 합성해, 인화물이 어떻게 나올지 그대로 보여줍니다. */}
                <PrintPreview
                  layout={activeLayout}
                  frame={item}
                  src={previews[framePreviewKey(item.key)]}
                  alt={`${item.name} 미리보기`}
                />
                <strong>{item.name}</strong>
                <small>{item.hint}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="option-group">
          <h2>사진 보정</h2>
          <div className="chip-list tight">
            {filters.map((item) => (
              <button
                key={item.key}
                className={`pill${item.key === filterKey ? " selected" : ""}`}
                aria-pressed={item.key === filterKey}
                onClick={() => onFilter(item.key)}
              >
                {item.name}
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
        </section>
      </div>
    </main>
  );
}
