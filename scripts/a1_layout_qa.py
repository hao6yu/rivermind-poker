#!/usr/bin/env python3
"""Release 1.3 layout QA: screenshots of local AI tables across seat counts,
dark/light and large text, saved under artifacts/android/release-1-3-qa/."""
import re
import subprocess
import sys
import time

ADB = "/Users/haoyu/Library/Android/sdk/platform-tools/adb"
DEVICE = sys.argv[1] if len(sys.argv) > 1 else "emulator-5556"
OUT = "artifacts/android/release-1-3-qa"


def adb(*args):
    return subprocess.run([ADB, "-s", DEVICE, *args], capture_output=True, text=True).stdout


def dump():
    for _ in range(4):
        xml = adb("exec-out", "uiautomator", "dump", "/dev/tty")
        if "<node" in xml:
            return xml
        time.sleep(1.0)
    return xml


def center(xml, test_id):
    m = re.search(r'resource-id="[^"]*' + re.escape(test_id) + r'"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml)
    if not m:
        return None
    x1, y1, x2, y2 = map(int, m.groups())
    return (x1 + x2) // 2, (y1 + y2) // 2


def tap(test_id, wait=1.5):
    for _ in range(3):
        c = center(dump(), test_id)
        if c:
            adb("shell", "input", "tap", str(c[0]), str(c[1]))
            time.sleep(wait)
            return True
        time.sleep(0.7)
    return False


def wait_id(test_id, timeout_s=25):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if center(dump(), test_id):
            return True
        time.sleep(0.8)
    return False


def shot(name):
    # exec-out text mode corrupts binary; use shell screencap to file + pull.
    adb("shell", "screencap", "-p", f"/sdcard/{name}.png")
    subprocess.run([ADB, "-s", DEVICE, "pull", f"/sdcard/{name}.png", f"{OUT}/{name}.png"], capture_output=True)
    adb("shell", "rm", f"/sdcard/{name}.png")
    print(f"  saved {OUT}/{name}.png")


def launch():
    adb("shell", "am", "start", "-n", "dev.isw.rivermindpoker/.MainActivity")
    wait_id("tab.play", 40) or wait_id("tab.home", 40)
    for _ in range(6):
        if wait_id("tab.play", 4):
            return
        for candidate in ("onboarding.disclosuresContinue", "onboarding.choice.later", "onboarding.choice.basics"):
            if tap(candidate, 1000):
                break


def seat_table(players, label):
    print(f"== {label}")
    launch()
    # The tab bar animates: tap and verify the Play hub before configuring.
    for _ in range(5):
        tap("tab.play", 2.2)
        time.sleep(1.5)  # let the hub entrance animation settle before dumps
        if wait_id("play.championship.entry", 6):
            break
    tap(f"play.ai.players.{players}", 2.0)
    tap("play.ai.format.practice", 1.5)
    # The start button can sit under the tab bar when the hub is scrolled to
    # the bottom: swipe up until its center clears the tab-bar zone, then tap.
    for _ in range(3):
        xml = dump()
        m = re.search(r'resource-id="[^"]*play.ai.start"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml)
        if not m:
            break
        y_center = (int(m.group(2)) + int(m.group(4))) // 2
        if y_center < 2150:
            break
        adb("shell", "input", "swipe", "540", "1700", "540", "800", "300")
        time.sleep(1.0)
    tap("play.ai.start", 1.5)
    if wait_id("table.action.fold", 40):
        time.sleep(2)
        shot(f"layout-{label}-portrait")
        # Landscape via the in-table orientation control.
        if tap("table.orientation.landscape", 2.5):
            time.sleep(2)
            shot(f"layout-{label}-landscape")
            tap("table.orientation.portrait", 2.5)
        # Leave: hardware back opens the exit sheet; tap the Leave text button.
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
        time.sleep(1.2)
        xml = dump()
        m = re.search(r'text="Leave table"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml)
        if m:
            x1, y1, x2, y2 = map(int, m.groups())
            adb("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
            time.sleep(1.5)
    else:
        print(f"  WARN: table for {label} not reached")


def main():
    subprocess.run(["mkdir", "-p", OUT])
    mode = sys.argv[2] if len(sys.argv) > 2 else "light"
    scale = sys.argv[3] if len(sys.argv) > 3 else "1.0"
    adb("shell", "cmd", "uimode", "night", "yes" if mode == "dark" else "no")
    adb("shell", "settings", "put", "system", "font_scale", scale)
    print(f"== mode={mode} font_scale={scale}")
    for players in (2, 3, 6, 9):
        if players in (6, 9) and scale != "1.0":
            continue  # large-text pass covers 2 and 3 (worst-case space)
        import os
        for attempt in range(4):
            expected = [f"{OUT}/layout-{mode}-s{scale}-{players}seats-portrait.png", f"{OUT}/layout-{mode}-s{scale}-{players}seats-landscape.png"]
            seat_table(players, f"{mode}-s{scale}-{players}seats")
            if all(os.path.exists(p) for p in expected):
                break
    adb("shell", "settings", "put", "system", "font_scale", "1.0")
    adb("shell", "cmd", "uimode", "night", "no")


if __name__ == "__main__":
    main()
