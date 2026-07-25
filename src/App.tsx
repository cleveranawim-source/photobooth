import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Phase, Settings } from "./types";
import { FILTERS, findFilter } from "./config/filters";
import { findFrame } from "./config/frames";
import { cellRatio, findLayout, shotsNeeded } from "./config/layouts";
import { ensureAudio, playBeep, playFanfare, playShutter } from "./lib/audio";
import { sleep } from "./lib/canvas";
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
import { usePrintPreviews } from "./hooks/usePrintPreviews";
import { WelcomeScreen } from "./screens/WelcomeScreen";
import { CaptureScreen } from "./screens/CaptureScreen";
import { SelectScreen } from "./screens/SelectScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { AdminScreen } from "./screens/AdminScreen";

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [phase, setPhase] = useState<Phase>("welcome");
  const [frameKey, setFrameKey] = useState(settings.defaultFrame);
  const [layoutKey, setLayoutKey] = useState(settings.defaultLayout);
  const [filterKey, setFilterKey] = useState("none");
  const [caption, setCaption] = useState(settings.caption);

  const [shots, setShots] = useState<string[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [composing, setComposing] = useState(false);
  const [composite, setComposite] = useState<string | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  // 타임랩스를 실제로 만들고 있는 중일 때만 "만드는 중" 안내를 띄웁니다
  // (샘플 둘러보기처럼 촬영을 안 한 경우엔 영원히 안 나올 영상을 기다리게 두면 안 됩니다).
  const [clipPending, setClipPending] = useState(false);

  const [shooting, setShooting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shotIndex, setShotIndex] = useState(0);
  const [flash, setFlash] = useState(false);
  const [status, setStatus] = useState("준비되면 촬영 버튼을 눌러주세요");
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const glowVideoRef = useRef<HTMLVideoElement>(null);
  // 촬영 시퀀스의 세대 번호. 초기화 등으로 증가하면 진행 중이던 시퀀스가 스스로 중단됩니다.
  const runGenRef = useRef(0);

  const camera = useCamera();
  useWakeLock();

  const frame = findFrame(frameKey);
  const layout = findLayout(layoutKey);
  const filter = findFilter(filterKey);
  const frames = useMemo(() => visibleFrames(settings), [settings]);
  const layouts = useMemo(() => visibleLayouts(settings), [settings]);
  const needed = shotsNeeded(layout);
  const ratio = cellRatio(layout);
  // 레이아웃이 필요한 수보다 적게 찍을 수는 없습니다.
  const totalShots = Math.max(settings.shootCount, needed);
  // 촬영 캔버스를 합성 시 차지할 픽셀 폭에 맞춰 잡으면 1:1 로 들어가 다시 스케일되지 않습니다.
  const captureWidth = Math.round(layout.cells[0].w * 2);

  const previews = usePrintPreviews({
    frames,
    layouts,
    frame,
    layout,
    title: settings.title,
    tagline: settings.tagline,
    caption,
  });

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
  const attachCamera = camera.attach;
  useEffect(() => {
    if (phase !== "camera") return;
    return attachCamera([videoRef.current, glowVideoRef.current]);
  }, [phase, filterKey, attachCamera]);

  const stopCamera = camera.stop;
  const reset = useCallback(() => {
    runGenRef.current += 1; // 진행 중일 수 있는 촬영 시퀀스 중단
    stopCamera(); // 환영 화면에서는 카메라 표시등이 꺼지도록
    setPhase("welcome");
    setComposite(null);
    setClip(null);
    setClipPending(false);
    setShots([]);
    setPicked([]);
    setShotIndex(0);
    setError(null);
  }, [stopCamera]);

  useIdleReset(phase === "result" || phase === "select", settings.idleSeconds, reset);

  const startCamera = async () => {
    setError(null);
    setComposite(null);
    setShots([]);
    setPicked([]);
    setShotIndex(0);
    if (await camera.start()) {
      setPhase("camera");
      setStatus("준비되면 촬영 버튼을 눌러주세요");
    }
  };

  const compose = useCallback(
    (images: string[]) =>
      composePrint({
        images,
        frame,
        layout,
        title: settings.title,
        tagline: settings.tagline,
        caption,
      }),
    [frame, layout, settings.title, settings.tagline, caption],
  );

  const runSequence = async () => {
    if (!videoRef.current || !camera.ready || shooting) return;
    // 이 시퀀스의 세대를 기억해 두고, 도중에 초기화되거나 촬영 화면이 사라지면 조용히 중단합니다.
    const gen = ++runGenRef.current;
    const aborted = () => runGenRef.current !== gen || !videoRef.current;
    setShooting(true);
    setError(null);
    setShots([]);
    setShotIndex(0);
    setPicked([]);
    setClip(null);
    setClipPending(false);
    ensureAudio(); // 사용자 제스처 안에서 오디오를 깨워둡니다 (iPad Safari 자동재생 정책)
    const frames: string[] = [];
    const timelapse = settings.timelapse ? startTimelapseCapture(() => videoRef.current) : null;
    try {
      for (let index = 0; index < totalShots; index += 1) {
        if (aborted()) return;
        setStatus(`${index + 1}번째 사진을 준비하세요`);
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
        const shot = await captureVideoFrame(videoRef.current, filter, ratio, captureWidth);
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
        setPhase("select");
        return;
      }
      setStatus("사진을 꾸미고 있어요");
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

  const togglePick = (index: number) => {
    setPicked((previous) => {
      if (previous.includes(index)) return previous.filter((item) => item !== index);
      if (previous.length >= needed) return previous;
      return [...previous, index];
    });
  };

  const finishSelect = async () => {
    if (picked.length !== needed || composing) return;
    // 합성 중 초기화되면 완료 시점에 결과 화면으로 되돌아가지 않도록 세대를 확인합니다.
    const gen = runGenRef.current;
    setComposing(true);
    setError(null);
    try {
      const result = await compose(picked.map((index) => shots[index]));
      if (runGenRef.current !== gen) return;
      setComposite(result);
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
    try {
      const result = await compose(makeSampleShots(needed, ratio));
      setComposite(result);
      setPhase("result");
    } catch {
      setError("샘플을 만들지 못했습니다.");
    }
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
    <div className="app">
      {phase !== "admin" && (
        <header className="topbar no-print">
          <button className="logo" onClick={reset} disabled={shooting}>
            {settings.title}
          </button>
          {phase !== "welcome" && <span className="frame-name">{frame.name}</span>}
        </header>
      )}

      {error && (
        <p className="error no-print" role="alert">
          {error}
        </p>
      )}

      {phase === "welcome" && (
        <WelcomeScreen
          title={settings.title}
          tagline={settings.tagline}
          frame={frame}
          frames={frames}
          layouts={layouts}
          filters={FILTERS}
          frameKey={frameKey}
          layoutKey={layoutKey}
          filterKey={filterKey}
          caption={caption}
          shootCount={totalShots}
          previews={previews}
          onFrame={setFrameKey}
          onLayout={setLayoutKey}
          onFilter={setFilterKey}
          onCaption={setCaption}
          onStart={() => void startCamera()}
          onSample={() => void openSample()}
          onAdmin={() => setPhase("admin")}
        />
      )}

      {phase === "camera" && (
        <CaptureScreen
          videoRef={videoRef}
          glowVideoRef={glowVideoRef}
          previewFilter={previewFilterCss(filter)}
          glowFilter={glowFilterCss(filter)}
          glowStrength={filter.bloom ?? 0}
          ratio={ratio}
          camEdge={settings.camEdge}
          countdown={countdown}
          shotIndex={shotIndex}
          total={totalShots}
          shooting={shooting}
          ready={camera.ready}
          status={status}
          flash={flash}
          resolution={camera.resolution}
          onShoot={() => void runSequence()}
          onBack={reset}
        />
      )}

      {phase === "select" && (
        <SelectScreen
          shots={shots}
          picked={picked}
          needed={needed}
          ratio={ratio}
          busy={composing}
          onToggle={togglePick}
          onDone={() => void finishSelect()}
          onRetake={() => void startCamera()}
        />
      )}

      {phase === "result" && composite && (
        <ResultScreen
          composite={composite}
          layout={layout}
          copies={settings.copies}
          clip={clip}
          clipPending={clipPending}
          onPrint={() => printImage(composite)}
          onShare={() => void shareImage(composite)}
          onSaveClip={() => clip && void shareClip(clip.blob, clip.ext)}
          onRestart={reset}
        />
      )}

      {phase === "admin" && (
        <AdminScreen settings={settings} onSave={applySettings} onClose={() => setPhase("welcome")} />
      )}

      {/* 인쇄 전용 — 관리자가 정한 매수만큼 페이지를 만듭니다(브라우저 인쇄 대화상자의 매수와 별개). */}
      {composite &&
        Array.from({ length: settings.copies }, (_, index) => (
          <img key={index} className="print-only print-image" src={composite} alt="인쇄용 사진" />
        ))}
    </div>
  );
}
