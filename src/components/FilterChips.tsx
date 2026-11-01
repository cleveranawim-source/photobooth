import type { FilterDef } from "../types";
import { useFilterSwatches } from "../hooks/useFilterSwatches";

type Props = {
  filters: FilterDef[];
  value: string;
  disabled?: boolean;
  onChange: (key: string) => void;
  label?: string;
};

/**
 * 필터 고르기 칩 — 촬영 화면과 완성 화면이 같은 칩을 씁니다.
 * 이름만 봐선 알 수 없어, 실제 엔진으로 입힌 얼굴 썸네일을 함께 보여줍니다.
 */
export function FilterChips({ filters, value, disabled = false, onChange, label = "사진 필터" }: Props) {
  const swatches = useFilterSwatches(filters);
  return (
    <div className="filter-bar" role="group" aria-label={label}>
      {filters.map((item) => (
        <button
          key={item.key}
          className={`filter-chip${item.key === value ? " selected" : ""}`}
          aria-pressed={item.key === value}
          disabled={disabled}
          onClick={() => onChange(item.key)}
        >
          {swatches[item.key] ? (
            <img src={swatches[item.key]} alt="" />
          ) : (
            <span className="filter-dot" aria-hidden="true" />
          )}
          {item.name}
        </button>
      ))}
    </div>
  );
}
