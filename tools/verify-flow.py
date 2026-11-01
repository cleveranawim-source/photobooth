#!/usr/bin/env python3
"""전체 흐름 검증 — iPad 가로(1180×820)·세로(820×1180)에서 각 화면이 한 화면에 들어오고
가로 넘침과 콘솔 오류가 없는지 확인하며, 화면마다 스크린샷을 남깁니다.

    python3 tools/verify-flow.py <스크린샷 폴더> [--skip | --deny] [--url http://localhost:4173/]

dev 서버(`npm run dev`)가 떠 있어야 합니다. chromium 의 가짜 카메라를 씁니다.
변형:
  --skip  관리자가 모양·프레임을 하나씩만 켠 경우 — 시작 버튼 뒤 바로 촬영 화면
  --deny  카메라 권한 거부 — 프레임 화면에 '선생님을 불러주세요' 오류가 보여야 함
  --band  가로 4컷 띠 — 여분 칸이 조각 오른쪽에 붙고 활성 칸이 가로로 밀리는지(스크린샷)
  --exact 촬영 장수 = 칸 수 — 바꾸기 화면 없이 바로 완성
  --idle  모양 화면에서 자리를 뜨면 idleSeconds 뒤 시작으로, 이어서 관리자 화면(필터 선택·렌즈 위치·샘플 보기)
  --back  카메라가 켜지길 기다리는 사이 '모양 다시' — 모양 화면에 남고 늦게 온 스트림은 꺼져야 함
실패하면 어느 검사가 깨졌는지 출력하고 종료 코드 1.
"""

import argparse
import asyncio
import json
import pathlib
import sys

from playwright.async_api import async_playwright

VIEWPORTS = {"land": (1180, 820), "port": (820, 1180)}
SETTINGS_KEY = "photobooth-settings-v1"
BASE_SETTINGS = {"countdown": 3, "idleSeconds": 20}
FAKE_CAMERA = ["--use-fake-device-for-media-stream"]
FAKE_PERMISSION = ["--use-fake-ui-for-media-stream"]


class Checks:
    def __init__(self, tag):
        self.tag = tag
        self.failures = []

    def expect(self, condition, message):
        if not condition:
            self.failures.append(f"[{self.tag}] {message}")


async def metrics(page):
    return await page.evaluate(
        """() => ({
          scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
          scrollH: document.documentElement.scrollHeight, innerH: innerHeight,
        })"""
    )


async def snapshot(page, out, checks, name, one_screen=True):
    """스크린샷 + 넘침 검사. one_screen 이면 문서 스크롤이 없어야 합니다."""
    await page.wait_for_timeout(250)
    await page.screenshot(path=str(out / f"{checks.tag}-{name}.png"))
    m = await metrics(page)
    checks.expect(m["scrollW"] <= m["innerW"], f"{name}: 가로 넘침 {m['scrollW']} > {m['innerW']}")
    if one_screen:
        checks.expect(
            m["scrollH"] <= m["innerH"], f"{name}: 한 화면을 넘음 {m['scrollH']} > {m['innerH']}"
        )


RECORD_STREAMS = """
(() => {
  const devices = navigator.mediaDevices;
  if (!devices || window.__streams) return;
  const original = devices.getUserMedia.bind(devices);
  window.__streams = [];
  devices.getUserMedia = async (constraints) => {
    const stream = await original(constraints);
    window.__streams.push(stream);
    return stream;
  };
})();
"""

# 기본 필터 여덟 — 은은한 것(맑게·크림·필름·블루 아워)은 빼고 한눈에 다른 것들.
DEFAULT_FILTER_NAMES = ["원본", "화사", "따뜻한 날", "여름", "팝", "노을", "빈티지", "흑백"]


async def open_app(context, url, settings):
    merged = {**BASE_SETTINGS, **settings}
    await context.add_init_script(
        f"localStorage.setItem({json.dumps(SETTINGS_KEY)}, {json.dumps(json.dumps(merged))})"
    )
    await context.add_init_script(RECORD_STREAMS)
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" else None)
    await page.goto(url)
    await page.wait_for_selector(".start", timeout=15000)
    return page, errors


