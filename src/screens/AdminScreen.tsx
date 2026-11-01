import { useMemo, useState } from "react";
import type { CamEdge, Orientation, Settings } from "../types";
import { FRAMES } from "../config/frames";
import { FILTERS } from "../config/filters";
import { LAYOUTS, findLayout, shotsNeeded } from "../config/layouts";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { Icon } from "../components/Icon";
import { FrameSwatch } from "../components/Previews";
import { useIdleReset } from "../hooks/useKiosk";
import { useOrientation } from "../hooks/useOrientation";

type Props = {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
  /** 카메라 없이 샘플 인화물로 완성 화면을 열어 봅니다(운영자 확인용). */
  onSample: () => void;
};

const CAM_EDGES: { key: CamEdge; label: string }[] = [
  { key: "top", label: "위" },
  { key: "left", label: "왼쪽" },
  { key: "right", label: "오른쪽" },
];

const ORIENTATIONS: { key: Orientation; label: string }[] = [
  { key: "landscape", label: "가로로 세웠을 때" },
  { key: "portrait", label: "세로로 세웠을 때" },
];

export function AdminScreen({ settings, onSave, onClose, onSample }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [draft, setDraft] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);
  const orientation = useOrientation();
  // "기본값으로 되돌리기"는 저장 버튼 바로 옆이라 한 번 더 묻습니다.
  const [confirmReset, setConfirmReset] = useState(false);

  // PIN 화면을 열어 둔 채 자리를 뜨면 키오스크가 거기서 멈춥니다 — 손님이 제목을 길게 눌러
  // 우연히 들어올 수도 있어서, 방치되면 환영 화면으로 돌려보냅니다. 잠금을 푼 뒤에는
  // 설정을 고치는 중일 수 있으니 걸지 않습니다.
  useIdleReset(!unlocked, settings.idleSeconds, onClose);

  const patch = (changes: Partial<Settings>) => {
    setDraft((previous) => ({ ...previous, ...changes }));
    setSaved(false);
  };

  const toggleIn = (list: string[], key: string) =>
    list.includes(key) ? list.filter((item) => item !== key) : [...list, key];

  // 켜 둔 레이아웃 중 가장 많은 사진이 필요한 값 — 촬영 컷 수가 이보다 적으면 안 됩니다.
  const minShots = useMemo(() => {
    const enabled = draft.enabledLayouts.length
      ? draft.enabledLayouts
      : LAYOUTS.map((layout) => layout.key);
    return Math.max(...enabled.map((key) => shotsNeeded(findLayout(key))));
  }, [draft.enabledLayouts]);

  if (!unlocked) {
    return (
      <main className="admin-gate no-print">
        <Icon name="lock" />
        <h2>관리자 모드</h2>
        <p>PIN 네 자리를 입력하세요.</p>
        <input
          className="text-field pin"
          type="password"
          inputMode="numeric"
          autoFocus
          maxLength={4}
          value={pinInput}
          onChange={(event) => {
            const value = event.target.value.replace(/\D/g, "");
            setPinInput(value);
            setPinError(false);
            if (value.length === 4) {
              if (value === settings.pin) setUnlocked(true);
              else {
                setPinError(true);
                setPinInput("");
              }
            }
          }}
        />
        {pinError && <p className="admin-error">PIN이 맞지 않습니다.</p>}
        <button className="ghost-button" onClick={onClose}>
          돌아가기
        </button>
      </main>
    );
  }

  return (
    <main className="admin no-print">
      <header className="screen-head admin-head">
        <div>
          <h2>관리자 모드</h2>
          <p>바꾼 값은 이 기기에만 저장됩니다.</p>
        </div>
        <button className="ghost-button" onClick={onClose}>
          닫기
        </button>
      </header>

      <section className="admin-group">
        <h3>인화물에 찍히는 문구</h3>
        <label>
          이름
          <input
            className="text-field"
            value={draft.title}
            maxLength={24}
            onChange={(event) => patch({ title: event.target.value })}
          />
        </label>
        <label>
          영문 문구 (이름 아래 작은 글씨)
          <input
            className="text-field"
            value={draft.tagline}
            maxLength={32}
            onChange={(event) => patch({ tagline: event.target.value })}
          />
        </label>
        <label>
          기본 문구 (손님이 바꿀 수 있음)
          <input
            className="text-field"
            value={draft.caption}
            maxLength={20}
            onChange={(event) => patch({ caption: event.target.value })}
          />
        </label>
      </section>

      <section className="admin-group">
        <h3>촬영·인쇄</h3>
        <div className="admin-row">
          <label>
            인쇄 매수
            <input
              className="text-field short"
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              value={draft.copies}
              onChange={(event) => patch({ copies: Number(event.target.value) })}
            />
          </label>
          <label>
            촬영 컷 수 (최소 {minShots})
            <input
              className="text-field short"
              type="number"
              inputMode="numeric"
              min={minShots}
              max={8}
              value={draft.shootCount}
              onChange={(event) => patch({ shootCount: Number(event.target.value) })}
            />
          </label>
          <label>
            카운트다운 (초)
            <input
              className="text-field short"
              type="number"
              inputMode="numeric"
              min={3}
              max={10}
              value={draft.countdown}
              onChange={(event) => patch({ countdown: Number(event.target.value) })}
            />
          </label>
          <label>
            자동 초기화 (초)
            <input
              className="text-field short"
              type="number"
              inputMode="numeric"
              min={20}
              max={600}
              value={draft.idleSeconds}
              onChange={(event) => patch({ idleSeconds: Number(event.target.value) })}
            />
          </label>
          <label>
            피부 보정 (0~100)
            <input
              className="text-field short"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={5}
              value={draft.skinSmooth}
              onChange={(event) => patch({ skinSmooth: Number(event.target.value) })}
            />
          </label>
        </div>
        <p className="admin-note">
          촬영 컷 수를 칸 수와 같게 두면 &lsquo;바꾸기&rsquo; 화면이 사라지고 바로 완성으로 가요.
        </p>
        <p className="admin-note">
          피부 보정은 결과물에만 들어갑니다 — 촬영 화면에서는 보이지 않아요. 볼·이마의 결만
          정리하고 눈매와 머리카락은 그대로 둡니다. 0 이면 끕니다. 너무 올리면 인화했을 때
          얼굴이 밋밋해 보이니 40 안팎을 권합니다.
        </p>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={draft.timelapse}
            onChange={(event) => patch({ timelapse: event.target.checked })}
          />
          촬영 과정 타임랩스 영상 만들기
        </label>
      </section>

      <section className="admin-group">
        <h3>카메라 렌즈 위치</h3>
        <p className="admin-note">
          웹에서는 렌즈 위치를 알 수 없어 여기서 지정해 둡니다. 촬영 중 &lsquo;여기를 봐요!&rsquo;가 그쪽
          화면 끝에 붙어 아이들 시선이 렌즈로 향해요. iPad 를 돌리면 같은 렌즈가 다른 변으로 가므로
          방향마다 따로 고릅니다. 렌즈가 짧은 변에 있는 iPad(2021년까지)는 세로일 때 위, 가로일 때
          렌즈 쪽 옆이고, 긴 변에 있는 2022년 이후 iPad(10세대·Air M2/M3·Pro M4)는 가로일 때 위, 세로일 때
          옆이에요. 지금 이 iPad 는 {orientation === "portrait" ? "세로" : "가로"}로 서 있어요.
        </p>
        {ORIENTATIONS.map((item) => (
          <div key={item.key} className={`edge-pick${orientation === item.key ? " current" : ""}`}>
            <strong>{item.label}</strong>
            <div className="chip-list tight">
              {CAM_EDGES.map((edge) => (
                <button
                  key={edge.key}
                  className={`pill${draft.camEdges[item.key] === edge.key ? " selected" : ""}`}
                  onClick={() => patch({ camEdges: { ...draft.camEdges, [item.key]: edge.key } })}
                >
                  {edge.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="admin-note">
          가로로 세우면 더 넓게 찍혀 단체 촬영에 좋고, 세로는 폭이 좁아 한두 명에 맞아요(카메라 프레임이
          방향을 따라 돌기 때문). 2×2 격자·가로 띠처럼 세로로 긴 칸은 세로로 세웠을 때 화질이 더 좋습니다.
        </p>
      </section>

      <section className="admin-group">
        <h3>손님에게 보여줄 레이아웃</h3>
        <p className="admin-note">아무것도 고르지 않으면 전부 보여줍니다.</p>
        <div className="chip-list tight">
          {LAYOUTS.map((layout) => (
            <button
              key={layout.key}
              className={`pill${draft.enabledLayouts.includes(layout.key) ? " selected" : ""}`}
              onClick={() => patch({ enabledLayouts: toggleIn(draft.enabledLayouts, layout.key) })}
            >
              {layout.name}
            </button>
          ))}
        </div>
        <label>
          기본 레이아웃
          <select
            className="text-field"
            value={draft.defaultLayout}
            onChange={(event) => patch({ defaultLayout: event.target.value })}
          >
            {LAYOUTS.map((layout) => (
              <option key={layout.key} value={layout.key}>
                {layout.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="admin-group">
        <h3>손님에게 보여줄 프레임</h3>
        <p className="admin-note">아무것도 고르지 않으면 전부 보여줍니다. 행사 로고 프레임은 손님 화면 맨 앞에 옵니다.</p>
        <div className="chip-list">
          {FRAMES.map((frame) => (
            <button
              key={frame.key}
              className={`frame-chip${draft.enabledFrames.includes(frame.key) ? " selected" : ""}`}
              onClick={() => patch({ enabledFrames: toggleIn(draft.enabledFrames, frame.key) })}
            >
              <FrameSwatch frame={frame} />
              <span>
                <strong>{frame.name}</strong>
              </span>
            </button>
          ))}
        </div>
        <label>
          기본 프레임
          <select
            className="text-field"
            value={draft.defaultFrame}
            onChange={(event) => patch({ defaultFrame: event.target.value })}
          >
            {FRAMES.map((frame) => (
              <option key={frame.key} value={frame.key}>
                {frame.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="admin-group">
        <h3>손님에게 보여줄 필터</h3>
        <p className="admin-note">
          아무것도 고르지 않으면 원본·따뜻한 날·팝·노을·블루 아워·빈티지·흑백 일곱을 보여줍니다. 촬영 전에
          고르고, 완성 화면에서도 바꿀 수 있어요. 많이 켤수록 촬영 화면이 복잡해져요.
        </p>
        <div className="chip-list tight">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              className={`pill${draft.enabledFilters.includes(item.key) ? " selected" : ""}`}
              onClick={() => patch({ enabledFilters: toggleIn(draft.enabledFilters, item.key) })}
            >
              {item.name}
            </button>
          ))}
        </div>
      </section>

      <section className="admin-group">
        <h3>관리자 PIN</h3>
        <input
          className="text-field short"
          inputMode="numeric"
          maxLength={4}
          value={draft.pin}
          onChange={(event) => patch({ pin: event.target.value.replace(/\D/g, "") })}
        />
        {!/^\d{4}$/.test(draft.pin) && <p className="admin-error">숫자 네 자리로 입력하세요.</p>}
      </section>

      <div className="admin-actions">
        {confirmReset ? (
          <span className="confirm-row" role="group" aria-label="기본값으로 되돌리기 확인">
            <span>입력한 값을 모두 기본값으로 바꿀까요?</span>
            <button
              className="ghost-button danger"
              onClick={() => {
                setDraft(DEFAULT_SETTINGS);
                setSaved(false);
                setConfirmReset(false);
              }}
            >
              되돌리기
            </button>
            <button className="ghost-button" onClick={() => setConfirmReset(false)}>
              취소
            </button>
          </span>
        ) : (
          <button className="ghost-button" onClick={() => setConfirmReset(true)}>
            기본값으로 되돌리기
          </button>
        )}
        <button className="ghost-button" onClick={onSample}>
          샘플 인화물 보기
        </button>
        <button className="ghost-button" onClick={onClose}>
          닫기
        </button>
        <button
          className="primary-button"
          disabled={!/^\d{4}$/.test(draft.pin)}
          onClick={() => {
            onSave({ ...draft, shootCount: Math.max(draft.shootCount, minShots) });
            setSaved(true);
          }}
        >
          <Icon name="check" /> {saved ? "저장했어요" : "저장"}
        </button>
      </div>
    </main>
  );
}
