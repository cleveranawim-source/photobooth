import { describe, expect, it } from "vitest";
import type { FilmGrade } from "../types";
import { applyLut3d, buildCurveLut, buildLut3d, gradePixel, LUT_SIZE, makeCurve } from "./filmGrade";

const LINEAR = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const identity: FilmGrade = { r: LINEAR, g: LINEAR, b: LINEAR };

const px = (grade: FilmGrade, r: number, g: number, b: number) =>
  gradePixel(grade, r / 255, g / 255, b / 255).map((v) => Math.round(v * 255));

describe("buildCurveLut — 부드러운 단조 곡선", () => {
  it("직선 제어점이면 그대로", () => {
    const lut = buildCurveLut(LINEAR);
    expect(lut[0]).toBe(0);
    expect(lut[128]).toBe(128);
    expect(lut[255]).toBe(255);
  });

  it("제어점을 지나고, 사이는 꺾이지 않고 단조롭게 이어진다", () => {
    const sCurve = [0, 0.05, 0.15, 0.35, 0.5, 0.65, 0.85, 0.95, 1];
    const curve = makeCurve(sCurve);
    sCurve.forEach((y, k) => expect(curve(k / 8)).toBeCloseTo(y, 6));
    const lut = buildCurveLut(sCurve);
    for (let i = 1; i < 256; i += 1) expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1]);
    // 선형 보간이라면 제어점에서 기울기가 0.8 만큼 뛴다 — 기울기가 이어져야(연속) 계조에 띠가 안 진다.
    const step = 1 / 1024;
    const slope = (x: number) => (curve(x + step) - curve(x)) / step;
    let maxJump = 0;
    for (let x = step; x < 1 - 2 * step; x += step) maxJump = Math.max(maxJump, Math.abs(slope(x + step) - slope(x)));
    expect(maxJump).toBeLessThan(0.1);
  });
});

describe("gradePixel — 색 단계", () => {
  it("아무것도 안 건드리면 그대로", () => {
    expect(px(identity, 200, 120, 60)).toEqual([200, 120, 60]);
  });

  it("채도 0 이면 무채색", () => {
    const [r, g, b] = px({ ...identity, saturation: 0 }, 200, 120, 60);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("페이드는 검정을 들고 흰색은 두며 중간톤은 조금만 민다", () => {
    const grade = { ...identity, fade: 0.2 };
    expect(px(grade, 0, 0, 0)[0]).toBe(Math.round(0.2 * 255));
    expect(px(grade, 255, 255, 255)[0]).toBe(255);
    const mid = px(grade, 128, 128, 128)[0];
    expect(mid).toBeGreaterThan(128);
    expect(mid).toBeLessThan(140);
  });

  it("분리 톤: 그림자는 차갑게, 밝은 부분은 따뜻하게 물든다", () => {
    const grade: FilmGrade = { ...identity, split: { shadows: [210, 0.5], highlights: [40, 0.5] } };
    const dark = px(grade, 40, 40, 40);
    const bright = px(grade, 220, 220, 220);
    expect(dark[2]).toBeGreaterThan(dark[0]); // 파랑 > 빨강
    expect(bright[0]).toBeGreaterThan(bright[2]); // 빨강 > 파랑
  });

  it("색조별 조정은 그 색조만 건드린다 — 초록만 빼면 살색은 그대로", () => {
    const grade: FilmGrade = { ...identity, hsl: { green: { sat: -1 } } };
    const skin = px(grade, 230, 180, 150);
    expect(skin).toEqual([230, 180, 150]);
    const [r, g, b] = px(grade, 60, 180, 70);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(12);
  });

  it("색조별 밝기 조정으로 살색만 밝힐 수 있다 (흑백 전환보다 먼저 적용)", () => {
    const grade: FilmGrade = { ...identity, hsl: { orange: { lum: 0.4 } }, saturation: 0 };
    const skin = px(grade, 230, 180, 150)[0];
    const plain = px({ ...identity, saturation: 0 }, 230, 180, 150)[0];
    expect(skin).toBeGreaterThan(plain + 8);
    const sky = px(grade, 120, 160, 230)[0];
    const plainSky = px({ ...identity, saturation: 0 }, 120, 160, 230)[0];
    expect(Math.abs(sky - plainSky)).toBeLessThanOrEqual(1);
  });
});

describe("3D 룩업표", () => {
  it("항등 룩업표는 픽셀을 바꾸지 않는다 (보간 오차 ≤1)", () => {
    const lut = buildLut3d(identity);
    expect(lut.length).toBe(LUT_SIZE * LUT_SIZE * LUT_SIZE * 3);
    const data = new Uint8ClampedArray([200, 120, 60, 255, 3, 250, 17, 255, 128, 128, 128, 255]);
    applyLut3d(data, lut);
    expect([...data]).toEqual([200, 120, 60, 255, 3, 250, 17, 255, 128, 128, 128, 255]);
  });

  it("룩업표를 거친 결과는 픽셀을 직접 계산한 것과 거의 같다", () => {
    const grade: FilmGrade = {
      r: [0.03, 0.16, 0.3, 0.44, 0.57, 0.69, 0.8, 0.9, 0.98],
      g: [0.02, 0.15, 0.29, 0.43, 0.56, 0.68, 0.79, 0.89, 0.97],
      b: [0.05, 0.15, 0.26, 0.37, 0.48, 0.59, 0.7, 0.81, 0.91],
      saturation: 1.1,
      vibrance: 0.3,
      hsl: { green: { hue: -15, sat: -0.3 }, orange: { lum: 0.1 } },
      split: { shadows: [200, 0.3], highlights: [45, 0.3] },
      fade: 0.06,
    };
    const lut = buildLut3d(grade);
    const samples = [
      [200, 120, 60],
      [60, 180, 70],
      [120, 160, 230],
      [250, 250, 250],
      [10, 12, 30],
      [230, 180, 150],
    ];
    for (const [r, g, b] of samples) {
      const data = new Uint8ClampedArray([r, g, b, 255]);
      applyLut3d(data, lut);
      const direct = px(grade, r, g, b);
      for (let c = 0; c < 3; c += 1) expect(Math.abs(data[c] - direct[c])).toBeLessThanOrEqual(3);
    }
  });
});