# 촬영이 끝나면 가는 화면 — 여분이 있으면 바꾸기, 없으면 완성.
AFTER_SHOOT = ".swap, .result"


async def choose_to_camera(page, out, checks, shape="세로 4컷"):
    """시작 → 모양 → 프레임 → 촬영 화면(카메라 준비 완료)까지."""
    await snapshot(page, out, checks, "start")
    await page.click(".start-button")
    await page.wait_for_selector(".shape", timeout=5000)
    await snapshot(page, out, checks, "shape")
    await page.click(f".shape-card:has-text('{shape}')")
    await page.wait_for_selector(".frame-screen", timeout=5000)
    await snapshot(page, out, checks, "frame")
    first = page.locator(".frame-pick").first
    checks.expect("행사" in (await first.inner_text()), "프레임 화면: 행사 프레임이 맨 앞이 아님")
    await first.click()
    await page.wait_for_selector(".capture", timeout=10000)
    await page.wait_for_selector("button:has-text('장 찍기'):not([disabled])", timeout=15000)
    await snapshot(page, out, checks, "camera")
    # 프레임 안에서 찍는다 — 활성 칸 안에 카메라가 있어야 합니다.
    checks.expect(
        await page.locator(".capture .stage-active video").count() == 1, "활성 칸 안에 카메라가 없음"
    )
    # 비디오가 활성 칸을 꽉 채워야 합니다 — 촬영(centerCrop)은 칸 비율로 자르므로, 테두리만큼
    # 비디오가 작아지면 미리보기와 인화 구도가 어긋납니다.
    cell = await page.locator(".capture .stage-active").bounding_box()
    video = await page.locator(".capture .stage-active video.cam").first.bounding_box()
    checks.expect(
        abs(cell["width"] - video["width"]) < 1.5 and abs(cell["height"] - video["height"]) < 1.5,
        f"카메라가 활성 칸을 못 채움: 칸 {cell['width']:.0f}×{cell['height']:.0f}"
        f" vs 비디오 {video['width']:.0f}×{video['height']:.0f}",
    )
    status = (await page.locator(".capture .status").inner_text()).strip()
    checks.expect(status == "주황 칸에 얼굴을 맞춰요", f"준비 설명이 한 줄이 아님: {status!r}")
    chips = [t.strip() for t in await page.locator(".capture .filter-chip").all_inner_texts()]
    checks.expect(chips == DEFAULT_FILTER_NAMES, f"기본 필터 칩이 다름: {chips}")


async def rotate_check(page, checks):
    """회전 흉내 — 스트림을 1080×1920(세로 iPad 가 주는 크기)로 바꾸면 세로 4컷 칸(인화 폭 1040px)에
    줌 여유가 없어 핀치가 막혀야 하고(touch-action 해제), 다시 3840×2160 으로 돌리면 열려야 합니다.
    상한을 카메라를 켤 때 한 번만 계산하면 돌린 뒤에도 옛 값이 남아 화면과 인화가 어긋납니다."""

    async def resize(width, height):
        return await page.evaluate(
            """async ([w, h]) => {
              const track = (window.__streams || [])[0]?.getVideoTracks()[0];
              if (!track) return null;
              await track.applyConstraints({ width: { exact: w }, height: { exact: h } });
              await new Promise((resolve) => setTimeout(resolve, 900));
              const video = document.querySelector('video.cam');
              return { size: `${video.videoWidth}x${video.videoHeight}`,
                       touch: document.querySelector('.cell-touch')?.style.touchAction ?? null };
            }""",
            [width, height],
        )

    portrait = await resize(1080, 1920)
    checks.expect(
        portrait is not None and portrait["size"] == "1080x1920" and portrait["touch"] == "",
        f"세로 크기(1080×1920)로 바뀐 뒤에도 핀치가 열려 있음: {portrait}",
    )
    landscape = await resize(3840, 2160)
    checks.expect(
        landscape is not None and landscape["size"] == "3840x2160" and landscape["touch"] == "none",
        f"가로 크기(3840×2160)로 돌아온 뒤 핀치가 다시 열리지 않음: {landscape}",
    )


