import { describe, expect, it } from "vitest";
import { DEFAULT_QUICK_FILTERS, DEFAULT_SETTINGS, visibleFilters } from "./settings";

describe("visibleFilters", () => {
  it("비우면 기본 넷", () => {
    const keys = visibleFilters({ ...DEFAULT_SETTINGS, enabledFilters: [] }).map((filter) => filter.key);
    expect(keys).toEqual(DEFAULT_QUICK_FILTERS);
  });

  it("고른 것만, FILTERS 순서로", () => {
    const keys = visibleFilters({ ...DEFAULT_SETTINGS, enabledFilters: ["pop", "mono"] }).map(
      (filter) => filter.key,
    );
    expect(keys).toEqual(["mono", "pop"]);
  });
});
