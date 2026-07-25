import { useState } from "react";
import { Icon } from "../components/Icon";

type Props = {
  shots: string[];
  picked: number[];
  needed: number;
  ratio: number;
  busy: boolean;
  onToggle: (index: number) => void;
  onDone: () => void;
  onRetake: () => void;
};

export function SelectScreen({ shots, picked, needed, ratio, busy, onToggle, onDone, onRetake }: Props) {
  // 어느 컷이 잘 나왔는지 고르는 화면이라 크게 볼 수 있어야 합니다.
  const [zoomed, setZoomed] = useState<number | null>(null);
  const remaining = needed - picked.length;

  return (
    <main className="select no-print">
      <header className="screen-head">
        <h2>마음에 드는 {needed}장을 골라주세요</h2>
        <p>고른 순서대로 인화됩니다. 다시 누르면 선택이 풀려요.</p>
      </header>

      <div className="shot-grid">
        {shots.map((shot, index) => {
          const order = picked.indexOf(index);
          return (
            <div key={index} className={`shot-card${order >= 0 ? " picked" : ""}`}>
              <button
                className="shot-pick"
                aria-pressed={order >= 0}
                aria-label={`${index + 1}번째 사진 ${order >= 0 ? "선택 해제" : "선택"}`}
                onClick={() => onToggle(index)}
                style={{ aspectRatio: `${ratio}` }}
              >
                <img src={shot} alt="" />
                {order >= 0 && <span className="order-badge">{order + 1}</span>}
              </button>
              <button
                className="zoom-button"
                aria-label={`${index + 1}번째 사진 크게 보기`}
                onClick={() => setZoomed(index)}
              >
                <Icon name="zoom" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="select-actions">
        <button className="ghost-button" onClick={onRetake} disabled={busy}>
          <Icon name="redo" /> 다시 찍기
        </button>
        <button className="primary-button" onClick={onDone} disabled={remaining !== 0 || busy}>
          <Icon name="check" />
          {busy ? "만드는 중" : remaining > 0 ? `${remaining}장 더 골라주세요` : "이걸로 할래요"}
        </button>
      </div>

      {zoomed !== null && (
        <div className="zoom-overlay" role="dialog" aria-modal="true" onClick={() => setZoomed(null)}>
          <img src={shots[zoomed]} alt={`${zoomed + 1}번째 사진 크게 보기`} />
          <div className="zoom-actions" onClick={(event) => event.stopPropagation()}>
            <button className="ghost-button" onClick={() => setZoomed(null)}>
              닫기
            </button>
            <button
              className="primary-button"
              onClick={() => {
                onToggle(zoomed);
                setZoomed(null);
              }}
            >
              <Icon name="check" />
              {picked.includes(zoomed) ? "선택 해제" : "이 사진 고르기"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
