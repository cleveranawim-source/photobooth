import { useEffect, useState } from "react";
import type { Frame, Layout } from "../types";
import { singleTileLayout } from "../config/layouts";
import { composePrint } from "../lib/compose";

type Input = {
  frame: Frame;
  layout: Layout;
  /** 칸에 들어간 사진들(앞에서부터). 호출 쪽이 useMemo 로 고정한 배열이어야 다시 그리지 않습니다. */
  images: string[];
  title: string;
  tagline: string;
  caption: string;
};

/**
 * 촬영·바꾸기 화면의 바탕이 되는 조각(tile) 그림.
 *
 * 인화물 합성기(composePrint)를 **그대로** 돌려 조각 한 장을 만듭니다 — 프레임 장식·글자·날짜까지
 * 인화물과 똑같이 보여야 "이게 나온다"가 전해지기 때문입니다. 아직 안 찍은 칸은 합성기가
 * 바탕색(mat)으로 비워 둡니다. 입력이 바뀌면 다시 만들되, 새 그림이 올 때까지 이전 그림을
 * 유지해 깜빡임이 없습니다. 늦게 도착한 옛 결과는 버립니다.
 */
export function useTileImage({ frame, layout, images, title, tagline, caption }: Input): string | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void composePrint({
      images,
      frame,
      layout: singleTileLayout(layout),
      title,
      tagline,
      caption,
      scale: 1,
      quality: 0.85,
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        // 합성을 못 해도 화면은 바탕색 사각형으로 남습니다 — 촬영을 막지 않습니다.
      });
    return () => {
      cancelled = true;
    };
  }, [frame, layout, images, title, tagline, caption]);

  return src;
}
