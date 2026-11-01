import type { FilterDef } from "../types";
import { centerCrop, loadImage } from "./canvas";
import { bakePreviewLook, supportsCanvasFilter } from "./filterEngine";

export type CapturedShot = {
  /** 보정 전 원본 — 완성 화면에서 필터를 바꿀 때 여기서 다시 굽습니다. */
  raw: string;
  /** 필터·피부 보정을 입힌 사진 — 무대·바꾸기·합성이 쓰는 쪽. */
  baked: string;
};

/**
 * 라이브 프레임 한 장을 인화 칸 비율로 중앙 크롭 + 좌우 반전해 캔버스로 만듭니다(필터 미적용).
 * 미리보기에서 보이는 영역과 인쇄되는 영역을 똑같이 맞추기 위해, 촬영 순간 화면을
 * 인화 칸과 같은 가로세로비로 자릅니다.
 *
 * targetWidth 는 합성 시 그 사진이 차지할 실제 픽셀 폭(= 칸 폭 × 2배 확대)입니다.
 * 여기에 맞춰 캡처해두면 합성할 때 1:1 로 들어가 다시 스케일되며 뭉개지지 않습니다.
 */
export function grabFrame(
  video: HTMLVideoElement,
  ratio: number,
  targetWidth: number,
  zoom = 1,
): HTMLCanvasElement {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("카메라 화면이 아직 준비되지 않았습니다.");

  // 뷰파인더(useFilmPreview)와 반드시 같은 식이어야 해서 공유 함수를 씁니다.
  const {
    x: sourceX,
    y: sourceY,
    width: cropWidth,
    height: cropHeight,
  } = centerCrop(sourceWidth, sourceHeight, ratio, zoom);

  // 카메라가 주는 것보다 크게 잡아봐야 보간일 뿐이라 크롭 폭을 상한으로 둡니다.
  const outputWidth = Math.min(cropWidth, targetWidth);
  const outputHeight = Math.round(outputWidth / ratio);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  // 픽셀 폴백 경로에서 getImageData 를 반복하므로 CPU 백킹 힌트를 줍니다(GPU 리드백 스톨 방지).
  const context = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: !supportsCanvasFilter,
  });
  if (!context) throw new Error("사진을 만들 수 없습니다.");
  // 전면 카메라 미리보기(좌우 반전)와 동일하게 보이도록 좌우 반전해 저장합니다.
  context.translate(outputWidth, 0);
  context.scale(-1, 1);
  context.drawImage(video, sourceX, sourceY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
  context.setTransform(1, 0, 0, 1, 0, 0); // 이후 연산을 위해 변환 초기화
  return canvas;
}

/**
 * 선명도 점수(인접 픽셀 밝기차의 합) — 클수록 덜 흔들린(또렷한) 프레임입니다.
 * 순위 판별에는 해상도가 필요 없어 1/4 축소 사본에서 채점합니다(데이터량 1/16).
 */
function sharpnessScore(canvas: HTMLCanvasElement): number {
  const width = Math.max(1, Math.round(canvas.width / 4));
  const height = Math.max(1, Math.round(canvas.height / 4));
  const small = document.createElement("canvas");
  small.width = width;
  small.height = height;
  const context = small.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) return 0;
  context.drawImage(canvas, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  const luma = (i: number) => data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  let sum = 0;
  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const value = luma(i);
      sum += Math.abs(value - luma(i - 4)) + Math.abs(value - luma(i - width * 4));
    }
  }
  return sum;
}

/**
 * 다음 실제 비디오 프레임까지 대기 — 고정 슬립 대신 새 프레임에 맞춰 후보를 잡습니다.
 * 카메라 인터럽션 등으로 프레임이 멈추면 콜백이 영영 안 올 수 있어 200ms 상한을 둡니다
 * (상한이 없으면 촬영 시퀀스가 진행 중 상태로 고착되어 새로고침 외엔 복구가 안 됩니다).
 */
function nextVideoFrame(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    const request = (
      video as HTMLVideoElement & { requestVideoFrameCallback?: (callback: () => void) => void }
    ).requestVideoFrameCallback;
    if (typeof request !== "function") {
      window.setTimeout(resolve, 45);
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, 200);
    request.call(video, finish);
  });
}

/**
 * 짧은 순간 여러 프레임을 잡아 가장 선명한(덜 흔들린) 것을 고릅니다 — 모션 블러 완화.
 * 원본도 같이 돌려줍니다: 필터는 찍은 뒤에도 바꿀 수 있어야 해서(완성 화면), 보정 전 사진을 간직합니다.
 */
export async function captureVideoFrame(
  video: HTMLVideoElement,
  filter: FilterDef,
  ratio: number,
  targetWidth: number,
  /** 피부 보정 세기 0~1 */
  skinSmooth = 0,
  /** 핀치 줌 배율(1 = 기본) */
  zoom = 1,
): Promise<CapturedShot> {
  let best: HTMLCanvasElement | null = null;
  let bestScore = -1;
  const attempts = 3;
  for (let i = 0; i < attempts; i += 1) {
    const candidate = grabFrame(video, ratio, targetWidth, zoom);
    const score = sharpnessScore(candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
    if (i < attempts - 1) await nextVideoFrame(video);
  }
  const sharp = best as HTMLCanvasElement;
  // bakePreviewLook 은 원본 캔버스를 제자리에서 고치므로 그 전에 떠 둡니다. 다시 구울 때 한 번 더
  // JPEG 를 거치므로 원본은 조금 높은 품질로.
  const raw = sharp.toDataURL("image/jpeg", 0.95);
  const canvas = bakePreviewLook(sharp, filter, skinSmooth);
  return { raw, baked: canvas.toDataURL("image/jpeg", 0.92) };
}

/**
 * 원본 사진에 필터·피부 보정을 다시 입힙니다 — 완성 화면에서 필터를 바꿀 때.
 * 촬영 때와 같은 bakePreviewLook 을 타므로, 처음부터 그 필터로 찍은 것과 같은 결과입니다.
 */
export async function bakeShot(raw: string, filter: FilterDef, skinSmooth = 0): Promise<string> {
  const image = await loadImage(raw);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: !supportsCanvasFilter });
  if (!context) throw new Error("사진을 만들 수 없습니다.");
  context.drawImage(image, 0, 0);
  return bakePreviewLook(canvas, filter, skinSmooth).toDataURL("image/jpeg", 0.92);
}
