import type { Layout } from "../types";
import { LayoutShape } from "../components/Previews";

type Props = {
  layouts: Layout[];
  /** 누르는 순간 다음 화면으로 — 따로 '다음' 버튼이 없습니다. */
  onPick: (key: string) => void;
};

/** 2 모양 — 넷 중 하나. 사진 칸이 어떻게 놓일지만 실루엣으로 보여줍니다. */
export function ShapeScreen({ layouts, onPick }: Props) {
  return (
    <main className="shape no-print">
      <h2 className="ask">
        어떤 모양으로 찍을까요?
        <small>누르면 바로 다음으로 가요</small>
      </h2>
      <div className="shape-list">
        {layouts.map((layout) => (
          <button key={layout.key} className="shape-card" onClick={() => onPick(layout.key)}>
            <span className="shape-slot">
              <LayoutShape layout={layout} />
            </span>
            <strong>{layout.name}</strong>
            <small>{layout.hint}</small>
          </button>
        ))}
      </div>
    </main>
  );
}
