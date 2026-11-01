import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 전면 카메라 스트림을 관리합니다.
 * 스트림은 한 번 얻으면 계속 들고 있습니다 — '다시 찍기' 마다 권한 팝업이 뜨지 않게.
 * 환영 화면으로 돌아갈 때만 stop() 해서 카메라 표시등을 끕니다.
 */
export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null);
  /** start() 세대 번호. stop()·cancelStart() 가 올리면 그보다 먼저 시작된 start 는 결과를 버립니다. */
  const startGen = useRef(0);
  const [ready, setReady] = useState(false);
  const [resolution, setResolution] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    startGen.current += 1; // 기다리는 중인 start 가 있으면 그 스트림은 도착하는 대로 꺼집니다.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
    setResolution(null);
  }, []);

  /**
   * 스트림이 아직 살아 있는지. iPadOS 는 제어센터를 내리거나 앱을 전환하거나 다른 앱이
   * 카메라를 가져가면 트랙을 조용히 끝내 버립니다 — 그때 화면은 마지막 프레임에서 멈춘 채
   * 오류도 없어서, 이 판별 없이는 새로고침 말고 복구할 길이 없습니다.
   */
  const isLive = useCallback(
    () => !!streamRef.current?.getVideoTracks().some((track) => track.readyState === "live"),
    [],
  );

  useEffect(() => () => stop(), [stop]);

  /**
   * 기다리는 중인 start() 를 무효로 만듭니다 — 켜진 스트림은 건드리지 않습니다.
   * 프레임을 고르고 카메라가 켜지길 기다리다가 '모양 다시'로 돌아갈 때 씁니다: 그 뒤에 도착한
   * 스트림은 start() 안에서 꺼지고 false 가 돌아와 화면이 촬영으로 끌려가지 않습니다.
   */
  const cancelStart = useCallback(() => {
    startGen.current += 1;
  }, []);

  const start = useCallback(async () => {
    const gen = ++startGen.current;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      // 키오스크 앞 학생은 설정을 못 고칩니다 — 운영자를 부르는 문구로 둡니다.
      setError("이 브라우저에서는 카메라를 쓸 수 없어요. 선생님을 불러주세요.");
      return false;
    }
    try {
      setReady(false);
      const existing = streamRef.current;
      const live = !!existing && existing.getVideoTracks().some((track) => track.readyState === "live");
      if (!live) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          // ideal 은 강제가 아니라 희망값입니다 — 못 주면 브라우저가 알아서 낮춰 줍니다.
          // 크게 부르는 이유: 세로 칸은 크롭 높이가 카메라 높이에 묶여서, 1080 이면
          // 단컷 폴라로이드·2×2 격자가 줌 없이도 이미 늘려 찍는 상태가 됩니다.
          video: { facingMode: "user", width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (gen !== startGen.current) {
          // 기다리는 사이 화면을 떠났거나(cancelStart/stop) 새 start 가 들어왔습니다.
          // 늦게 온 스트림을 들고 있으면 표시등만 켜진 채 남으니 바로 끕니다.
          stream.getTracks().forEach((track) => track.stop());
          return false;
        }
        streamRef.current = stream;
      }
      const track = streamRef.current?.getVideoTracks()[0];
      const size = track?.getSettings();
      if (size?.width && size?.height) setResolution(`${size.width}×${size.height}`);
      return true;
    } catch (caught) {
      if (gen !== startGen.current) return false; // 이미 떠난 화면의 오류는 보여주지 않습니다.
      setError(
        caught instanceof DOMException && caught.name === "NotAllowedError"
          ? "카메라 사용이 꺼져 있어요. 선생님을 불러주세요."
          : "카메라를 켜지 못했어요. 선생님을 불러주세요.",
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

  return { start, stop, cancelStart, attach, isLive, ready, setReady, resolution, error, setError };
}
