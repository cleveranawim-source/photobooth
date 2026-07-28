import { useMemo, useState } from "react";
import type { CamEdge, Settings } from "../types";
import { FRAMES } from "../config/frames";
import { LAYOUTS, findLayout, shotsNeeded } from "../config/layouts";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { Icon } from "../components/Icon";
import { FrameSwatch } from "../components/Previews";

type Props = {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
};

const CAM_EDGES: { key: CamEdge; label: string }[] = [
  { key: "top", label: "위 (13인치·가로 거치)" },
  { key: "left", label: "왼쪽" },
  { key: "right", label: "오른쪽" },
];

export function AdminScreen({ settings, onSave, onClose }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [draft, setDraft] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);

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
      <header className="screen-head">
        <h2>관리자 모드</h2>
        <p>바꾼 값은 이 기기에만 저장됩니다.</p>
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
              min={0}
              max={100}
              step={5}
              value={draft.skinSmooth}
              onChange={(event) => patch({ skinSmooth: Number(event.target.value) })}
            />
          </label>
        </div>
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
        <h3>카메라 위치</h3>
        <p className="admin-note">
          웹에서는 렌즈 위치를 알 수 없어 한 번만 지정해 둡니다. 카운트다운이 그쪽에 붙어
          아이들 시선이 렌즈로 향해요.
        </p>
        <div className="chip-list tight">
          {CAM_EDGES.map((edge) => (
            <button
              key={edge.key}
              className={`pill${draft.camEdge === edge.key ? " selected" : ""}`}
              onClick={() => patch({ camEdge: edge.key })}
            >
              {edge.label}
            </button>
          ))}
        </div>
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
        <button
          className="ghost-button"
          onClick={() => {
            setDraft(DEFAULT_SETTINGS);
            setSaved(false);
          }}
        >
          기본값으로 되돌리기
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
