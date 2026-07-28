#!/usr/bin/env python3
"""
필터 앱이 적용한 룩을 photobooth 의 FilmGrade 로 역산합니다.

    tools/.venv/bin/python tools/fit-filter.py 내보낸사진.jpg --name "Dazz Classic" --key dazzClassic

원리
  FilmGrade 는 채도 → 채널별 톤커브 → 그레인 순서로 적용됩니다.
  차트의 **중성 회색 패치는 R=G=B 라 채도 단계를 통과해도 값이 변하지 않으므로**,
  그 출력이 곧 채널별 톤커브입니다. 커브를 먼저 확정한 뒤, 컬러 패치에서
  "채도 s 를 넣고 그 커브를 태웠을 때 측정값과 가장 가까워지는 s" 를 1차원 탐색합니다.

  비네팅을 넣는 앱이 많아서, 같은 회색 감시 패치 5개로 반경 방향 감쇠를 먼저 모델링하고
  (gain = 1 + k·r²) 모든 측정값을 보정한 뒤에 커브를 뜹니다. 이걸 빼먹으면 바깥쪽 패치가
  어둡게 측정돼 커브 전체가 아래로 눌립니다.

한계
  · 앱이 넣는 라이트리크·색수차·국소 대비(clarity) 처럼 위치마다 다른 효과는 담기지 않습니다.
    FilmGrade 가 표현할 수 있는 전역 색 변환만 뽑아냅니다.
  · 얼굴을 인식해 피부만 따로 보정하는 앱(SODA·SNOW 계열)은 차트로 재현되지 않습니다.
  · 그레인은 **낮게 잡힙니다**. 알갱이는 거의 순수한 고주파라 JPEG 양자화가 먼저 지웁니다.
    알려진 값 0.35 를 넣고 왕복시켜 봤을 때 0.23 이 나왔으므로(비네팅 18%+1080 축소+q92),
    눈으로 보고 1.5배쯤 올려 잡는 편이 실제에 가깝습니다. 커브·채도는 이 영향을 받지 않습니다
    (오차 0.006 이하 — 255단계로 2 미만).
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms

CHART_DIR = Path(__file__).resolve().parent / "chart"


# ── 이미지 읽기 ────────────────────────────────────────────────────────
def load_srgb(path: Path) -> np.ndarray:
    """사진을 sRGB 로 맞춰 읽습니다. 아이폰 내보내기는 Display P3 인 경우가 많습니다."""
    image = Image.open(path)
    icc = image.info.get("icc_profile")
    if icc:
        try:
            source = ImageCms.ImageCmsProfile(__import__("io").BytesIO(icc))
            name = ImageCms.getProfileDescription(source).strip()
            if "sRGB" not in name:
                print(f"  색공간 변환: {name} → sRGB")
                image = ImageCms.profileToProfile(
                    image, source, ImageCms.createProfile("sRGB"), outputMode="RGB"
                )
        except Exception as error:  # 프로파일이 깨져 있어도 진행합니다
            print(f"  (색공간 변환 건너뜀: {error})")
    return np.asarray(image.convert("RGB"), dtype=np.float64)


# ── 기준점 검출 ────────────────────────────────────────────────────────
def find_markers(gray: np.ndarray, expected_px: float) -> list[tuple[float, float]]:
    """네 귀퉁이의 검은 사각형 중심을 찾습니다."""
    height, width = gray.shape
    frac = 0.16
    box_w, box_h = int(width * frac), int(height * frac)
    regions = [
        (0, 0, box_w, box_h),
        (width - box_w, 0, width, box_h),
        (0, height - box_h, box_w, height),
        (width - box_w, height - box_h, width, height),
    ]

    centers = []
    for x0, y0, x1, y1 in regions:
        sub = gray[y0:y1, x0:x1]
        # 흰 여백 속 검은 사각형이라 국소 대비가 확실합니다. 비네팅이 있어도 유지됩니다.
        threshold = sub.min() + (sub.max() - sub.min()) * 0.4
        mask = sub <= threshold
        if mask.sum() < 16:
            raise SystemExit("기준점을 찾지 못했습니다 — 차트를 자르지 않고 내보냈는지 확인하세요.")
        ys, xs = np.nonzero(mask)
        cx, cy = xs.mean(), ys.mean()
        # 한 번 더 좁혀 잡습니다 — 근처 패치가 걸려 들었을 때 중심이 끌려가는 걸 막습니다.
        half = expected_px * 0.9
        keep = (np.abs(xs - cx) < half) & (np.abs(ys - cy) < half)
        if keep.sum() >= 16:
            xs, ys = xs[keep], ys[keep]
        area_ratio = len(xs) / (expected_px**2)
        if not 0.4 < area_ratio < 2.5:
            print(f"  경고: 기준점 넓이가 예상의 {area_ratio:.2f}배입니다(1.0 이 정상)")
        centers.append((x0 + xs.mean(), y0 + ys.mean()))
    return centers


def fit_affine(chart_pts, image_pts):
    """차트 좌표 → 사진 좌표 아핀 변환. 축소·이동·약간의 회전을 함께 흡수합니다."""
    A, bx, by = [], [], []
    for (cx, cy), (ix, iy) in zip(chart_pts, image_pts):
        A.append([cx, cy, 1])
        bx.append(ix)
        by.append(iy)
    A = np.array(A)
    px, *_ = np.linalg.lstsq(A, np.array(bx), rcond=None)
    py, *_ = np.linalg.lstsq(A, np.array(by), rcond=None)
    residual = max(
        abs(np.array(A) @ px - np.array(bx)).max(),
        abs(np.array(A) @ py - np.array(by)).max(),
    )
    return (px, py), residual


def to_image(point, transform):
    px, py = transform
    x, y = point
    return px[0] * x + px[1] * y + px[2], py[0] * x + py[1] * y + py[2]


# ── 패치 측정 ──────────────────────────────────────────────────────────
def sample_patch(pixels: np.ndarray, rect, transform, shrink=0.55):
    """패치 안쪽만 잘라 채널별 중앙값을 냅니다. 중앙값이라 그레인·먼지에 흔들리지 않습니다."""
    x0, y0, x1, y1 = rect
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    half_w, half_h = (x1 - x0) / 2 * shrink, (y1 - y0) / 2 * shrink
    corners = [
        to_image((cx - half_w, cy - half_h), transform),
        to_image((cx + half_w, cy - half_h), transform),
        to_image((cx - half_w, cy + half_h), transform),
        to_image((cx + half_w, cy + half_h), transform),
    ]
    xs = [c[0] for c in corners]
    ys = [c[1] for c in corners]
    # 회전이 있어도 확실히 패치 안쪽인 영역만 씁니다.
    left, right = int(np.ceil(max(xs[0], xs[2]))), int(np.floor(min(xs[1], xs[3])))
    top, bottom = int(np.ceil(max(ys[0], ys[1]))), int(np.floor(min(ys[2], ys[3])))
    height, width = pixels.shape[:2]
    left, top = max(0, left), max(0, top)
    right, bottom = min(width, right), min(height, bottom)
    if right - left < 3 or bottom - top < 3:
        raise SystemExit("패치 영역이 너무 작습니다 — 내보낸 사진이 지나치게 작지 않은지 확인하세요.")
    region = pixels[top:bottom, left:right]
    return np.median(region.reshape(-1, 3), axis=0), region


# ── 비네팅 ─────────────────────────────────────────────────────────────
def fit_vignette(guards, chart_size):
    """감시 패치 5개로 gain = g0·(1 + k·r²) 를 맞춥니다. r 은 중심에서의 정규화 거리."""
    radii, values = [], []
    for patch, measured, _ in guards:
        cx, cy = patch["center"]
        nx = (cx - chart_size / 2) / (chart_size / 2)
        ny = (cy - chart_size / 2) / (chart_size / 2)
        radii.append(nx * nx + ny * ny)  # r²
        values.append(float(np.mean(measured)))
    radii = np.array(radii)
    values = np.array(values)
    # values ≈ g0 + g0·k·r²  → 선형 회귀 후 k = 기울기/절편
    A = np.stack([np.ones_like(radii), radii], axis=1)
    (g0, slope), *_ = np.linalg.lstsq(A, values, rcond=None)
    k = slope / g0 if g0 > 1e-6 else 0.0
    return g0, k


def vignette_gain(patch, k, chart_size):
    cx, cy = patch["center"]
    nx = (cx - chart_size / 2) / (chart_size / 2)
    ny = (cy - chart_size / 2) / (chart_size / 2)
    return 1 + k * (nx * nx + ny * ny)


# ── 커브 ───────────────────────────────────────────────────────────────
def build_lut(table: list[float]) -> np.ndarray:
    """filmGrade.ts 의 buildLut 과 같은 식입니다(9제어점 선형보간 → 256칸)."""
    n = len(table) - 1
    lut = np.empty(256)
    for i in range(256):
        t = (i / 255) * n
        k = min(n - 1, int(np.floor(t)))
        f = t - k
        lut[i] = round((table[k] + (table[k + 1] - table[k]) * f) * 255)
    return lut


def fit_curve(neutrals) -> dict[str, list[float]]:
    """중성 패치의 입력→출력 관계를 9개 제어점으로 줄입니다."""
    inputs = np.array([p["rgb"][0] for p, _, _ in neutrals], dtype=float)
    order = np.argsort(inputs)
    inputs = inputs[order]
    curves = {}
    for channel in range(3):
        outputs = np.array([m[channel] for _, m, _ in neutrals], dtype=float)[order]
        control = np.interp(np.linspace(0, 255, 9), inputs, outputs) / 255
        control = np.clip(control, 0, 1)
        monotone = np.maximum.accumulate(control)
        if np.max(np.abs(monotone - control)) > 0.006:
            print("  경고: 커브가 단조롭지 않습니다 — 측정 잡음이거나 국소 보정을 쓰는 앱입니다")
        curves["rgb"[channel]] = [round(float(v), 4) for v in monotone]
    return curves


def saturate_matrix(s: float) -> np.ndarray:
    return np.array([
        [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
        [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
        [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
    ])


def fit_saturation(colors, curves) -> tuple[float, float]:
    """채도 → 커브 순서로 넣었을 때 컬러 패치를 가장 잘 맞히는 s 를 찾습니다."""
    luts = [build_lut(curves[c]) for c in "rgb"]
    inputs = np.array([p["rgb"] for p, _, _ in colors], dtype=float)
    measured = np.array([m for _, m, _ in colors], dtype=float)

    best_s, best_error = 1.0, float("inf")
    for s in np.arange(0.0, 2.0005, 0.005):
        shifted = np.clip(inputs @ saturate_matrix(s).T, 0, 255)
        index = np.rint(shifted).astype(int)
        predicted = np.stack([luts[c][index[:, c]] for c in range(3)], axis=1)
        error = float(np.mean((predicted - measured) ** 2))
        if error < best_error:
            best_s, best_error = float(s), error
    return best_s, np.sqrt(best_error)


# ── 그레인 ─────────────────────────────────────────────────────────────
def estimate_grain(neutrals, guards) -> tuple[float, float]:
    """중간톤 패치의 평면 제거 후 잔차 표준편차 → grain = std / 8.66.

    filmGrade.ts 는 진폭 `grain×30` 인 균등난수를 더하므로 표준편차는 `grain×30/√12`
    = `grain×8.66` 입니다. 다만 그 난수에는 밝기 가중치
    `weight = 1 − |luma−0.5|×1.6` 이 곱해지므로, 패치마다 자기 가중치로 되나눠야
    합니다. 안 그러면 가중치가 1보다 작은 패치들 때문에 결과가 15%쯤 낮게 나옵니다.
    """
    samples = []
    for patch, measured, region in neutrals + guards:
        luma = float(np.mean(measured))
        if not 90 <= luma <= 170:          # 그레인 가중치가 1 에 가까운 구간
            continue
        weight = 1 - abs(luma / 255 - 0.5) * 1.6
        if weight <= 0.5:
            continue
        gray = region @ np.array([0.299, 0.587, 0.114])
        h, w = gray.shape
        ys, xs = np.mgrid[0:h, 0:w]
        # 비네팅·조명 기울기를 평면으로 빼고 남은 것만 노이즈로 봅니다.
        A = np.stack([xs.ravel(), ys.ravel(), np.ones(h * w)], axis=1)
        coefficients, *_ = np.linalg.lstsq(A, gray.ravel(), rcond=None)
        samples.append(float(np.std(gray.ravel() - A @ coefficients)) / weight)
    if not samples:
        return 0.0, 0.0
    std = float(np.median(samples))
    return std / 8.66, std


def main():
    parser = argparse.ArgumentParser(description="필터 앱의 룩을 FilmGrade 로 역산합니다")
    parser.add_argument("image", type=Path, help="필터를 적용해 내보낸 차트 사진")
    parser.add_argument("--name", default="Fitted", help="필터 표시 이름")
    parser.add_argument("--key", default="fitted", help="필터 키(영문)")
    args = parser.parse_args()

    meta = json.loads((CHART_DIR / "reference-chart.json").read_text(encoding="utf-8"))
    chart_size = meta["size"]

    print(f"읽는 중: {args.image}")
    pixels = load_srgb(args.image)
    height, width = pixels.shape[:2]
    print(f"  크기 {width}×{height}")

    gray = pixels @ np.array([0.299, 0.587, 0.114])
    expected_marker = meta["marker_size"] / chart_size * width
    markers = find_markers(gray, expected_marker)
    transform, residual = fit_affine(meta["markers"], markers)
    print(f"  기준점 정합 오차 {residual:.2f}px", end="")
    print(" — 양호" if residual < 3 else " — 큽니다(자르기·왜곡 의심)")

    measured = {"neutral": [], "guard": [], "color": [], "filler": []}
    for patch in meta["patches"]:
        value, region = sample_patch(pixels, patch["rect"], transform)
        measured[patch["role"]].append((patch, value, region))

    # ① 비네팅 — 커브를 뜨기 전에 먼저 걷어냅니다.
    g0, k = fit_vignette(measured["guard"], chart_size)
    if abs(k) > 0.02:
        print(f"  비네팅 감지: 가장자리 {k * 100:+.1f}% (보정 후 커브를 뜹니다)")
        for role in ("neutral", "color"):
            corrected = []
            for patch, value, region in measured[role]:
                gain = vignette_gain(patch, k, chart_size)
                corrected.append((patch, value / gain, region))
            measured[role] = corrected
    else:
        print("  비네팅 없음")

    # ② 커브 → ③ 채도 → ④ 그레인
    curves = fit_curve(measured["neutral"])
    saturation, sat_error = fit_saturation(measured["color"], curves)
    grain, grain_std = estimate_grain(measured["neutral"], measured["guard"])

    print(f"  채도 {saturation:.2f} (컬러 패치 잔차 {sat_error:.1f}/255)")
    if grain > 0.05:
        print(f"  그레인 {grain:.2f} (중간톤 표준편차 {grain_std:.1f})"
              f" — JPEG 가 알갱이를 지우므로 실제론 {grain * 1.5:.2f} 쯤일 수 있습니다")
    else:
        print("  그레인 없음")

    black_lift = curves["r"][0]
    print(f"  들린 검정 {black_lift:.3f}" + ("  ← 필름 룩의 핵심" if black_lift > 0.04 else ""))

    def fmt(values):
        return ", ".join(f"{v:g}" for v in values)

    print("\n──────── src/config/filters.ts 에 붙여넣으세요 ────────\n")
    print("  {")
    print(f'    key: "{args.key}",')
    print(f'    name: "{args.name}",')
    print('    css: "none",')
    print("    film: {")
    print(f"      r: [{fmt(curves['r'])}],")
    print(f"      g: [{fmt(curves['g'])}],")
    print(f"      b: [{fmt(curves['b'])}],")
    if abs(saturation - 1) > 0.01:
        print(f"      saturation: {saturation:.2f},")
    if grain > 0.05:
        print(f"      grain: {min(grain, 1.0):.2f},")
    print("    },")
    print("  },")
    print()


if __name__ == "__main__":
    sys.exit(main())
