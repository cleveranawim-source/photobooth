#!/usr/bin/env python3
"""한글 ttf/otf 를 unicode-range 서브셋 woff2 로 쪼개 public/fonts 에 넣습니다.

한글 폰트는 한 굵기가 1.3MB 안팎이라 통째로 넣으면 첫 로딩이 무겁습니다.
잘게 쪼개 두면 브라우저가 실제로 화면에 쓰인 글자가 든 조각만 받습니다.

준비:
    python3 -m venv .venv && .venv/bin/pip install fonttools brotli

쓰기:
    .venv/bin/python tools/subset-font.py "내폰트" 400:/경로/Regular.ttf 700:/경로/Bold.ttf

그 다음:
  1) 출력된 @font-face 를 public/fonts/korean.css 에 붙여 넣고
  2) src/config/frames.ts 의 FONT_STACKS 에서 폰트 이름을 바꿉니다.
"""

import pathlib
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

DEST = pathlib.Path(__file__).resolve().parent.parent / "public" / "fonts"

# 쪼개는 기준. 앞쪽일수록 자주 쓰는 글자라, 대개 앞 몇 조각만 받고 끝납니다.
def build_ranges() -> list[list[int]]:
    blocks = [
        (0x0020, 0x007E),  # 기본 라틴
        (0x00A0, 0x00FF),  # 라틴 보충
        (0x2000, 0x206F),  # 문장부호
        (0x3000, 0x303F),  # CJK 부호
        (0xFF00, 0xFFEF),  # 전각
        (0x3130, 0x318F),  # 호환 자모
    ]
    ranges = [list(range(a, b + 1)) for a, b in blocks]
    # 한글 음절 11,172자는 256자씩 나눕니다.
    syllables = list(range(0xAC00, 0xD7A4))
    ranges += [syllables[i : i + 256] for i in range(0, len(syllables), 256)]
    return ranges


def spec_for(codes: list[int]) -> str:
    parts, start, prev = [], None, None
    for code in codes:
        if start is None:
            start = prev = code
            continue
        if code == prev + 1:
            prev = code
            continue
        parts.append(f"U+{start:X}" if start == prev else f"U+{start:X}-{prev:X}")
        start = prev = code
    parts.append(f"U+{start:X}" if start == prev else f"U+{start:X}-{prev:X}")
    return ", ".join(parts)


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 1

    family = sys.argv[1]
    faces = []
    total = 0
    for pair in sys.argv[2:]:
        weight, path = pair.split(":", 1)
        source = pathlib.Path(path)
        covered = set(TTFont(source, lazy=True).getBestCmap().keys())
        for index, block in enumerate(build_ranges()):
            codes = sorted(set(block) & covered)
            if not codes:
                continue  # 이 구간에 글자가 없으면 파일을 만들지 않습니다
            font = TTFont(source)
            options = subset.Options(flavor="woff2", desubroutinize=True, layout_features=["*"])
            subsetter = subset.Subsetter(options=options)
            subsetter.populate(unicodes=codes)
            subsetter.subset(font)
            out = DEST / f"{family}-{weight}.subset.{index}.woff2"
            font.flavor = "woff2"
            font.save(out)
            font.close()
            total += out.stat().st_size
            faces.append(
                f"@font-face {{\n"
                f"  font-family: '{family}';\n"
                f"  font-style: normal;\n"
                f"  font-weight: {weight};\n"
                f"  font-display: swap;\n"
                f"  src: url('./{out.name}') format('woff2');\n"
                f"  unicode-range: {spec_for(codes)};\n"
                f"}}"
            )

    css = DEST / f"{family}.css"
    css.write_text("\n".join(faces) + "\n")
    print(f"{len(faces)} files, {total / 1024 / 1024:.1f} MB")
    print(f"@font-face 규칙을 {css} 에 썼습니다 — korean.css 에 붙여 넣으세요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
