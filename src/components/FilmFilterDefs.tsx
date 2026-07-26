import type { FilterDef } from "../types";
import { filmFilterId } from "../lib/filmGrade";

/**
 * 필름 계조를 라이브 미리보기(비디오)에 입히기 위한 SVG 필터 정의.
 *
 * CSS 필터로는 채널별 톤커브를 만들 수 없어 SVG 를 씁니다. 제어점과 적용 순서를
 * lib/filmGrade 의 픽셀 연산과 똑같이 맞춰, 화면에서 본 색이 그대로 인화됩니다.
 *
 * color-interpolation-filters="sRGB" 가 핵심입니다 — SVG 필터 기본값은 linearRGB 라
 * 지정하지 않으면 캔버스 쪽 계산(sRGB)과 눈에 띄게 어긋납니다.
 */
export function FilmFilterDefs({ filters }: { filters: FilterDef[] }) {
  const graded = filters.filter((filter) => filter.film);
  if (!graded.length) return null;

  return (
    <svg className="film-defs" aria-hidden="true" focusable="false">
      <defs>
        {graded.map((filter) => {
          const film = filter.film!;
          return (
            <filter
              key={filter.key}
              id={filmFilterId(filter.key)}
              colorInterpolationFilters="sRGB"
            >
              {film.saturation !== undefined && film.saturation !== 1 && (
                <feColorMatrix type="saturate" values={String(film.saturation)} />
              )}
              <feComponentTransfer>
                <feFuncR type="table" tableValues={film.r.join(" ")} />
                <feFuncG type="table" tableValues={film.g.join(" ")} />
                <feFuncB type="table" tableValues={film.b.join(" ")} />
              </feComponentTransfer>
            </filter>
          );
        })}
      </defs>
    </svg>
  );
}
