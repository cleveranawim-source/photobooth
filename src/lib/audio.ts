// Web Audio 로 합성 — 오디오 파일 없이 동작합니다.
// AudioContext 는 사용자 제스처(촬영 시작 버튼) 안에서 resume 해야 iPad Safari 에서 소리가 납니다.
let audioContext: AudioContext | null = null;

export function ensureAudio(): AudioContext | null {
  try {
    if (!audioContext) audioContext = new AudioContext();
    // iOS WebKit 은 전화·Siri 인터럽션 후 비표준 "interrupted" 상태가 될 수 있어
    // "suspended" 만이 아니라 running 이 아닌 모든 상태에서 resume 합니다.
    if (audioContext.state !== "running") audioContext.resume().catch(() => undefined);
    return audioContext;
  } catch {
    return null;
  }
}

/** 카운트다운 틱 — 마지막 1초는 높은 음으로 긴장감을 줍니다. */
export function playBeep(frequency: number, durationMs: number, volume = 0.12) {
  const context = ensureAudio();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + durationMs / 1000);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + durationMs / 1000);
}

/** 셔터음 — 짧은 화이트노이즈 + 로우패스로 "찰칵" 느낌을 만듭니다. */
export function playShutter() {
  const context = ensureAudio();
  if (!context) return;
  const length = Math.floor(context.sampleRate * 0.09);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2600;
  const gain = context.createGain();
  gain.gain.value = 0.3;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start();
}

/** 촬영 완료 — 짧은 상승 3음. */
export function playFanfare() {
  [0, 110, 220].forEach((delay, index) => {
    window.setTimeout(() => playBeep([880, 1108, 1318][index], 150, 0.1), delay);
  });
}
