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
            <button
              key={index}
              className={`shot-card${order >= 0 ? " picked" : ""}`}
              aria-pressed={order >= 0}
              onClick={() => onToggle(index)}
              style={{ aspectRatio: `${ratio}` }}
            >
              <img src={shot} alt={`${index + 1}번째 사진`} />
              {order >= 0 && <span className="order-badge">{order + 1}</span>}
            </button>
          );
        })}
      </div>

      <div className="select-actions">
        <button className="ghost-button" onClick={onRetake} disabled={busy}>
          <Icon name="redo" /> 다시 찍기
        </button>
        <button className="primary-button" onClick={onDone} disabled={picked.length !== needed || busy}>
          <Icon name="check" />
          {busy ? "만드는 중" : `${picked.length}/${needed} 골랐어요`}
        </button>
      </div>
    </main>
  );
}
