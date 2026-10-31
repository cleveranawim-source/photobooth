import { useEffect, useRef, useState } from "react";

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
 *
 * 마지막 warnBefore 초 동안은 남은 초를 돌려줍니다(그 전엔 null). 예고 없이 조용히
 * 초기화되면 사진 앞에서 얘기하던 손님이 "사라졌다"고 느낍니다 — 화면이 미리 알려주고,
 * 누르면 계속되게 합니다.
 */
export function useIdleReset(active: boolean, seconds: number, onIdle: () => void, warnBefore = 20) {
  const callbackRef = useRef(onIdle);
  callbackRef.current = onIdle;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      setSecondsLeft(null);
      return;
    }
    let deadline = Date.now() + seconds * 1000;
    let timer = 0;
    const tick = () => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      if (left <= 0) {
        setSecondsLeft(null);
        callbackRef.current();
        return;
      }
      setSecondsLeft(left <= warnBefore ? left : null);
      timer = window.setTimeout(tick, 1000);
    };
    const arm = () => {
      deadline = Date.now() + seconds * 1000;
      window.clearTimeout(timer);
      setSecondsLeft(null);
      timer = window.setTimeout(tick, 1000);
    };
    arm();
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown"];
    events.forEach((event) => window.addEventListener(event, arm));
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, arm));
    };
  }, [active, seconds, warnBefore]);

  return secondsLeft;
}
