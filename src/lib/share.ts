const today = () => new Date().toISOString().slice(0, 10);

/** 홈 화면에 추가한 웹앱으로 실행 중인지 */
export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;

function download(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}

export function downloadImage(dataUrl: string) {
  download(dataUrl, `4컷사진-${today()}.jpg`);
}

/**
 * 공유 시트로 사진 앱 저장·AirDrop·프린트를 열어줍니다.
 * share 존재만으로는 부족합니다 — 파일 공유(iPadOS 15+)를 지원하는지 canShare 로 확인해야
 * 구형 기기에서 버튼이 무반응이 되지 않습니다.
 */
export async function shareImage(dataUrl: string) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `4컷사진-${today()}.jpg`, { type: "image/jpeg" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: "4컷 사진", files: [file] });
      return;
    }
  } catch (caught) {
    // 사용자가 공유 창을 닫은 경우(AbortError)만 조용히 끝내고, 그 외는 다운로드로 폴백합니다.
    if (caught instanceof DOMException && caught.name === "AbortError") return;
  }
  downloadImage(dataUrl);
}

export async function shareClip(blob: Blob, ext: string) {
  const file = new File([blob], `4컷사진-타임랩스-${today()}.${ext}`, { type: blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "촬영 타임랩스" });
      return;
    }
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") return;
  }
  const url = URL.createObjectURL(blob);
  download(url, file.name);
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * AirPrint 인쇄. 홈 화면에 추가한 standalone 웹앱에서는 window.print() 가 동작하지 않는
 * iPadOS 버전이 있어 공유 시트로 폴백합니다(시트의 '프린트' 항목으로 인쇄).
 */
export function printImage(dataUrl: string) {
  if (isStandalone()) {
    void shareImage(dataUrl);
    return;
  }
  window.print();
}
