import { useState } from "react";
import type { Frame, Layout, LayoutCell } from "../types";
import { Icon } from "../components/Icon";
import { PrintStage } from "../components/PrintStage";

type Props = {
  layout: Layout;
  frame: Frame;
  /** 지금 순서대로 칸이 채워진 조각 그림 */
  tileSrc: string | null;
  slots: LayoutCell[];
  /** order 대로 재배열된 사진 — slots 와 같은 인덱스 */
  shots: (string | undefined)[];
  /** 고른 칸(남색 테두리). 다음에 누르는 칸과 자리를 바꿉니다. */
  selected: number | null;
  busy: boolean;
  onTap: (index: number) => void;
  onDone: () => void;
};

/**
 * 5 바꾸기 — 여분이 있을 때만. 먼저 찍은 넷이 이미 칸에 들어가 있고, 마음에 안 드는 칸을
 * 누른 뒤 여분 사진을 누르면 둘이 자리를 바꿉니다. 아무것도 안 바꾸고 바로 넘어가도 됩니다.
 */
export function SwapScreen({ layout, frame, tileSrc, slots, shots, selected, busy, onTap, onDone }: Props) {
  // 길게 누르면 크게 보기 — 어느 컷이 잘 나왔는지 판단하려면 크게 볼 수 있어야 합니다.
  const [zoomed, setZoomed] = useState<number | null>(null);
  const cellCount = layout.cells.length;
  const extras = slots.length - cellCount;

  return (
    <main className="swap no-print">
      <div className="swap-stage">
        <PrintStage
          layout={layout}
          frame={frame}
          tileSrc={tileSrc}
          slots={slots}
          shots={shots}
          activeIndex={null}
          selectedIndex={selected}
          onSlotTap={onTap}
          onSlotHold={setZoomed}
        />
      </div>

      <div className="swap-side">
        <h2 className="ask">
          마음에 안 드는 칸이 있나요?
          <small>
            칸을 누르고 여분 사진을 누르면 바뀌어요. 길게 누르면 크게 봐요.
          </small>
        </h2>
        <p className="swap-hint" aria-live="polite">
          {selected === null
            ? `여분이 ${extras}장 있어요. 그대로 두어도 돼요.`
            : selected < cellCount
              ? `${selected + 1}번째 칸을 골랐어요. 바꿀 사진을 눌러요.`
              : `여분 ${selected - cellCount + 1}을 골랐어요. 들어갈 칸을 눌러요.`}
        </p>
        <button className="primary-button shoot" onClick={onDone} disabled={busy}>
          <Icon name="check" />
          {busy ? "만드는 중" : "이걸로 할래요"}
        </button>
      </div>

      {zoomed !== null && shots[zoomed] && (
        <div className="zoom-overlay" role="dialog" aria-modal="true" onClick={() => setZoomed(null)}>
          <img
            src={shots[zoomed]}
            alt={zoomed < cellCount ? `${zoomed + 1}번째 칸 크게 보기` : `여분 ${zoomed - cellCount + 1} 크게 보기`}
          />
          <div className="zoom-actions" onClick={(event) => event.stopPropagation()}>
            <button className="ghost-button" onClick={() => setZoomed(null)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
