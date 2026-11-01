import { useEffect, useState } from "react";
import type { Orientation } from "../types";

const QUERY = "(orientation: portrait)";

const read = (): Orientation =>
  typeof window !== "undefined" && window.matchMedia?.(QUERY).matches ? "portrait" : "landscape";

/**
 * iPad 를 세운 방향. styles.css 의 세로 분기와 **같은 미디어 쿼리**라 화면 배치와 어긋나지 않습니다.
 * 렌즈 위치(camEdges)를 고르는 데 씁니다 — 돌리면 같은 렌즈가 다른 변으로 갑니다.
 */
export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(read);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const update = () => setOrientation(media.matches ? "portrait" : "landscape");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return orientation;
}
