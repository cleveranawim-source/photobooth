export const sleep = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

/** object-fit: cover 와 같은 방식으로 이미지를 칸에 꽉 채워 그립니다(중앙 크롭). */
export function drawCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const sourceX = (sourceWidth - cropWidth) / 2;
  const sourceY = (sourceHeight - cropHeight) / 2;
  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, x, y, width, height);
}

/** 핀치 줌 상한. 카메라 원본을 잘라 확대하는 방식이라 더 키우면 화질이 눈에 띄게 떨어집니다. */
export const MAX_ZOOM = 3;

/**
 * 뷰파인더와 촬영이 **함께 쓰는** 중앙 크롭 계산.
 *
 * 원래 이 식이 `useFilmPreview` 와 `grabFrame` 에 따로 있었습니다. 손님이 화면으로 잡은
 * 구도가 그대로 찍히려면 두 곳이 한 글자도 다르면 안 되는데, 줌처럼 나중에 뭔가 더할 때마다
 * 한쪽만 고쳐 어긋날 자리였습니다(실제로 예전에 뷰파인더 화각이 실제와 다른 버그가 있었음).
 * 그래서 한 곳으로 모았습니다.
 *
 * zoom 은 1 이 기본이고, 키울수록 원본에서 더 좁은 영역을 잘라 확대한 효과가 납니다.
 * CSS `transform: scale(z)`(원본 비디오 레이어)와 결과가 같도록 중심 기준으로만 좁힙니다.
 */
export function centerCrop(
  sourceWidth: number,
  sourceHeight: number,
  ratio: number,
  zoom = 1,
) {
  let cropWidth = sourceWidth;
  let cropHeight = Math.round(sourceWidth / ratio);
  if (cropHeight > sourceHeight) {
    cropHeight = sourceHeight;
    cropWidth = Math.round(sourceHeight * ratio);
  }
  const safeZoom = Math.min(MAX_ZOOM, Math.max(1, zoom));
  cropWidth = Math.round(cropWidth / safeZoom);
  cropHeight = Math.round(cropHeight / safeZoom);
  return {
    x: (sourceWidth - cropWidth) / 2,
    y: (sourceHeight - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}

export function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

export function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("사진을 불러오지 못했습니다."));
    image.src = source;
  });
}

/** context.filter 없이 흐림 효과 — 축소했다 확대하면 자연스럽게 뭉개집니다(모든 기기 지원). */
export function makeBlurredCanvas(
  source: HTMLCanvasElement,
  width: number,
  height: number,
  downscale: number,
) {
  const smallWidth = Math.max(1, Math.round(width / downscale));
  const smallHeight = Math.max(1, Math.round(height / downscale));
  const small = document.createElement("canvas");
  small.width = smallWidth;
  small.height = smallHeight;
  const smallContext = small.getContext("2d")!;
  smallContext.imageSmoothingEnabled = true;
  smallContext.drawImage(source, 0, 0, smallWidth, smallHeight);

  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputContext = output.getContext("2d")!;
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(small, 0, 0, width, height);
  return output;
}
