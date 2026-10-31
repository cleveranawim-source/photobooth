import type { Phase } from "../types";

// 손님이 지나는 네 단계. 실제 순서라 번호가 곧 정보입니다 — 지금 어디쯤인지,
// 몇 번 더 고르면 끝나는지를 상단에서 늘 보여줍니다.
const STEPS = ["모양·프레임", "촬영", "고르기", "인화"] as const;

const STEP_OF: Partial<Record<Phase, number>> = {
  start: 1,
  camera: 2,
  swap: 3,
  result: 4,
};

export function Steps({ phase }: { phase: Phase }) {
  const current = STEP_OF[phase];
  if (!current) return null;
  return (
    <ol className="steps" aria-label="진행 단계">
      {STEPS.map((label, index) => {
        const number = index + 1;
        return (
          <li
            key={label}
            className={number === current ? "on" : undefined}
            aria-current={number === current ? "step" : undefined}
          >
            <span className="steps-num">{number}</span> {label}
          </li>
        );
      })}
    </ol>
  );
}
