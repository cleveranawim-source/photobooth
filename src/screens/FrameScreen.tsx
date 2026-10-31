import type { Frame, Layout } from "../types";
import { PrintPreview } from "../components/Previews";
import { framePreviewKey } from "../hooks/usePrintPreviews";

type Props = {
  /** 행사(로고) 프레임이 앞에 오도록 정렬된 목록 */
  frames: Frame[];
  /** 앞 화면에서 고른 모양 — 미리보기를 이 모양으로 그립니다. */
  layout: Layout;
  previews: Record<string, string>;
  /** 카메라를 못 켠 이유. 프레임을 누르는 순간 카메라 권한을 묻기 때문에 여기서 보여줍니다. */
  error: string | null;
  onPick: (key: string) => void;
};

/** 3 프레임 — 큰 카드를 옆으로 넘기며 고릅니다. 누르면 바로 촬영 화면입니다. */
export function FrameScreen({ frames, layout, previews, error, onPick }: Props) {
  return (
    <main className="frame-screen no-print">
      <h2 className="ask">
        어떤 프레임에 담을까요?
        <small>옆으로 넘기며 골라요</small>
      </h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="frame-scroll">
        {frames.map((item) => (
          <button
            key={item.key}
            className={`frame-pick${item.logo ? " event" : ""}`}
            onClick={() => onPick(item.key)}
          >
            {item.logo && <span className="event-badge">행사</span>}
            <span className="frame-pick-thumb">
              <PrintPreview
                layout={layout}
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
    </main>
  );
}