# 완성 화면에 들어온 직후 '다시 꾸미는 중'(.composite.busy)이 한 번이라도 켜졌는지. 켜지면 같은 사진을
# 쓸데없이 다시 합성한 것입니다(합성 서명이 옛 렌더 값으로 기록되는 버그) — 화면이 잠깐 흐려졌다 돌아옵니다.
# 60ms 안팎이라 폴링으로는 놓치므로 MutationObserver 로 class 변화를 그 자리에서 기록합니다.
ARM_RECOMPOSE_WATCH = """() => {
  window.__busySeen = false;
  const observer = new MutationObserver(() => {
    if (document.querySelector('.composite.busy')) window.__busySeen = true;
  });
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
}"""


async def arm_recompose_watch(page):
    """완성 화면으로 넘어가기 **전에** 붙여야 합니다."""
    await page.evaluate(ARM_RECOMPOSE_WATCH)


async def expect_no_entry_recompose(page, checks, where):
    await page.wait_for_timeout(1500)
    checks.expect(
        not await page.evaluate("() => window.__busySeen"),
        f"{where}: 완성 화면에 들어오자마자 같은 사진을 다시 합성함",
    )


def badge_matches_lens(badge, viewport, edge):
    """배지 가운데가 뷰포트의 그 변 한가운데(±6px)에, 변에서 48px 안에 있어야 합니다."""
    width, height = viewport
    cx = badge["x"] + badge["width"] / 2
    cy = badge["y"] + badge["height"] / 2
    if edge == "top":
        return abs(cx - width / 2) < 6 and badge["y"] < 48
    if edge == "right":
        return abs(cy - height / 2) < 6 and badge["x"] + badge["width"] > width - 48
    return abs(cy - height / 2) < 6 and badge["x"] < 48


async def shoot(page, out, checks, name="countdown"):
    """찍기를 누르고 카운트다운 중 스크린샷, 촬영이 끝나 다음 화면으로 갈 때까지."""
    await page.click("button:has-text('장 찍기')")
    await page.wait_for_timeout(1600)
    await snapshot(page, out, checks, name)
    checks.expect(
        await page.locator(".capture .stage-active .countdown").count() == 1, "카운트다운이 활성 칸 안에 없음"
    )
    count = page.locator(".capture .shot-count b")
    checks.expect(
        await count.count() == 1 and (await count.inner_text()).strip() == "1",
        "촬영 중 큰 진행 숫자(1)가 없음",
    )
    bars = page.locator(".capture .shot-bar li")
    first_class = (await bars.nth(0).get_attribute("class") or "") if await bars.count() else ""
    checks.expect(
        await bars.count() == 6 and "now" in first_class,  # 기본 shootCount 6
        f"진행 막대가 6칸이 아니거나 첫 칸이 '지금' 표시가 아님: {await bars.count()}칸, {first_class!r}",
    )
    checks.expect(
        "찍는 중이에요" in (await page.locator(".capture .shoot").inner_text()), "촬영 버튼이 '찍는 중이에요' 가 아님"
    )
    badge = await page.locator(".look-here").bounding_box()
    viewport = (page.viewport_size["width"], page.viewport_size["height"])
    # 기본값: 렌즈가 짧은 변에 있는 iPad 를 렌즈가 오른쪽으로 가게 세운 키오스크 — 가로 오른쪽, 세로 위.
    edge = "right" if checks.tag.startswith("land") else "top"
    checks.expect(
        badge is not None and badge_matches_lens(badge, viewport, edge),
        f"'여기를 봐요!' 가 렌즈 쪽 화면 가장자리({edge})에 없음: {badge} / 뷰포트 {viewport}",
    )
    checks.expect(
        not await page.locator(".topbar .step-dots").is_visible(), "촬영 중 배지 뒤에 진행 점이 남아 있음"
    )
    # 배지가 보이는 필터 칩을 덮으면 안 됩니다 — 가로에서 렌즈가 오른쪽이면 배지가 오른쪽 열 한가운데에 옵니다.
    if badge is not None:
        chips = page.locator(".capture .filter-chip")
        for index in range(await chips.count()):
            chip = chips.nth(index)
            if not await chip.is_visible():
                continue
            box = await chip.bounding_box()
            overlaps = (
                box is not None
                and badge["x"] < box["x"] + box["width"]
                and box["x"] < badge["x"] + badge["width"]
                and badge["y"] < box["y"] + box["height"]
                and box["y"] < badge["y"] + badge["height"]
            )
            checks.expect(not overlaps, f"'여기를 봐요!' 가 필터 칩 {index + 1}번을 덮음: {badge} / {box}")
    await page.wait_for_selector(AFTER_SHOOT, timeout=60000)


