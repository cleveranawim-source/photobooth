import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Phase, Settings } from "./types";
import { FILTERS, findFilter } from "./config/filters";
import { findFrame } from "./config/frames";
import { cellRatio, findLayout, shotsNeeded } from "./config/layouts";
import { ensureAudio, playBeep, playFanfare, playShutter } from "./lib/audio";
import { maxLosslessZoom, sleep } from "./lib/canvas";
import { captureVideoFrame } from "./lib/capture";
import { composePrint, makeSampleShots } from "./lib/compose";
import { glowFilterCss, previewFilterCss } from "./lib/filterEngine";
import { printImage, shareClip, shareImage } from "./lib/share";
import {
  loadSettings,
  saveSettings,
  visibleFrames,
  visibleLayouts,
} from "./lib/settings";
import { buildTimelapse, startTimelapseCapture, type Clip } from "./lib/timelapse";
import { useCamera } from "./hooks/useCamera";
import { useIdleReset, useWakeLock } from "./hooks/useKiosk";
import { useTileImage } from "./hooks/useTileImage";
import { captureSlots, swapSlots } from "./lib/stageGeometry";
import { framePreviewKey, usePrintPreviews } from "./hooks/usePrintPreviews";
import { StartScreen } from "./screens/StartScreen";
import { ShapeScreen } from "./screens/ShapeScreen";
import { FrameScreen } from "./screens/FrameScreen";
import { CaptureScreen } from "./screens/CaptureScreen";
import { SwapScreen } from "./screens/SwapScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { AdminScreen } from "./screens/AdminScreen";
import { Icon } from "./components/Icon";
import { StepDots } from "./components/Steps";

