#!/usr/bin/env python3
"""전체 흐름 검증 — iPad 가로(1180×820)·세로(820×1180)에서 각 화면이 한 화면에 들어오고
가로 넘침과 콘솔 오류가 없는지 확인하며, 화면마다 스크린샷을 남깁니다.

    python3 tools/verify-flow.py <스크린샷 폴더> [--skip | --deny] [--url http://localhost:4173/]

dev 서버(`npm run dev`)가 떠 있어야 합니다. chromium 의 가짜 카메라를 씁니다.
변형:
  --skip  관리자가 모양·프레임을 하나씩만 켠 경우 — 시작 버튼 뒤 바로 촬영 화면
  --deny  카메라 권한 거부 — 프레임 화면에 '선생님을 불러주세요' 오류가 보여야 함
  --band  가로 4컷 띠 — 여분 칸이 조각 오른쪽에 붙고 활성 칸이 가로로 밀리는지(스크린샷)
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


# 촬영이 끝나면 가는 화면. (Task 6 에서 .swap 으로 좁힙니다.)
AFTER_SHOOT = ".swap, .select, .result"


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


async def shoot(page, out, checks, name="countdown"):
    """찍기를 누르고 카운트다운 중 스크린샷, 촬영이 끝나 다음 화면으로 갈 때까지."""
    await page.click("button:has-text('장 찍기')")
    await page.wait_for_timeout(1600)
    await snapshot(page, out, checks, name)
    checks.expect(
        await page.locator(".capture .stage-active .countdown").count() == 1, "카운트다운이 활성 칸 안에 없음"
    )
    await page.wait_for_selector(AFTER_SHOOT, timeout=60000)


async def run_default(browser, url, out, tag, width, height):
    checks = Checks(tag)
    context = await browser.new_context(viewport={"width": width, "height": height})
    errors = []
    try:
        page, errors = await open_app(context, url, {})
        await choose_to_camera(page, out, checks)
        await shoot(page, out, checks)
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


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("out")
    parser.add_argument("--url", default="http://localhost:4173/")
    parser.add_argument("--skip", action="store_true")
    parser.add_argument("--deny", action="store_true")
    parser.add_argument("--band", action="store_true")
    args = parser.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    if args.deny:
        runner, launch_args = run_deny, FAKE_CAMERA
    elif args.skip:
        runner, launch_args = run_skip, FAKE_CAMERA + FAKE_PERMISSION
    elif args.band:
        runner, launch_args = run_band, FAKE_CAMERA + FAKE_PERMISSION
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