async def swap_and_finish(page, out, checks):
    """바꾸기(1번째 칸 ↔ 여분 1) → 완성 → 인쇄 → 자동 초기화 예고까지."""
    await page.wait_for_selector(".swap", timeout=5000)
    await page.wait_for_timeout(500)  # 조각 그림 합성
    await snapshot(page, out, checks, "swap")
    hits = page.locator(".stage-hit")
    checks.expect(await hits.count() == 6, f"바꾸기 화면 칸 수 {await hits.count()} ≠ 6")
    print_tag = page.locator(".swap .stage-caption.print")
    extra_tag = page.locator(".swap .stage-caption.extra")
    checks.expect(
        await print_tag.count() == 1 and "인쇄할 사진" in (await print_tag.inner_text()),
        "바꾸기 화면에 '인쇄할 사진' 표식이 없음",
    )
    checks.expect(
        await extra_tag.count() == 1 and "여분 2장" in (await extra_tag.inner_text()),
        "바꾸기 화면에 '바꿀 수 있는 여분 2장' 표식이 없음",
    )
    checks.expect(await page.locator(".swap .stage-badge").count() == 2, "여분 번호 배지가 2개가 아님")
    stage = await page.locator(".swap-stage").bounding_box()
    for tag in (print_tag, extra_tag):
        if await tag.count() != 1:
            continue
        box = await tag.bounding_box()
        inside = (
            box["y"] >= stage["y"] - 0.5
            and box["x"] >= stage["x"] - 0.5
            and box["x"] + box["width"] <= stage["x"] + stage["width"] + 0.5
        )
        checks.expect(inside, f"표식이 무대 밖으로 나감: {box}")
    # 얼굴을 비교할 수 있을 만큼은 커야 합니다(가로 ≥110px, 세로 ≥120px).
    cell = await hits.first.bounding_box()
    floor = 120 if checks.tag.startswith("port") else 110
    checks.expect(cell["height"] >= floor, f"바꾸기 칸이 너무 작음: 높이 {cell['height']:.0f}px < {floor}px")
    first_extra = page.locator(".stage-extra img").first
    before = await first_extra.get_attribute("src")
    await hits.nth(0).click()
    await hits.nth(4).click()
    await page.wait_for_timeout(700)
    after = await first_extra.get_attribute("src")
    checks.expect(before != after, "1번째 칸과 여분 1 이 바뀌지 않음")
    await snapshot(page, out, checks, "swap-after")
    await arm_recompose_watch(page)
    await page.click("button:has-text('이걸로 할래요')")
    await page.wait_for_selector(".result", timeout=15000)
    await expect_no_entry_recompose(page, checks, "바꾸기 뒤")
    await snapshot(page, out, checks, "result")
    hero = page.locator(".result .hero-action")
    save = page.locator(".result .action-button:has-text('내 폰에 저장')")
    minor = page.locator(".result .result-minor .pill-button")
    if await hero.count() == 1 and await save.count() == 1 and await minor.count() >= 1:
        checks.expect("인쇄하기" in (await hero.inner_text()), "가장 큰 버튼이 인쇄하기가 아님")
        h, s_, m = (await hero.bounding_box())["height"], (await save.bounding_box())["height"], (await minor.first.bounding_box())["height"]
        checks.expect(h > s_ > m, f"버튼 위계가 크기로 안 드러남: 인쇄 {h:.0f} / 저장 {s_:.0f} / 보조 {m:.0f}")
    else:
        checks.expect(False, "완성 화면에 hero-action / 저장 / result-minor 알약이 갖춰지지 않음")
    await filter_on_result(page, out, checks)
    await page.click("button:has-text('인쇄하기')")
    await page.wait_for_selector(".done-toast", timeout=5000)
    if await page.locator(".result .hero-action").count() == 1:
        checks.expect(
            "내 폰에 저장" in (await page.locator(".result .hero-action").inner_text()),
            "인쇄 뒤 가장 큰 자리가 저장으로 넘어가지 않음",
        )
    await snapshot(page, out, checks, "result-printed")
    await page.wait_for_selector(".idle-note", timeout=25000)
    await page.wait_for_timeout(1100)
    await snapshot(page, out, checks, "result-idle")


