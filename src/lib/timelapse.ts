import { drawCover, loadImage, sleep } from "./canvas";

// 촬영하는 동안 일정 간격으로 스냅샷을 모아 두었다가, 끝나면 빠르게 이어붙여
// 짧은 타임랩스 영상으로 만듭니다. 재미용 보너스라 540p·짧은 길이로 가볍게 갑니다
// (생성도 공유 시트 준비도 빨라집니다).
const TIMELAPSE = {
  intervalMs: 450,
  maxFrames: 50,
  playbackFps: 20,
  width: 960,
  height: 540,
};

export type Clip = { url: string; blob: Blob; ext: string };

/** 촬영 시작 시 호출 — 반환된 stop() 이 모아둔 프레임 목록을 돌려줍니다. */
export function startTimelapseCapture(getVideo: () => HTMLVideoElement | null) {
  const snapCanvas = document.createElement("canvas");
  snapCanvas.width = TIMELAPSE.width;
  snapCanvas.height = TIMELAPSE.height;
  const snapContext = snapCanvas.getContext("2d", { alpha: false });
  const frames: string[] = [];
  let active = true;
  let last = -Infinity;

  const tick = (now: number) => {
    if (!active) return;
    requestAnimationFrame(tick);
    if (now - last < TIMELAPSE.intervalMs) return;
    const source = getVideo();
    if (snapContext && source && source.videoWidth && frames.length < TIMELAPSE.maxFrames) {
      last = now;
      snapContext.save();
      snapContext.translate(TIMELAPSE.width, 0);
      snapContext.scale(-1, 1); // 미리보기와 같은 좌우 반전
      drawCover(
        snapContext,
        source,
        source.videoWidth,
        source.videoHeight,
        0,
        0,
        TIMELAPSE.width,
        TIMELAPSE.height,
      );
      snapContext.restore();
      frames.push(snapCanvas.toDataURL("image/jpeg", 0.8));
    }
  };
  requestAnimationFrame(tick);

  return {
    stop: () => {
      active = false;
      return frames;
    },
  };
}

/** 모은 스냅샷들을 playbackFps 로 재생하며 녹화 → 짧은 영상 파일을 만듭니다. */
export async function buildTimelapse(frameUrls: string[]): Promise<Clip | null> {
  if (frameUrls.length < 2 || typeof MediaRecorder === "undefined") return null;
  try {
    const images = await Promise.all(frameUrls.map(loadImage));
    const canvas = document.createElement("canvas");
    canvas.width = TIMELAPSE.width;
    canvas.height = TIMELAPSE.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;
    const recStream = canvas.captureStream(TIMELAPSE.playbackFps);
    // iPad 는 mp4(avc1), 그 외는 webm 을 잡습니다.
    const candidates = [
      "video/mp4;codecs=avc1",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    const isSupported = (type: string) =>
      typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(type);
    const mime = candidates.find(isSupported) || "";
    const recorder = mime
      ? new MediaRecorder(recStream, { mimeType: mime, videoBitsPerSecond: 2_500_000 })
      : new MediaRecorder(recStream);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    context.drawImage(images[0], 0, 0, TIMELAPSE.width, TIMELAPSE.height);
    recorder.start();
    for (const image of images) {
      context.drawImage(image, 0, 0, TIMELAPSE.width, TIMELAPSE.height);
      await sleep(1000 / TIMELAPSE.playbackFps);
    }
    await sleep(300); // 마지막 프레임 잠깐 유지
    recorder.stop();
    await stopped;
    const type = mime || "video/webm";
    const blob = new Blob(chunks, { type });
    return blob.size
      ? { url: URL.createObjectURL(blob), blob, ext: type.includes("mp4") ? "mp4" : "webm" }
      : null;
  } catch {
    return null;
  }
}
