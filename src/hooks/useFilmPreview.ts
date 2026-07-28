import { useEffect } from "react";
import type { RefObject } from "react";
import type { FilmGrade } from "../types";
import { applyFilmGrade } from "../lib/filmGrade";
import { centerCrop } from "../lib/canvas";

/**
 * 필름 계조를 입힌 라이브 미리보기를 캔버스에 직접 그립니다.
 *
 * 원래는 <video> 에 SVG 필터(`filter: url(#…)`)를 걸었는데, **Safari 는 비디오 요소에
 * SVG 필터를 적용해 주지 않습니다** — iPad 에서 아무 효과도 안 나타났습니다.
 * 그래서 미리보기도 인화와 **똑같은 픽셀 연산**으로 직접 그립니다. 브라우저 지원과
 * 무관하게 항상 동작하고, 같은 코드라 화면에서 본 색이 그대로 인화됩니다.
 *
 * 비용을 감당하려고 두 가지를 둡니다: 가로 640px 로 줄여 그리고(뷰파인더에서 충분),
 * 초당 20프레임으로 제한합니다. 그레인은 화면 크기에선 안 보이므로 건너뜁니다.
 */
const PREVIEW_WIDTH = 640;
const FPS = 20;

export function useFilmPreview(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  film: FilmGrade | undefined,
  ratio: number,
  zoom = 1,
) {
  useEffect(() => {
    if (!film) return;
    let raf = 0;
    let last = -Infinity;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 1000 / FPS) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !video.videoWidth) return;
      last = now;

      const width = PREVIEW_WIDTH;
      const height = Math.round(width / ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
      if (!context) return;

      // 촬영(lib/capture 의 grabFrame)과 **같은 함수로** 크롭을 계산합니다 — 여기와 저기가
      // 다르면 화면으로 잡은 구도와 인화물이 어긋납니다. 좌우 반전도 같이 맞춥니다.
      const {
        x: sourceX,
        y: sourceY,
        width: cropWidth,
        height: cropHeight,
      } = centerCrop(video.videoWidth, video.videoHeight, ratio, zoom);

      context.save();
      context.translate(width, 0);
      context.scale(-1, 1);
      context.drawImage(video, sourceX, sourceY, cropWidth, cropHeight, 0, 0, width, height);
      context.restore();

      applyFilmGrade(context, width, height, film, true);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [film, ratio, zoom, videoRef, canvasRef]);
}
