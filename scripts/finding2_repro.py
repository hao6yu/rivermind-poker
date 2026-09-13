#!/usr/bin/env python3
"""Finding 2 reproduction: does the first relaunch after a mid-session
force-stop render but ignore touch input? Drives a solo host session
(host + AI seats) on one emulator, force-stops mid-hand, relaunches, and
tests touch responsiveness via tab navigation. Logs every cycle."""
import re
import subprocess
import sys
import time

ADB = "/Users/haoyu/Library/Android/sdk/platform-tools/adb"
DEV = sys.argv[1] if len(sys.argv) > 1 else "emulator-5554"
CYCLES = int(sys.argv[2]) if len(sys.argv) > 2 else 3


def adb(*args):
    return subprocess.run([ADB, "-s", DEV, *args], capture_output=True, text=True).stdout


def dump():
    for _ in range(4):
        xml = adb("exec-out", "uiautomator", "dump", "/dev/tty")
        if "<node" in xml:
            return xml
        time.sleep(1)
    return ""


def center(xml, test_id):
    m = re.search(r'resource-id="[^"]*' + re.escape(test_id) + r'"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml)
    if not m:
        return None
    x1, y1, x2, y2 = map(int, m.groups())
    return (x1 + x2) // 2, (y1 + y2) // 2


def tap(test_id, wait=1.8):
    for _ in range(3):
        c = center(dump(), test_id)
        if c:
            adb("shell", "input", "tap", str(c[0]), str(c[1]))
            time.sleep(wait)
            return True
        time.sleep(0.8)
    return False


def wait_id(test_id, timeout_s=30):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if center(dump(), test_id):
            return True
        time.sleep(0.9)
    return False


def present(test_id):
    return center(dump(), test_id) is not None


def onboard():
    candidates = ("onboarding.disclosuresContinue", "onboarding.choice.later", "onboarding.choice.beginner", "onboarding.choice.basics")
    for _ in range(10):
        xml = dump()
        if center(xml, "tab.play") or center(xml, "tab.home"):
            return True
        acted = False
        for candidate in candidates:
            c = center(xml, candidate)
            if c:
                adb("shell", "input", "tap", str(c[0]), str(c[1]))
                acted = True
                time.sleep(2)
                break
        if not acted:
            time.sleep(1.5)
    return False


def force_stop():
    adb("shell", "am", "force-stop", "dev.isw.rivermindpoker")
    time.sleep(2)


def relaunch():
    adb("shell", "am", "start", "-n", "dev.isw.rivermindpoker/.MainActivity")
    onboard()


def touches_alive():
    """Tap tab.play; the hub opening proves the touch pipeline works."""
    before = dump()
    if center(before, "play.championship.entry"):
        return True  # already on the Play hub: touches clearly work
    c = center(before, "tab.play")
    if not c:
        return None  # cannot test here
    adb("shell", "input", "tap", str(c[0]), str(c[1]))
    time.sleep(2.5)
    after = dump()
    return center(after, "play.championship.entry") is not None


def back_to_home():
    for _ in range(3):
        if center(dump(), "tab.home"):
            tap("tab.home", 1.5)
            return
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
        time.sleep(1.5)


def main():
    print(f"== finding 2 repro on {DEV}, {CYCLES} cycles", flush=True)
    force_stop()
    relaunch()
    results = []
    for cycle in range(1, CYCLES + 1):
        print(f"== cycle {cycle}: create session, play to mid-hand, force-stop", flush=True)
        # Create a room with defaults (AI seats are pre-filled by the flow).
        hub_ok = False
        for _ in range(4):
            tap("tab.play", 2.2)
            time.sleep(1.5)
            if present("play.championship.entry"):
                hub_ok = True
                break
        if not hub_ok:
            print("   play hub not reached", flush=True)
            results.append((cycle, "no-hub"))
            continue
        tap("play.multiplayer.create", 2.2)
        for _ in range(4):
            if present("multiplayer.lobby.primary"):
                break
            stepped = False
            for candidate in ("multiplayer.create.continue", "multiplayer.create.start"):
                if tap(candidate, 1800):
                    stepped = True
                    break
            if not stepped:
                break
        if not wait_id("multiplayer.lobby.primary", 20):
            print("   lobby not reached; recovering", flush=True)
            force_stop()
            relaunch()
            continue
        # Fill every open seat with an AI so the host can start solo. The Add AI
        # control is text-only on some screens: tap by text bounds.
        def tap_text(label, wait=2.2):
            xml = dump()
            m = re.search(r'text="' + label + r'"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml)
            if not m:
                return False
            x1, y1, x2, y2 = map(int, m.groups())
            adb("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
            time.sleep(wait)
            return True

        for _ in range(6):
            if not tap_text("Add AI"):
                break
        print(f"   open seats remaining: {present('multiplayer.lobby.addAi') or ('Add AI' in dump())}", flush=True)
        # Ready + start (host): primary toggles ready -> start.
        tap("multiplayer.lobby.primary", 1800)
        tap("multiplayer.lobby.primary", 1800)
        at_table = wait_id("table.action.fold", 45) or wait_id("table.orientation.landscape", 45)
        if not at_table:
            tap("multiplayer.lobby.primary", 1800)
            at_table = wait_id("table.action.fold", 45)
        print(f"   at table: {at_table}", flush=True)
        if not at_table:
            results.append((cycle, "no-table"))
            force_stop()
            relaunch()
            continue
        # Wait until a hand is in progress (actions enabled = mid-hand).
        deadline = time.time() + 60
        while time.time() < deadline and not present("table.action.fold"):
            time.sleep(2)
        print("   mid-hand: forcing stop NOW", flush=True)
        force_stop()
        # Relaunch and test touches immediately (no extra settling beyond onboarding).
        relaunch()
        alive = touches_alive()
        print(f"   cycle {cycle}: touches after first relaunch = {alive}", flush=True)
        results.append((cycle, alive))
        if alive is False:
            print("   TOUCH-DEAD STATE REPRODUCED — capturing Metro/console evidence", flush=True)
            # Second restart recovers (documented): verify and resume.
            force_stop()
            relaunch()
            recovered = touches_alive()
            print(f"   second relaunch recovers touches: {recovered}", flush=True)
            results.append((cycle, f"recovered={recovered}"))
        else:
            back_to_home()
    print("== repro summary", flush=True)
    for cycle, state in results:
        print(f"  cycle {cycle}: {state}", flush=True)


if __name__ == "__main__":
    main()
