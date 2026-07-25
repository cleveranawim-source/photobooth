import { useEffect, useState } from "react";
import type { Frame, Layout } from "../types";
import { cellRatio } from "../config/layouts";
import { composePrint, makeSampleShots } from "../lib/compose";

/**
 * 레이아웃·프레임 선택 칸에 넣을 작은 인화물 미리보기를 만듭니다.
 *
 * 근사한 그림을 따로 그리지 않고 **실제 합성기를 축소 배율로 돌립니다.**
 * 앱 화면 색이 프레임을 따라가지 않는 구조라 이 그림이 유일한 단서인데,
 * 근사치를 쓰면 장식을 손볼 때마다 고를 때 본 것과 인화물이 어긋나기 때문입니다.
 */
const PREVIEW_SCALE = 0.22;

// 샘플 사진은 (장수, 비율) 조합마다 한 번만 만들어 재사용합니다.
const sampleCache = new Map<string, string[]>();
const samplesFor = (count: number, ratio: number) => {
  const key = `${count}@${ratio.toFixed(3)}`;
  const cached = sampleCache.get(key);
  if (cached) return cached;
  const shots = makeSampleShots(count, ratio);
  sampleCache.set(key, shots);
  return shots;
};

export const layoutPreviewKey = (key: string) => `L:${key}`;
export const framePreviewKey = (key: string) => `F:${key}`;

type Input = {
  frames: Frame[];
  layouts: Layout[];
  frame: Frame;
  layout: Layout;
  title: string;
  tagline: string;
  caption: string;
};

export function usePrintPreviews({ frames, layouts, frame, layout, title, tagline, caption }: Input) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  // 문구는 한 글자마다 바뀌므로 잠시 기다렸다 다시 그립니다.
  const [settledCaption, setSettledCaption] = useState(caption);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettledCaption(caption), 350);
    return () => window.clearTimeout(timer);
  }, [caption]);

  useEffect(() => {
    let cancelled = false;
    const jobs = [
      ...layouts.map((item) => ({ key: layoutPreviewKey(item.key), frame, layout: item })),
      ...frames.map((item) => ({ key: framePreviewKey(item.key), frame: item, layout })),
    ];

    void (async () => {
      for (const job of jobs) {
        if (cancelled) return;
        try {
          const url = await composePrint({
            images: samplesFor(job.layout.cells.length, cellRatio(job.layout)),
            frame: job.frame,
            layout: job.layout,
            title,
            tagline,
            caption: settledCaption,
            scale: PREVIEW_SCALE,
            quality: 0.82,
          });
          if (cancelled) return;
          // 하나씩 채워 넣어 먼저 만들어진 것부터 보이게 합니다.
          setPreviews((previous) => ({ ...previous, [job.key]: url }));
        } catch {
          // 미리보기 실패는 조용히 넘어갑니다 — 자리에는 구조만 그린 대체 그림이 남습니다.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [frames, layouts, frame, layout, title, tagline, settledCaption]);

  return previews;
}
