/**
 * 고르는 화면의 진행 점 — "세 번 고르면 찍는다"를 점 세 개로 보여줍니다.
 * 모양(1) → 프레임(2) → 촬영(3). 글자 없이 점만 두어 상단이 조용합니다.
 */
export function StepDots({ current, total = 3 }: { current: number; total?: number }) {
  return (
    <ol className="step-dots" aria-label={`${total}단계 중 ${current}단계`}>
      {Array.from({ length: total }, (_, index) => (
        <li
          key={index}
          className={index + 1 === current ? "on" : undefined}
          aria-current={index + 1 === current ? "step" : undefined}
        />
      ))}
    </ol>
  );
}