const READY_STATUS = "주황 칸에 내 얼굴이 들어가요. 준비되면 찍기를 눌러요";

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [phase, setPhase] = useState<Phase>("start");
  const [frameKey, setFrameKey] = useState(settings.defaultFrame);
  const [layoutKey, setLayoutKey] = useState(settings.defaultLayout);
  const [filterKey, setFilterKey] = useState("none");
  // 핀치 줌 — 뷰파인더와 촬영이 같은 값을 써야 해서 여기서 들고 내려보냅니다.
  const [zoom, setZoom] = useState(1);
  const [caption, setCaption] = useState(settings.caption);

  const [shots, setShots] = useState<string[]>([]);
  /** 찍은 순서를 칸에 놓는 순서로 — shots 인덱스 배열. 앞 needed 개가 조각 칸, 나머지가 여분. */
  const [order, setOrder] = useState<number[]>([]);
  /** 바꾸기 화면에서 고른 칸 */
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [composite, setComposite] = useState<string | null>(null);
  /**
   * 결과 화면에서 다시 합성할 때 쓸 사진들(고른 순서가 앞). 프레임·레이아웃·문구는
   * 사진 자체를 바꾸지 않으므로, 다시 찍지 않고 이 사진들로 새로 꾸며주면 됩니다.
   */
  const [sourceShots, setSourceShots] = useState<string[]>([]);
  const [sampleMode, setSampleMode] = useState(false);
  const [clip, setClip] = useState<Clip | null>(null);
  // 타임랩스를 실제로 만들고 있는 중일 때만 "만드는 중" 안내를 띄웁니다
  // (샘플 둘러보기처럼 촬영을 안 한 경우엔 영원히 안 나올 영상을 기다리게 두면 안 됩니다).
  const [clipPending, setClipPending] = useState(false);
  // 인쇄 창을 열었는지 — 완성 화면의 끝맺음 문구와 버튼 순서가 바뀝니다.
  const [printed, setPrinted] = useState(false);

  const [shooting, setShooting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shotIndex, setShotIndex] = useState(0);
  const [flash, setFlash] = useState(false);
  const [status, setStatus] = useState(READY_STATUS);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const glowVideoRef = useRef<HTMLVideoElement>(null);
  // 촬영 시퀀스의 세대 번호. 초기화 등으로 증가하면 진행 중이던 시퀀스가 스스로 중단됩니다.
  const runGenRef = useRef(0);
  // 마지막으로 합성한 조건. 같은 조건이면 결과 화면에서 다시 합성하지 않습니다.
  const composedSigRef = useRef("");

  const camera = useCamera();
  useWakeLock();

  // 카메라 권한 거부·장치 점유 등은 useCamera 가 메시지를 만들지만, 여기서 화면에 띄우지
  // 않으면 '촬영 시작'을 눌러도 아무 반응이 없는 상태가 됩니다(실제로 그랬습니다).
  const cameraError = camera.error;
  useEffect(() => {
    if (cameraError) setError(cameraError);
  }, [cameraError]);

  const frame = findFrame(frameKey);
  const layout = findLayout(layoutKey);
  const filter = findFilter(filterKey);
  const frames = useMemo(() => visibleFrames(settings), [settings]);
  const layouts = useMemo(() => visibleLayouts(settings), [settings]);
  // 행사 로고가 든 프레임이 맨 앞 — 오늘 행사용으로 켜 둔 것이 손님 눈에 먼저 들어오게.
  const orderedFrames = useMemo(
    () => [...frames.filter((item) => item.logo), ...frames.filter((item) => !item.logo)],
    [frames],
  );
  const needed = shotsNeeded(layout);
  const ratio = cellRatio(layout);
  // 레이아웃이 필요한 수보다 적게 찍을 수는 없습니다.
  const totalShots = Math.max(settings.shootCount, needed);
  // 촬영 캔버스를 합성 시 차지할 픽셀 폭에 맞춰 잡으면 1:1 로 들어가 다시 스케일되지 않습니다.
  const captureWidth = Math.round(layout.cells[0].w * 2);

  // ── 촬영 무대 ──
  // 촬영 칸 전부(조각 칸 + 여분)와, 찍힌 사진이 들어간 조각 그림. 그림은 합성기가 다시 그립니다.
  const slots = useMemo(() => captureSlots(layout, totalShots), [layout, totalShots]);
  const orderedShots = useMemo(() => order.map((index) => shots[index]), [order, shots]);
  // 촬영 중엔 찍은 순서대로, 바꾸기 화면에선 바꾼 순서대로 조각 칸을 채웁니다.
  const tileImages = useMemo(
    () => (phase === "swap" ? orderedShots : shots).slice(0, needed),
    [phase, orderedShots, shots, needed],
  );
  const tileSrc = useTileImage({
    frame,
    layout,
    images: tileImages,
    title: settings.title,
    tagline: settings.tagline,
    caption,
  });
  // 다음에 찍힐 칸. 마지막 사진이 찍힌 뒤에는 화면이 바뀌므로 상한만 막아 둡니다.
  const activeIndex = Math.min(shotIndex, slots.length - 1);

  // 줌 상한은 고정값이 아니라 **지금 이 조합에서 인화 화질이 안 깎이는 한계**로 정합니다.
  // 레이아웃마다 필요 픽셀이 다르고 기기마다 카메라 해상도가 달라서, 같은 배율이라도
  // 어떤 조합에선 손실 0이고 어떤 조합에선 늘려 찍기가 됩니다.
  const maxZoom = useMemo(() => {
    const [width, height] = (camera.resolution ?? "").split("×").map(Number);
    return maxLosslessZoom(width, height, ratio, captureWidth);
  }, [camera.resolution, ratio, captureWidth]);

  // 레이아웃을 바꾸거나 카메라가 늦게 해상도를 알려오면 상한이 내려갈 수 있습니다.
  // 이미 그보다 크게 당겨 둔 상태라면 조용히 끌어내립니다 — 안 그러면 화면과 인화가 달라집니다.
  useEffect(() => {
    setZoom((current) => Math.min(current, maxZoom));
  }, [maxZoom]);

  const previews = usePrintPreviews({
    frames: orderedFrames,
    layout,
    title: settings.title,
    tagline: settings.tagline,
    caption,
  });
  // 시작 화면의 "이런 게 나와요" — 앞의 세 프레임.
  const samples = orderedFrames
    .slice(0, 3)
    .map((item) => previews[framePreviewKey(item.key)])
    .filter((src): src is string => !!src);

  // 인쇄 용지 크기는 레이아웃마다 달라 @page 를 동적으로 갈아 끼웁니다.
  useEffect(() => {
    const id = "print-page-rules";
    const style = document.getElementById(id) ?? document.createElement("style");
    style.id = id;
    const { w, h } = layout.paper;
    style.textContent = `
      @page { size: ${w}in ${h}in; margin: 0; }
      @media print {
        .print-image { width: ${w}in !important; height: ${h}in !important; }
      }
    `;
    if (!style.isConnected) document.head.appendChild(style);
  }, [layout]);

  // 영상 blob URL 누수 방지: clip 이 바뀌거나 언마운트될 때 이전 URL 해제
  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url); }, [clip]);

  // 촬영 화면에 들어올 때와 필터가 바뀔 때(글로우 <video> 가 새로 생길 때)만 스트림을 붙입니다.
  // camera 객체 전체를 의존성에 넣으면 렌더마다 새 객체라 매 렌더 재부착되어 재생이 끊깁니다.
  // cameraEpoch 는 자동 복구가 새 스트림을 얻었을 때 재부착을 트리거하는 손잡이입니다.
  const [cameraEpoch, setCameraEpoch] = useState(0);
  const attachCamera = camera.attach;
  useEffect(() => {
    if (phase !== "camera") return;
    return attachCamera([videoRef.current, glowVideoRef.current]);
  }, [phase, filterKey, cameraEpoch, attachCamera]);

  // ── 카메라 자동 복구 ─────────────────────────────────────────────
  // 제어센터를 내리거나 홈으로 나갔다 오거나 다른 앱이 카메라를 가져가면 iPadOS 가
  // 트랙을 조용히 끝냅니다. 화면은 마지막 프레임에 멈춘 채 오류도 없어서, 행사장에서는
  // "멈췄어요" 가 되어 새로고침 말고 답이 없던 자리입니다. 돌아왔을 때(visibilitychange)와
  // 4초 간격 순찰로 트랙 생존을 확인하고, 죽어 있으면 조용히 새로 얻어 다시 붙입니다.
  const startCameraStream = camera.start;
  const isCameraLive = camera.isLive;
  useEffect(() => {
    if (phase !== "camera" || shooting) return;
    let cancelled = false;
    let reviving = false;
    const revive = async () => {
      // 백그라운드에서는 카메라를 잡지 않습니다 — 보이지도 않는데 표시등만 켜집니다.
      if (cancelled || reviving || document.visibilityState !== "visible") return;
      if (isCameraLive()) return;
      reviving = true;
      try {
        if ((await startCameraStream()) && !cancelled) setCameraEpoch((epoch) => epoch + 1);
      } finally {
        reviving = false;
      }
    };
    const onVisibility = () => void revive();
    document.addEventListener("visibilitychange", onVisibility);
    const patrol = window.setInterval(() => void revive(), 4000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(patrol);
    };
  }, [phase, shooting, startCameraStream, isCameraLive]);

  const stopCamera = camera.stop;
  const reset = useCallback(() => {
    runGenRef.current += 1; // 진행 중일 수 있는 촬영 시퀀스 중단
    stopCamera(); // 환영 화면에서는 카메라 표시등이 꺼지도록
    setPhase("start");
    setComposite(null);
    setClip(null);
    setClipPending(false);
    setShots([]);
    setOrder([]);
    setSelectedSlot(null);
    setShotIndex(0);
    setError(null);
    setPrinted(false);
    setZoom(1); // 다음 손님이 앞사람 확대 상태를 그대로 물려받지 않도록
  }, [stopCamera]);

  // 촬영 대기 화면도 초기화 대상입니다 — 손님이 여기까지 왔다가 그냥 가면 카메라가
  // 켜진 채(표시등 점등) 줌·필터가 다음 손님에게 남습니다. 촬영 시퀀스 중에는 걸지 않습니다.
  // 고르는 화면(모양·프레임)에서 자리를 떠도 처음으로 돌아갑니다.
  const idleSecondsLeft = useIdleReset(
    phase === "shape" ||
      phase === "frame" ||
      phase === "swap" ||
      phase === "result" ||
      (phase === "camera" && !shooting),
    settings.idleSeconds,
    reset,
  );

  /** 프레임을 고른 순간 카메라를 켭니다. 실패하면 화면은 그대로이고 오류만 보입니다. */
  const startCamera = async () => {
    setError(null);
    setComposite(null);
    setPrinted(false);
    setShots([]);
    setOrder([]);
    setSelectedSlot(null);
    setShotIndex(0);
    if (await camera.start()) {
      setPhase("camera");
      setStatus(READY_STATUS);
    }
  };

  // ── 고르기 흐름: 시작 → 모양 → 프레임 → 촬영. 하나뿐인 단계는 건너뜁니다. ──
  const goFrame = () => {
    if (orderedFrames.length === 1) {
      setFrameKey(orderedFrames[0].key);
      void startCamera();
      return;
    }
    setPhase("frame");
  };
  const goShape = () => {
    setError(null);
    if (layouts.length === 1) {
      setLayoutKey(layouts[0].key);
      goFrame();
      return;
    }
    setPhase("shape");
  };
  const pickShape = (key: string) => {
    setLayoutKey(key);
    goFrame();
  };
  const pickFrame = (key: string) => {
    setFrameKey(key);
    void startCamera();
  };

  // 상단 왼쪽 되돌아가기 — 어디로 가는지가 곧 이름입니다. 하나뿐이라 건너뛴 단계로는 안 돌아갑니다.
  const back = (() => {
    const toShape = { label: "모양 다시", go: () => setPhase("shape") };
    const toStart = { label: "처음으로", go: reset };
    const beforeFrame = layouts.length === 1 ? toStart : toShape;
    if (phase === "shape") return toStart;
    if (phase === "frame") return beforeFrame;
    if (phase === "camera") {
      const target =
        orderedFrames.length === 1 ? beforeFrame : { label: "프레임 다시", go: () => setPhase("frame") };
      return {
        label: target.label,
        go: () => {
          // 찍은 사진은 버립니다 — 다시 들어오면 처음부터 찍습니다.
          setShots([]);
          setShotIndex(0);
          setError(null);
          target.go();
        },
      };
    }
    return null;
  })();

  // 지금 조합으로 합성한 적이 있는지 판별하는 서명. 결과 화면에서 무엇이든 바뀌면 달라집니다.
  const composeSignature = [
    frameKey,
    layoutKey,
    caption,
    settings.title,
    settings.tagline,
    sampleMode ? "sample" : sourceShots.length,
  ].join("|");

  const compose = useCallback(
    async (images: string[]) => {
      const result = await composePrint({
        images,
        frame,
        layout,
        title: settings.title,
        tagline: settings.tagline,
        caption,
      });
      composedSigRef.current = composeSignature;
      return result;
    },
    [frame, layout, settings.title, settings.tagline, caption, composeSignature],
  );

  /** 레이아웃이 요구하는 장수에 맞춰 사진을 고릅니다. 모자라면 앞에서부터 다시 씁니다. */
  const imagesForLayout = useCallback(
    (count: number) => {
      if (sampleMode || !sourceShots.length) return makeSampleShots(count, ratio);
      return Array.from({ length: count }, (_, index) => sourceShots[index % sourceShots.length]);
    },
    [sampleMode, sourceShots, ratio],
  );

  /**
   * 결과 화면에서 프레임·레이아웃·문구를 바꾸면 다시 찍지 않고 새로 꾸며 줍니다.
   * 문구는 한 글자마다 바뀌므로 잠깐 기다렸다 합성합니다.
   */
  useEffect(() => {
    if (phase !== "result") return;
    if (composedSigRef.current === composeSignature) return;
    const gen = runGenRef.current;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setComposing(true);
      void (async () => {
        try {
          const result = await compose(imagesForLayout(needed));
          if (!cancelled && runGenRef.current === gen) setComposite(result);
        } catch {
          if (!cancelled) setError("사진을 다시 꾸미지 못했습니다.");
        } finally {
          if (!cancelled) setComposing(false);
        }
      })();
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [phase, composeSignature, compose, imagesForLayout, needed]);

  const runSequence = async () => {
    if (!videoRef.current || !camera.ready || shooting) return;
    // 이 시퀀스의 세대를 기억해 두고, 도중에 초기화되거나 촬영 화면이 사라지면 조용히 중단합니다.
    const gen = ++runGenRef.current;
    const aborted = () => runGenRef.current !== gen || !videoRef.current;
    setShooting(true);
    setError(null);
    setShots([]);
    setShotIndex(0);
    setOrder([]);
    setSelectedSlot(null);
    setClip(null);
    setClipPending(false);
    setPrinted(false);
    ensureAudio(); // 사용자 제스처 안에서 오디오를 깨워둡니다 (iPad Safari 자동재생 정책)
    const frames: string[] = [];
    const timelapse = settings.timelapse ? startTimelapseCapture(() => videoRef.current) : null;
    try {
      for (let index = 0; index < totalShots; index += 1) {
        if (aborted()) return;
        setStatus(index < needed ? `${index + 1}번째 칸이에요` : `여분 ${index - needed + 1}번째예요`);
        for (let number = settings.countdown; number >= 1; number -= 1) {
          setCountdown(number);
          playBeep(number === 1 ? 1320 : 880, 80);
          await sleep(1000);
          if (aborted()) return;
        }
        setCountdown(null);
        setFlash(true);
        playShutter();
        await sleep(90);
        if (aborted()) return;
        const shot = await captureVideoFrame(
          videoRef.current,
          filter,
          ratio,
          captureWidth,
          settings.skinSmooth / 100,
          zoom,
        );
        frames.push(shot);
        setShots((previous) => [...previous, shot]);
        setShotIndex(index + 1);
        await sleep(180);
        setFlash(false);
        if (index < totalShots - 1) await sleep(650);
      }
      const snapshots = timelapse?.stop() ?? [];
      if (aborted()) return;
      playFanfare();
      // 타임랩스는 백그라운드에서 — 완성 화면 진입을 막지 않고, 끝나면 저장 버튼이 나타납니다.
      if (snapshots.length) {
        setClipPending(true);
        void buildTimelapse(snapshots).then((captured) => {
          if (runGenRef.current !== gen) {
            if (captured) URL.revokeObjectURL(captured.url);
            return;
          }
          setClipPending(false);
          if (captured) setClip(captured);
        });
      }
      // 스트림은 끄지 않고 유지 — '다시 찍기' 때 권한 팝업이 다시 뜨지 않습니다.
      camera.setReady(false);
      if (frames.length > needed) {
        // 여분이 있으면 바꾸기 화면 — 먼저 찍은 넷이 이미 칸에 들어간 상태로 시작합니다.
        setOrder(frames.map((_, index) => index));
        setPhase("swap");
        return;
      }
      setStatus("사진을 꾸미고 있어요");
      setSampleMode(false);
      setSourceShots(frames);
      const result = await compose(frames);
      if (aborted()) return;
      setComposite(result);
      setPhase("result");
    } catch (caught) {
      if (!aborted()) setError(caught instanceof Error ? caught.message : "촬영 중 문제가 생겼습니다.");
    } finally {
      timelapse?.stop(); // 중단 경로에서도 스냅샷 루프를 확실히 종료 (중복 호출 무해)
      setCountdown(null);
      setFlash(false);
      setShooting(false);
    }
  };

  /** 바꾸기: 처음 누르면 고르고, 다른 칸을 누르면 둘의 자리를 바꿉니다. 같은 칸을 다시 누르면 풉니다. */
  const tapSlot = (index: number) => {
    if (selectedSlot === null) {
      setSelectedSlot(index);
      return;
    }
    if (selectedSlot === index) {
      setSelectedSlot(null);
      return;
    }
    setOrder((previous) => swapSlots(previous, selectedSlot, index));
    setSelectedSlot(null);
  };

  const finishSwap = async () => {
    if (composing) return;
    // 합성 중 초기화되면 완료 시점에 결과 화면으로 되돌아가지 않도록 세대를 확인합니다.
    const gen = runGenRef.current;
    setComposing(true);
    setError(null);
    try {
      // 칸 순서가 앞, 여분은 뒤 — 완성 화면에서 더 많은 칸이 필요한 모양으로 바꿔도
      // 여분으로 채울 수 있게 전부 넘깁니다.
      setSampleMode(false);
      setSourceShots(orderedShots);
      const result = await compose(orderedShots.slice(0, needed));
      if (runGenRef.current !== gen) return;
      setComposite(result);
      setSelectedSlot(null);
      setPhase("result");
    } catch (caught) {
      if (runGenRef.current === gen)
        setError(caught instanceof Error ? caught.message : "사진을 만드는 중 문제가 생겼습니다.");
    } finally {
      setComposing(false);
    }
  };

  const openSample = async () => {
    setError(null);
    setPrinted(false);
    setSampleMode(true);
    setSourceShots([]);
    try {
      const result = await compose(makeSampleShots(needed, ratio));
      setComposite(result);
      setPhase("result");
    } catch {
      setError("샘플을 만들지 못했습니다.");
    }
  };

  const print = async () => {
    if (!composite) return;
    await printImage(composite);
    // 인쇄 창이 닫히면 "보냈어요"로 끝맺습니다. 취소했더라도 '한 장 더' 버튼으로 바로 되돌릴 수 있습니다.
    setPrinted(true);
  };

  const applySettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
    setFrameKey(next.defaultFrame);
    setLayoutKey(next.defaultLayout);
    setCaption(next.caption);
  };

  // 앱 화면 색은 프레임을 따라가지 않습니다 — styles.css 의 고정 팔레트 하나뿐입니다.
  // (프레임마다 화면 전체가 밝았다 어두웠다 하면 키오스크로 쓰기 산만하고,
  //  무엇을 고르는 건지도 헷갈립니다. 프레임은 인화물에만 적용됩니다.)
  return (
    // 촬영 화면만 뷰포트 높이에 고정(app--fit)합니다 — 뷰파인더가 남는 높이에 맞춰 줄어들어
    // 촬영 버튼이 접힘선 아래로 떨어지지 않게. 나머지 화면은 문서 스크롤을 씁니다.
    <div className={`app${phase === "camera" || phase === "swap" ? " app--fit" : ""}`}>
      {/* 상단 바: 시작·관리자에는 없고, 고르는 화면에는 되돌아가기 + 점 셋, 그 뒤로는 이름만. */}
      {back && (
        <header className="topbar no-print">
          <button className="ghost-button" onClick={back.go} disabled={shooting}>
            <Icon name="back" /> {back.label}
          </button>
          <StepDots current={phase === "shape" ? 1 : phase === "frame" ? 2 : 3} />
          <span />
        </header>
      )}
      {(phase === "swap" || phase === "result") && (
        <header className="topbar no-print">
          <span className="logo">{settings.title}</span>
        </header>
      )}

      {/* 프레임 화면의 오류(카메라)는 그 화면 안에 띄웁니다. */}
      {error && phase !== "start" && phase !== "frame" && (
        <p className="error no-print" role="alert">
          {error}
        </p>
      )}

      {phase === "start" && (
        <StartScreen
          title={settings.title}
          tagline={settings.tagline}
          samples={samples}
          onStart={goShape}
          onAdmin={() => setPhase("admin")}
        />
      )}

      {phase === "shape" && <ShapeScreen layouts={layouts} onPick={pickShape} />}

      {phase === "frame" && (
        <FrameScreen
          frames={orderedFrames}
          layout={layout}
          previews={previews}
          error={error}
          onPick={pickFrame}
        />
      )}

      {phase === "camera" && (
        <CaptureScreen
          videoRef={videoRef}
          glowVideoRef={glowVideoRef}
          previewFilter={previewFilterCss(filter)}
          glowFilter={glowFilterCss(filter)}
          glowStrength={filter.bloom ?? 0}
          layout={layout}
          frame={frame}
          tileSrc={tileSrc}
          slots={slots}
          activeIndex={activeIndex}
          camEdge={settings.camEdge}
          countdown={countdown}
          shotIndex={shotIndex}
          total={totalShots}
          shooting={shooting}
          ready={camera.ready}
          status={status}
          flash={flash}
          shots={shots}
          filters={FILTERS}
          filterKey={filterKey}
          film={filter.film}
          zoom={zoom}
          maxZoom={maxZoom}
          onZoom={setZoom}
          onFilter={setFilterKey}
          onShoot={() => void runSequence()}
        />
      )}

      {phase === "swap" && (
        <SwapScreen
          layout={layout}
          frame={frame}
          tileSrc={tileSrc}
          slots={slots}
          shots={orderedShots}
          selected={selectedSlot}
          busy={composing}
          onTap={tapSlot}
          onDone={() => void finishSwap()}
        />
      )}

      {phase === "result" && composite && (
        <ResultScreen
          composite={composite}
          layout={layout}
          layouts={layouts}
          frames={frames}
          frameKey={frameKey}
          caption={caption}
          copies={settings.copies}
          clip={clip}
          clipPending={clipPending}
          busy={composing}
          printed={printed}
          sample={sampleMode}
          secondsLeft={idleSecondsLeft}
          onFrame={setFrameKey}
          onLayout={setLayoutKey}
          onCaption={setCaption}
          onPrint={() => void print()}
          onShare={() => void shareImage(composite)}
          onSaveClip={() => clip && void shareClip(clip.blob, clip.ext)}
          onRestart={reset}
        />
      )}

      {phase === "admin" && (
        <AdminScreen
          settings={settings}
          onSave={applySettings}
          onClose={() => setPhase("start")}
          onSample={() => void openSample()}
        />
      )}

      {/* 인쇄 전용 — 관리자가 정한 매수만큼 페이지를 만듭니다(브라우저 인쇄 대화상자의 매수와 별개). */}
      {composite &&
        Array.from({ length: settings.copies }, (_, index) => (
          <img key={index} className="print-only print-image" src={composite} alt="인쇄용 사진" />
        ))}
    </div>
  );
}
