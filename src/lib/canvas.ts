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

/**
 * 핀치 줌의 **조작상** 상한입니다. 화질 상한은 이것과 별개로 maxLosslessZoom 이 정합니다
 * (보통 이 값보다 훨씬 낮게 나옵니다). 여기 3 은 손가락으로 다루기 편한 범위라는 뜻일 뿐입니다.
 */
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

/**
 * **인화 화질을 한 톨도 깎지 않는** 최대 줌.
 *
 * grabFrame 은 `min(크롭폭, 인화필요폭)` 으로 내보냅니다. 즉 크롭폭이 인화필요폭보다
 * 크기만 하면 줌을 넣어도 손실이 0이고, 그 아래로 내려가는 순간부터는 늘려 찍는 것이라
 * 인화물이 흐려집니다. 그 경계가 곧 상한입니다.
 *
 * 고정 상한(3배)을 쓰면 안 되는 이유가 여기 있습니다 — 레이아웃마다 필요 픽셀이 다르고
 * 카메라가 주는 해상도도 기기마다 달라서, 같은 3배가 어떤 조합에선 손실 0이고 어떤
 * 조합에선 2.5배 확대가 됩니다. 특히 세로 칸은 크롭 높이가 카메라 높이에 묶여
 * 폭이 `높이 × 칸비율` 밖에 안 나오므로 여유가 확 줄어듭니다.
 *
 * 여유가 없는 조합(단컷 폴라로이드 등)에서는 1 이 나오고, 호출 쪽은 그걸 보고
 * 핀치를 아예 막습니다 — 손님이 화질을 깎을 방법 자체를 없애는 편이 낫습니다.
 */
export function maxLosslessZoom(
  sourceWidth: number,
  sourceHeight: number,
  ratio: number,
  /** 이 사진이 인화물에서 차지할 픽셀 폭 */
  captureWidth: number,
) {
  if (!sourceWidth || !sourceHeight || !captureWidth) return 1;
  const base = centerCrop(sourceWidth, sourceHeight, ratio, 1);
  const limit = base.width / captureWidth;
  // 0.1 단위로 내림 — 경계에 딱 붙이면 반올림 오차로 1픽셀씩 모자랄 수 있습니다.
  const floored = Math.floor(limit * 10) / 10;
  return Math.max(1, Math.min(MAX_ZOOM, floored));
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
