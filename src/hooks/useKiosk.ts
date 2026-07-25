import { useEffect, useRef } from "react";

/**
 * 화면 꺼짐 방지 — 행사 키오스크에서 iPad 자동 잠금이 걸리지 않게 합니다(iPadOS 16.4+).
 * 저전력 모드에서는 브라우저가 거부하므로, 운영 시 저전력 모드를 꺼두는 편이 좋습니다.
 */
export function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let disposed = false;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
        if (disposed) lock?.release().catch(() => undefined);
      } catch (caught) {
        console.warn("화면 꺼짐 방지(Wake Lock)를 켤 수 없습니다:", caught);
      }
    };
    void request();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      lock?.release().catch(() => undefined);
    };
  }, []);
}

/**
 * 방치 시 자동 초기화 — 앞 팀의 사진이 다음 이용자에게 남아 있지 않게 합니다.
 * 화면을 만지면 타이머가 다시 시작됩니다.
 */
export function useIdleReset(active: boolean, seconds: number, onIdle: () => void) {
  const callbackRef = useRef(onIdle);
  callbackRef.current = onIdle;

  useEffect(() => {
    if (!active) return;
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callbackRef.current(), seconds * 1000);
    };
    arm();
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown"];
    events.forEach((event) => window.addEventListener(event, arm));
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, arm));
    };
  }, [active, seconds]);
}
