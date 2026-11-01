import { useRef } from "react";
import { Icon } from "../components/Icon";

type Props = {
  title: string;
  tagline: string;
  /** "이런 게 나와요" — 실제 합성기로 만든 샘플 인화물(최대 3장). 누를 수 없는 장식입니다. */
  samples: string[];
  /** 모양·프레임이 하나뿐이면 이 버튼이 곧 카메라라, 카메라 오류가 여기 보입니다. */
  error: string | null;
  /** 카메라를 켜는 중 — 연타해도 스트림을 두 번 열지 않게 버튼을 잠급니다. */
  busy: boolean;
  onStart: () => void;
  onAdmin: () => void;
};

/** 첫 화면. 고르는 건 아무것도 없고 버튼 하나뿐입니다. */
export function StartScreen({ title, tagline, samples, error, busy, onStart, onAdmin }: Props) {
  // 관리자 화면은 제목을 2초 길게 눌러 엽니다 — 손님 눈에 띄지 않게.
  const pressTimer = useRef(0);
  const holdStart = () => {
    window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(onAdmin, 2000);
  };
  const holdEnd = () => window.clearTimeout(pressTimer.current);

  return (
    <main className="start no-print">
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

      <button className="primary-button start-button" onClick={onStart} disabled={busy}>
        <Icon name="camera" />
        {busy ? "카메라 켜는 중…" : "사진 찍기"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {samples.length > 0 && (
        <div className="start-samples" aria-hidden="true">
          {samples.map((src, index) => (
            <img key={index} src={src} alt="" draggable={false} />
          ))}
        </div>
      )}
    </main>
  );
}