FIRST_CELL_CHANNEL_DIFF = """async () => {
  const shown = document.querySelector('.composite');
  const image = new Image();
  image.src = shown.src;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  // 세로 4컷 첫 조각의 첫 칸(조각 좌표 40,166 / 520×316) 안쪽 — 인화지 폭 1200 기준 배율
  const s = image.naturalWidth / 1200;
  const d = context.getImageData(Math.round(60 * s), Math.round(186 * s), Math.round(480 * s), Math.round(276 * s)).data;
  let diff = 0, n = 0;
  for (let i = 0; i < d.length; i += 4 * 53) { diff += Math.abs(d[i] - d[i + 1]) + Math.abs(d[i + 1] - d[i + 2]); n += 1; }
  return diff / n;
}"""


async def filter_on_result(page, out, checks):
    """완성 화면의 꾸미기 시트에서 필터를 흑백으로 — 다시 찍지 않고 사진이 다시 구워져야 합니다."""
    before = await page.evaluate(FIRST_CELL_CHANNEL_DIFF)
    checks.expect(before > 10, f"원본 상태의 첫 칸이 컬러가 아님(채널차 {before:.1f}) — 검사 전제가 깨짐")
    await page.click(".result .dress-toggle")
    await page.wait_for_selector(".dress-sheet", timeout=5000)
    chips = [t.strip() for t in await page.locator(".dress-sheet .filter-chip").all_inner_texts()]
    checks.expect(chips == DEFAULT_FILTER_NAMES, f"완성 화면 시트에 필터 칩이 없거나 다름: {chips}")
    src_before = await page.locator(".composite").get_attribute("src")
    await page.click(".dress-sheet .filter-chip:has-text('흑백')")
    await page.wait_for_function(
        "(src) => { const img = document.querySelector('.composite'); return img && img.src !== src && !img.classList.contains('busy'); }",
        arg=src_before,
        timeout=20000,
    )
    await page.wait_for_timeout(300)
    await snapshot(page, out, checks, "result-filter", one_screen=False)
    after = await page.evaluate(FIRST_CELL_CHANNEL_DIFF)
    checks.expect(after < 4, f"흑백으로 바꿨는데 첫 칸이 아직 컬러(채널차 {after:.1f})")
    selected = await page.locator(".dress-sheet .filter-chip.selected").all_inner_texts()
    checks.expect([t.strip() for t in selected] == ["흑백"], f"고른 필터 표시가 다름: {selected}")
    await page.click(".dress-sheet button:has-text('닫기')")
    await page.wait_for_selector(".dress-sheet", state="detached", timeout=5000)


async def run_default(browser, url, out, tag, width, height):
    checks = Checks(tag)
    context = await browser.new_context(viewport={"width": width, "height": height})
    errors = []
    try:
        page, errors = await open_app(context, url, {})
        await choose_to_camera(page, out, checks)
        await rotate_check(page, checks)
        await shoot(page, out, checks)
        await swap_and_finish(page, out, checks)
    except Exception as caught:  # noqa: BLE001 — 어느 단계에서 멈췄는지 보고합니다
        checks.failures.append(f"[{tag}] 흐름 중단: {type(caught).__name__}: {str(caught)[:160]}")
    checks.expect(not errors, f"콘솔 오류: {errors[:3]}")
    await context.close()
    return checks


