import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 전면 카메라 스트림을 관리합니다.
 * 스트림은 한 번 얻으면 계속 들고 있습니다 — '다시 찍기' 마다 권한 팝업이 뜨지 않게.
 * 환영 화면으로 돌아갈 때만 stop() 해서 카메라 표시등을 끕니다.
 */
export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [resolution, setResolution] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
    setResolution(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("카메라를 사용할 수 없습니다. iPad의 Safari에서 HTTPS 주소로 열어주세요.");
      return false;
    }
    try {
      setReady(false);
      const existing = streamRef.current;
      const live = !!existing && existing.getVideoTracks().some((track) => track.readyState === "live");
      if (!live) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      }
      const track = streamRef.current?.getVideoTracks()[0];
      const size = track?.getSettings();
      if (size?.width && size?.height) setResolution(`${size.width}×${size.height}`);
      return true;
    } catch (caught) {
      setError(
        caught instanceof DOMException && caught.name === "NotAllowedError"
          ? "카메라 권한이 필요합니다. Safari 설정에서 카메라 접근을 허용해주세요."
          : "카메라를 시작하지 못했습니다. 다른 앱이 카메라를 사용 중인지 확인해주세요.",
      );
      return false;
    }
  }, []);

  /**
   * 촬영 화면의 <video> 들에 스트림을 물립니다(미리보기 + 글로우 레이어).
   * 정리 함수를 돌려주므로 effect 에서 그대로 return 하면 됩니다.
   *
   * 첫 프레임이 들어와야 촬영을 시작할 수 있으므로 canplay/loadedmetadata 를 듣습니다.
   * 이걸 빼먹고 붙이는 순간의 readyState 만 보면, 방금 srcObject 를 넣은 직후라 항상
   * 준비 전이어서 ready 가 영영 false 로 남고 촬영 버튼이 비활성으로 굳습니다.
   */
  const attach = useCallback((elements: (HTMLVideoElement | null)[]) => {
    const stream = streamRef.current;
    if (!stream) return undefined;
    const videos = elements.filter((element): element is HTMLVideoElement => !!element);
    for (const element of videos) {
      element.srcObject = stream;
      element.play().catch(() => undefined);
    }
    const primary = videos[0];
    if (!primary) return undefined;
    // 재사용한 스트림은 canplay 가 다시 안 뜰 수 있어, 이미 준비된 경우를 먼저 봅니다.
    if (primary.readyState >= 2) {
      setReady(true);
      return undefined;
    }
    const markReady = () => setReady(true);
    primary.addEventListener("loadedmetadata", markReady);
    primary.addEventListener("canplay", markReady);
    return () => {
      primary.removeEventListener("loadedmetadata", markReady);
      primary.removeEventListener("canplay", markReady);
    };
  }, []);

  return { start, stop, attach, ready, setReady, resolution, error, setError };
}
