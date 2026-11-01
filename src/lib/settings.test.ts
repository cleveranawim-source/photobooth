import { describe, expect, it } from "vitest";
import { DEFAULT_QUICK_FILTERS, DEFAULT_SETTINGS, normalizeSettings, visibleFilters } from "./settings";

describe("visibleFilters", () => {
  it("비우면 기본 일곱 — 원본·따뜻한 날·팝·노을·블루 아워·빈티지·흑백 순", () => {
    const names = visibleFilters({ ...DEFAULT_SETTINGS, enabledFilters: [] }).map((filter) => filter.name);
    expect(names).toEqual(["원본", "따뜻한 날", "팝", "노을", "블루 아워", "빈티지", "흑백"]);
    expect(DEFAULT_QUICK_FILTERS).toEqual(["none", "warmDay", "pop", "golden", "blueHour", "vintage", "mono"]);
  });

  it("고른 것만, FILTERS 순서로", () => {
    const keys = visibleFilters({ ...DEFAULT_SETTINGS, enabledFilters: ["mono", "pop"] }).map(
      (filter) => filter.key,
    );
    expect(keys).toEqual(["pop", "mono"]);
  });
});

describe("normalizeSettings — 렌즈 위치는 방향마다", () => {
  it("기본값: 가로는 위, 세로는 오른쪽 (2022년 이후 iPad 의 가로 렌즈)", () => {
    expect(normalizeSettings({}).camEdges).toEqual({ landscape: "top", portrait: "right" });
  });

  it("예전 camEdge 하나만 저장돼 있으면 가로 값으로 옮기고 세로는 기본", () => {
    expect(normalizeSettings({ camEdge: "left" }).camEdges).toEqual({ landscape: "left", portrait: "right" });
  });

  it("새 모양은 그대로, 모르는 값만 기본으로", () => {
    expect(normalizeSettings({ camEdges: { landscape: "bottom", portrait: "left" } }).camEdges).toEqual({
      landscape: "top",
      portrait: "left",
    });
  });
});