async def run_skip(browser, url, out, tag, width, height):
    """모양·프레임이 하나씩이면 시작 버튼 뒤 바로 촬영 화면."""
    checks = Checks(f"{tag}-skip")
    context = await browser.new_context(viewport={"width": width, "height": height})
    errors = []
    try:
        page, errors = await open_app(context, url, {"enabledLayouts": ["single"], "enabledFrames": ["arcade"]})
        await page.click(".start-button")
        await page.wait_for_selector(".capture", timeout=10000)
        checks.expect(await page.locator(".shape").count() == 0, "모양 화면이 떴음")
        back_label = await page.locator(".topbar .ghost-button").first.inner_text()
        checks.expect("처음으로" in back_label, f"건너뛴 단계로 되돌아가려 함: {back_label!r}")
        await snapshot(page, out, checks, "skip-camera")
    except Exception as caught:  # noqa: BLE001
        checks.failures.append(f"[{tag}-skip] 흐름 중단: {type(caught).__name__}: {str(caught)[:160]}")
    checks.expect(not errors, f"콘솔 오류: {errors[:3]}")
    await context.close()
    return checks


async def run_deny(browser, url, out, tag, width, height):
    """권한이 거부되면 프레임 화면에 머물며 운영자를 부르는 오류가 보여야 합니다."""
    checks = Checks(f"{tag}-deny")
    context = await browser.new_context(viewport={"width": width, "height": height})
    try:
        page, _ = await open_app(context, url, {})
        await page.click(".start-button")
        await page.click(".shape-card:has-text('세로 4컷')")
        await page.wait_for_selector(".frame-screen", timeout=5000)
        await page.locator(".frame-pick").first.click()
        error = page.locator(".frame-screen .error")
        await error.wait_for(timeout=10000)
        checks.expect("선생님" in (await error.inner_text()), "오류 문구가 운영자를 부르지 않음")
        checks.expect(await page.locator(".capture").count() == 0, "거부됐는데 촬영 화면으로 감")
        await snapshot(page, out, checks, "deny")
    except Exception as caught:  # noqa: BLE001
        checks.failures.append(f"[{tag}-deny] 흐름 중단: {type(caught).__name__}: {str(caught)[:160]}")
    await context.close()

    # 모양·프레임이 하나뿐이면 시작 버튼이 곧 카메라 — 거부 오류가 시작 화면에 보여야 합니다.
    context = await browser.new_context(viewport={"width": width, "height": height})
    try:
        page, _ = await open_app(context, url, {"enabledLayouts": ["single"], "enabledFrames": ["arcade"]})
        await page.click(".start-button")
        error = page.locator(".start .error")
        await error.wait_for(timeout=10000)
        checks.expect("선생님" in (await error.inner_text()), "시작 화면 오류 문구가 운영자를 부르지 않음")
        await snapshot(page, out, checks, "deny-skip")
    except Exception as caught:  # noqa: BLE001
        checks.failures.append(f"[{tag}-deny] 시작 화면 거부: {type(caught).__name__}: {str(caught)[:160]}")
    await context.close()
    return checks


async def run_band(browser, url, out, tag, width, height):
    """가로 띠: 여분 칸이 오른쪽에 붙고, 5번째(여분 1) 촬영 중 조각이 가로로 밀립니다."""
    checks = Checks(f"{tag}-band")
    context = await browser.new_context(viewport={"width": width, "height": height})
    errors = []
    try:
        page, errors = await open_app(context, url, {})
        await choose_to_camera(page, out, checks, shape="가로 4컷 띠")
        await page.click("button:has-text('장 찍기')")
        await page.wait_for_selector(".status:has-text('여분 1')", timeout=45000)
        await page.wait_for_timeout(900)
        await snapshot(page, out, checks, "band-extra")
        await page.wait_for_selector(AFTER_SHOOT, timeout=60000)
    except Exception as caught:  # noqa: BLE001
        checks.failures.append(f"[{tag}-band] 흐름 중단: {type(caught).__name__}: {str(caught)[:160]}")
    checks.expect(not errors, f"콘솔 오류: {errors[:3]}")
    await context.close()
    return checks


