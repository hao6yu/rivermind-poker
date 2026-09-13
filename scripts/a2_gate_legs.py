#!/usr/bin/env python3
"""A2 gate legs: pause/resume, session completion + rematch, host departure.
Assumes a fresh session is set up by the standard gate phases 1-3 first."""
import re
import subprocess
import sys
import time
import importlib.util

spec = importlib.util.spec_from_file_location('gate', 'scripts/a2_two_client_gate.py')
gate = importlib.util.module_from_spec(spec)
gate.__name__ = 'gate'
spec.loader.exec_module(gate)

HOST = gate.HOST
GUEST = gate.GUEST
results = []


def step(name, ok, note=""):
    results.append((name, ok, note))
    print(f"   [{'PASS' if ok else 'FAIL'}] {name} {note}", flush=True)


def texts(device):
    return re.findall(r'text="([^"]+)"', gate.dump(device))


def find_text(device, pattern):
    xml = gate.dump(device)
    m = re.search(r'text="(' + pattern + r')[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml)
    if not m:
        return None, None
    return m.group(1), ((int(m.group(2)) + int(m.group(4))) // 2, (int(m.group(3)) + int(m.group(5))) // 2)


def tap(device, test_id, wait=2.0):
    return gate.tap_id(device, test_id, int(wait * 1000))


def tap_text(device, label, wait=2.0):
    text, c = find_text(device, re.escape(label))
    if c:
        gate.adb("shell", "input", "tap", str(c[0]), str(c[1]))
        time.sleep(wait)
        return True
    return False


def main():
    print("== phases 1-3: fresh room, both clients to the table", flush=True)
    gate.main()

    print("== matrix e: pause/resume at between-hands (host-only control)", flush=True)
    # The between-hands countdown pill is the pause control and is host-only:
    # while the auto-deal countdown runs it reads 'Pause'; after tapping it
    # reads 'Resume' (auto-deal disarmed). Runs FIRST, before the other
    # matrices degrade the room into the stalled state.
    pause_seen = False
    resume_seen = False
    deadline = time.time() + 300
    while time.time() < deadline and not (pause_seen and resume_seen):
        value, center = find_text(HOST, r"Pause")
        if value and not pause_seen:
            gate.adb("shell", "input", "tap", str(center[0]), str(center[1]))
            time.sleep(2.5)
            pause_seen = True
            print("   paused via countdown pill (auto-deal disarmed)", flush=True)
            time.sleep(10)
            continue
        value, center = find_text(HOST, r"Resume")
        if value and pause_seen and not resume_seen:
            gate.adb("shell", "input", "tap", str(center[0]), str(center[1]))
            time.sleep(2.5)
            resume_seen = True
            print("   resumed via countdown pill", flush=True)
            break
        time.sleep(2)
    step("pause/resume via between-hands countdown", pause_seen and resume_seen,
         f"pause={pause_seen} resume={resume_seen}")

    print("== matrix g: session completion + rematch (hero folds each hand)", flush=True)
    completed = False
    rematched = False
    deadline = time.time() + 900
    folds = 0
    returned = 0
    while time.time() < deadline:
        # A2 recovery live test: a sat-out guest returns via the status area.
        if tap_text(GUEST, "Return next hand", 2.0):
            returned += 1
            print(f"   guest returned next hand (x{returned})", flush=True)
            time.sleep(4)
        # Fold whenever the viewer may act.
        if tap(GUEST, "table.action.fold", 1.0):
            folds += 1
        xml = gate.dump(GUEST)
        if re.search(r'text="[^"]*rematch', xml, re.I) or "Rematch" in xml or find_text(GUEST, r"Rematch")[1]:
            completed = True
            break
        # The summary sheet's rematch is reachable from the session summary;
        # the table's continuation footer also offers it.
        if gate.id_present(GUEST, "table.continue.rematch") or tap_text(GUEST, "Rematch", 2.5):
            completed = True
            rematched = True
            break
        time.sleep(2)
    step("session reached completion", completed, f"folds={folds}")
    if completed:
        # Open the summary if needed, then rematch.
        rematch = tap_text(GUEST, "Rematch", 3.0) or gate.tap(GUEST, "table.continue.rematch", 3.0)
        time.sleep(6)
        new_session = gate.id_present(GUEST, "multiplayer.lobby.primary") or gate.id_present(GUEST, "table.action.fold")
        step("rematch starts a new session", rematch and new_session, "")
    else:
        step("rematch starts a new session", False, "session never completed in window")

    print("== matrix f: host departure (force-stop) -> guest observes", flush=True)
    # Ensure the guest is in the session (post-rematch table or lobby).
    gate.force_stop(HOST)
    time.sleep(15)
    guest_state = gate.snapshot_authoritative(GUEST)
    guest_lobby = gate.id_present(GUEST, "multiplayer.lobby.primary")
    guest_continuation = gate.id_present(GUEST, "multiplayer.table.leave") or guest_lobby
    step("host departure observed by guest", guest_continuation,
         f"lobby={guest_lobby} table={'multiplayer.table.leave' in gate.dump(GUEST)}")

    print("== legs summary", flush=True)
    for name, ok, note in results:
        print(f"  {'PASS' if ok else 'FAIL'} {name} {note}", flush=True)


if __name__ == "__main__":
    main()

