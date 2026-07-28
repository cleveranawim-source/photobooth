#!/usr/bin/env python3
"""
필터 역산용 레퍼런스 차트를 만듭니다.

쓰는 법
  1. 이 스크립트로 reference-chart.png 를 만듭니다.
  2. 아이폰으로 보내 사진 앱에 저장합니다(에어드롭).
  3. 흉내 내고 싶은 필터 앱에서 이 사진을 **불러와** 필터를 적용하고 내보냅니다.
     - 자르지 마세요. 네 귀퉁이의 검은 사각형이 좌표 기준점입니다.
     - 크기가 줄거나 JPEG 로 다시 저장되는 건 괜찮습니다.
  4. 내보낸 사진을 맥으로 가져와 fit-filter.py 에 넘깁니다.

차트 구성
  · 중성 회색 램프 21단 — 입력이 R=G=B 라 채도 단계가 아무 일도 하지 않습니다.
    따라서 이 패치들의 출력이 곧 채널별 톤커브 그 자체입니다.
  · 비네팅 감시 패치 5개 — 같은 회색(128)을 네 모서리와 가운데 두었습니다.
    모서리가 가운데보다 어두우면 그 앱이 비네팅을 넣은 것이고, fit-filter.py 가
    가운데 쪽 패치에 가중치를 실어 커브가 오염되지 않게 합니다.
  · 컬러 패치 30개 — 6색상 × 밝기/채도 조합 + 피부톤 6종. 채도 추정에 씁니다.

패치 위치와 입력값은 reference-chart.json 에 함께 저장되므로,
배치를 바꿔도 fit-filter.py 를 고칠 필요가 없습니다.
"""

import json
import colorsys
from pathlib import Path

from PIL import Image, ImageDraw, ImageCms

SIZE = 1200          # 차트 한 변(px)
MARKER = 70          # 귀퉁이 기준점 사각형 한 변
MARGIN = 50          # 바깥 여백
COLS, ROWS = 8, 7
GAP = 10

OUT_DIR = Path(__file__).resolve().parent / "chart"


def skin_tones():
    """포토부스에서 제일 중요한 건 피부톤이라 따로 넣습니다(밝은 쪽 ~ 어두운 쪽)."""
    return [
        (255, 227, 205), (246, 205, 178), (232, 183, 152),
        (206, 154, 122), (166, 118, 92), (118, 82, 62),
    ]


def color_patches():
    """6색상 × (밝기 2 × 채도 2) = 24 + 피부톤 6 = 30개."""
    patches = []
    for hue_index in range(6):                       # R Y G C B M
        hue = hue_index / 6
        for value in (0.85, 0.55):
            for saturation in (0.75, 0.35):
                r, g, b = colorsys.hsv_to_rgb(hue, saturation, value)
                patches.append((round(r * 255), round(g * 255), round(b * 255)))
    return patches + skin_tones()


# 감시 패치를 놓을 칸 — 격자의 네 모서리와 한가운데입니다.
# 반경이 0 부터 최대까지 고루 퍼져야 비네팅(gain = 1 + k·r²)이 외삽 없이 잡힙니다.
# 모서리를 감시 패치(중간 회색)로 채우는 덕에 새까만 패치가 기준점 옆에 오지 않아
# 기준점 검출도 함께 안전해집니다.
GUARD_CELLS = {
    0,                          # 좌상
    COLS - 1,                   # 우상
    (ROWS // 2) * COLS + COLS // 2 - 1,   # 중앙
    (ROWS - 1) * COLS,          # 좌하
    ROWS * COLS - 1,            # 우하
}


def build_patch_list():
    """차트에 그릴 패치 목록을 만듭니다. 순서가 곧 격자 배치 순서입니다."""
    # 감시 패치를 제외한 칸에 중성 램프 → 컬러 순으로 채웁니다.
    fill = [
        {"role": "neutral", "rgb": [round(i * 255 / 20)] * 3} for i in range(21)
    ] + [{"role": "color", "rgb": list(rgb)} for rgb in color_patches()]

    total = COLS * ROWS
    assert len(fill) + len(GUARD_CELLS) <= total, "패치가 격자보다 많습니다"

    patches, cursor = [], 0
    for cell in range(total):
        if cell in GUARD_CELLS:
            patches.append({"role": "guard", "rgb": [128, 128, 128]})
        elif cursor < len(fill):
            patches.append(fill[cursor])
            cursor += 1
        else:
            patches.append({"role": "filler", "rgb": [255, 255, 255]})
    return patches


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    patches = build_patch_list()
    assert len(patches) <= COLS * ROWS, f"패치 {len(patches)}개가 격자 {COLS}×{ROWS}를 넘습니다"

    image = Image.new("RGB", (SIZE, SIZE), (255, 255, 255))
    draw = ImageDraw.Draw(image)

    # 귀퉁이 기준점 — fit-filter.py 가 이걸 찾아 좌표계를 맞춥니다.
    marker_centers = []
    for mx, my in [
        (MARGIN, MARGIN),
        (SIZE - MARGIN - MARKER, MARGIN),
        (MARGIN, SIZE - MARGIN - MARKER),
        (SIZE - MARGIN - MARKER, SIZE - MARGIN - MARKER),
    ]:
        draw.rectangle([mx, my, mx + MARKER - 1, my + MARKER - 1], fill=(0, 0, 0))
        marker_centers.append([mx + MARKER / 2, my + MARKER / 2])

    # 패치 격자 — 위아래로 기준점을 피해 자리를 잡습니다.
    grid_top = MARGIN + MARKER + 40
    grid_bottom = SIZE - MARGIN - MARKER - 40
    grid_left = MARGIN + 10
    grid_right = SIZE - MARGIN - 10

    cell_w = (grid_right - grid_left) / COLS
    cell_h = (grid_bottom - grid_top) / ROWS

    for index, patch in enumerate(patches):
        col, row = index % COLS, index // COLS
        x0 = grid_left + col * cell_w + GAP / 2
        y0 = grid_top + row * cell_h + GAP / 2
        x1 = grid_left + (col + 1) * cell_w - GAP / 2
        y1 = grid_top + (row + 1) * cell_h - GAP / 2
        draw.rectangle([x0, y0, x1, y1], fill=tuple(patch["rgb"]))
        patch["rect"] = [x0, y0, x1, y1]
        patch["center"] = [(x0 + x1) / 2, (y0 + y1) / 2]

    png_path = OUT_DIR / "reference-chart.png"
    # sRGB 프로파일을 박아 둡니다 — 안 박으면 아이폰이 Display P3 로 오해해 색이 틀어집니다.
    srgb = ImageCms.createProfile("sRGB")
    image.save(png_path, icc_profile=ImageCms.ImageCmsProfile(srgb).tobytes())

    meta = {
        "size": SIZE,
        "markers": marker_centers,
        "marker_size": MARKER,
        "patches": patches,
    }
    (OUT_DIR / "reference-chart.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8"
    )

    neutral = sum(1 for p in patches if p["role"] == "neutral")
    color = sum(1 for p in patches if p["role"] == "color")
    guard = sum(1 for p in patches if p["role"] == "guard")
    print(f"만들었습니다: {png_path}")
    print(f"  중성 {neutral}단 · 컬러 {color}개 · 비네팅 감시 {guard}개")


if __name__ == "__main__":
    main()