async def run_exact(browser, url, out, tag, width, height):
    """촬영 장수가 칸 수와 같으면 바꾸기 화면을 건너뛰고 바로 완성."""
    checks = Checks(f"{tag}-exact")
    context = await browser.new_context(viewport={"width": width, "height": height})
    errors = []
    try:
        page, errors = await open_app(context, url, {"shootCount": 4})
        await choose_to_camera(page, out, checks)
        await arm_recompose_watch(page)
        await page.click("button:has-text('장 찍기')")
        await page.wait_for_selector(".result", timeout=60000)
        await expect_no_entry_recompose(page, checks, "촬영 직후")
        checks.expect(await page.locator(".swap").count() == 0, "바꾸기 화면이 떴음")
        await snapshot(page, out, checks, "exact-result")
    except Exception as caught:  # noqa: BLE001
        checks.failures.append(f"[{tag}-exact] 흐름 중단: {type(caught).__name__}: {str(caught)[:160]}")
    checks.expect(not errors, f"콘솔 오류: {errors[:3]}")
    await context.close()
    return checks


async def run_idle_admin(browser, url, out, tag, width, height):
    """고르는 화면 유휴 초기화 + 관리자 화면(보정 선택 칩, 샘플 인화물 보기)."""
    checks = Checks(f"{tag}-idle")
    context = await browser.new_context(viewport={"width": width, "height": height})
    errors = []
    try:
        page, errors = await open_app(context, url, {"idleSeconds": 20})
        await page.click(".start-button")
        await page.wait_for_selector(".shape", timeout=5000)
        await page.wait_for_selector(".start", timeout=26000)
        checks.expect(await page.locator(".shape").count() == 0, "유휴 초기화 뒤에도 모양 화면이 남음")
        # 관리자: 제목 2초 길게 누르기 → PIN
        box = await page.locator("h1.brand").bounding_box()
        await page.mouse.move(box["x"] + 20, box["y"] + 20)
        await page.mouse.down()
        await page.wait_for_timeout(2200)
        await page.mouse.up()
        await page.wait_for_selector(".admin-gate", timeout=5000)
        await page.keyboard.type("0000")
        await page.wait_for_selector(".admin", timeout=5000)
        checks.expect(
            await page.locator(".admin:has-text('손님에게 보여줄 필터')").count() == 1, "관리자에 필터 선택이 없음"
        )
        for label in ("가로로 세웠을 때", "세로로 세웠을 때"):
            checks.expect(
                await page.locator(f".admin:has-text('{label}')").count() == 1, f"관리자에 렌즈 위치 '{label}' 줄이 없음"
            )
        await snapshot(page, out, checks, "admin", one_screen=False)
        await page.click("button:has-text('샘플 인화물 보기')")
        await page.wait_for_selector(".result .sample-badge", timeout=15000)
        await snapshot(page, out, checks, "sample-result")
    except Exception as caught:  # noqa: BLE001
        checks.failures.append(f"[{tag}-idle] 흐름 중단: {type(caught).__name__}: {str(caught)[:160]}")
    checks.expect(not errors, f"콘솔 오류: {errors[:3]}")
    await context.close()
    return checks


# getUserMedia 를 1.4초 늦추고 만들어진 스트림을 기록합니다 — 기다리는 사이의 조작을 재현하려고.
DELAYED_CAMERA = """
(() => {
  const devices = navigator.mediaDevices;
  if (!devices) return;
  const original = devices.getUserMedia.bind(devices);
  window.__streams = [];
  devices.getUserMedia = async (constraints) => {
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const stream = await original(constraints);
    window.__streams.push(stream);
    return stream;
  };
})();
"""
LIVE_STREAMS = (
    "() => (window.__streams || []).filter((s) => s.getTracks().some((t) => t.readyState === 'live')).length"
)


