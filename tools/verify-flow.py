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
  --idle  모양 화면에서 자리를 뜨면 idleSeconds 뒤 시작으로, 이어서 관리자 화면(보정 선택·샘플 보기)
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


async def open_app(context, url, settings):
    merged = {**BASE_SETTINGS, **settings}
    await context.add_init_script(
        f"localStorage.setItem({json.dumps(SETTINGS_KEY)}, {json.dumps(json.dumps(merged))})"
    )
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


async def shoot(page, out, checks, name="countdown"):
    """찍기를 누르고 카운트다운 중 스크린샷, 촬영이 끝나 다음 화면으로 갈 때까지."""
    await page.click("button:has-text('장 찍기')")
    await page.wait_for_timeout(1600)
    await snapshot(page, out, checks, name)
    checks.expect(
        await page.locator(".capture .stage-active .countdown").count() == 1, "카운트다운이 활성 칸 안에 없음"
    )
    await page.wait_for_selector(AFTER_SHOOT, timeout=60000)


async def swap_and_finish(page, out, checks):
    """바꾸기(1번째 칸 ↔ 여분 1) → 완성 → 인쇄 → 자동 초기화 예고까지."""
    await page.wait_for_selector(".swap", timeout=5000)
    await page.wait_for_timeout(500)  # 조각 그림 합성
    await snapshot(page, out, checks, "swap")
    hits = page.locator(".stage-hit")
    checks.expect(await hits.count() == 6, f"바꾸기 화면 칸 수 {await hits.count()} ≠ 6")
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
    await page.click("button:has-text('이걸로 할래요')")
    await page.wait_for_selector(".result", timeout=15000)
    await page.wait_for_timeout(400)
    await snapshot(page, out, checks, "result")
    await page.click("button:has-text('인쇄하기')")
    await page.wait_for_selector(".done-toast", timeout=5000)
    await snapshot(page, out, checks, "result-printed")
    await page.wait_for_selector(".idle-note", timeout=25000)
    await page.wait_for_timeout(1100)
    await snapshot(page, out, checks, "result-idle")


async def run_default(browser, url, out, tag, width, height):
    checks = Checks(tag)
    context = await browser.new_context(viewport={"width": width, "height": height})
    errors = []
    try:
        page, errors = await open_app(context, url, {})
        await choose_to_camera(page, out, checks)
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
        await page.click("button:has-text('장 찍기')")
        await page.wait_for_selector(".result", timeout=60000)
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
            await page.locator(".admin:has-text('손님에게 보여줄 보정')").count() == 1, "관리자에 보정 선택이 없음"
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