async def run_back(browser, url, out, tag, width, height):
    """카메라가 켜지길 기다리는 1.4초 사이에 '모양 다시'를 누르면 모양 화면에 남아야 하고,
    늦게 도착한 스트림은 꺼져야 합니다(표시등). 다시 고르면 정상적으로 촬영 화면, 켜진 스트림은 하나."""
    checks = Checks(f"{tag}-back")
    context = await browser.new_context(viewport={"width": width, "height": height})
    errors = []
    try:
        await context.add_init_script(DELAYED_CAMERA)
        page, errors = await open_app(context, url, {})
        await page.click(".start-button")
        await page.click(".shape-card:has-text('세로 4컷')")
        await page.wait_for_selector(".frame-screen", timeout=5000)
        await page.locator(".frame-pick").first.click()
        await page.click(".topbar .ghost-button:has-text('모양 다시')")
        await page.wait_for_selector(".shape", timeout=5000)
        await page.wait_for_timeout(2500)
        checks.expect(await page.locator(".shape").count() == 1, "뒤로 갔는데 모양 화면이 아님")
        checks.expect(await page.locator(".capture").count() == 0, "뒤로 갔는데 촬영 화면으로 끌려감")
        live = await page.evaluate(LIVE_STREAMS)
        checks.expect(live == 0, f"뒤로 간 뒤에도 켜진 카메라 스트림 {live}개")
        await snapshot(page, out, checks, "back-shape")
        await page.click(".shape-card:has-text('세로 4컷')")
        await page.wait_for_selector(".frame-screen", timeout=5000)
        await page.locator(".frame-pick").first.click()
        await page.wait_for_selector(".capture", timeout=10000)
        await page.wait_for_selector("button:has-text('장 찍기'):not([disabled])", timeout=15000)
        live = await page.evaluate(LIVE_STREAMS)
        checks.expect(live == 1, f"다시 들어온 뒤 켜진 스트림 {live}개 (1개여야 함)")
    except Exception as caught:  # noqa: BLE001
        checks.failures.append(f"[{tag}-back] 흐름 중단: {type(caught).__name__}: {str(caught)[:160]}")
    checks.expect(not errors, f"콘솔 오류: {errors[:3]}")
    await context.close()
    return checks


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("out")
    parser.add_argument("--url", default="http://localhost:4173/")
    parser.add_argument("--skip", action="store_true")
    parser.add_argument("--deny", action="store_true")
    parser.add_argument("--band", action="store_true")
    parser.add_argument("--exact", action="store_true")
    parser.add_argument("--idle", action="store_true")
    parser.add_argument("--back", action="store_true")
    args = parser.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    if args.deny:
        runner, launch_args = run_deny, FAKE_CAMERA
    elif args.skip:
        runner, launch_args = run_skip, FAKE_CAMERA + FAKE_PERMISSION
    elif args.band:
        runner, launch_args = run_band, FAKE_CAMERA + FAKE_PERMISSION
    elif args.exact:
        runner, launch_args = run_exact, FAKE_CAMERA + FAKE_PERMISSION
    elif args.idle:
        runner, launch_args = run_idle_admin, FAKE_CAMERA + FAKE_PERMISSION
    elif args.back:
        runner, launch_args = run_back, FAKE_CAMERA + FAKE_PERMISSION
    else:
        runner, launch_args = run_default, FAKE_CAMERA + FAKE_PERMISSION

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(args=launch_args)
        results = await asyncio.gather(
            *(runner(browser, args.url, out, tag, w, h) for tag, (w, h) in VIEWPORTS.items())
        )
        await browser.close()

    failures = [line for checks in results for line in checks.failures]
    for line in failures:
        print("FAIL", line)
    print(f"{'FAIL' if failures else 'OK'}: {len(failures)} failure(s), screenshots in {out}")
    sys.exit(1 if failures else 0)


asyncio.run(main())
