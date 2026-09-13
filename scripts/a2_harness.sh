#!/bin/bash
# A2 two-simulator harness: boots both emulators, Metro, then runs the gate.
set -u
export PATH="$HOME/.nvm/versions/node/v22.19.0/bin:/usr/local/bin:$HOME/Library/Android/sdk/emulator:$HOME/Library/Android/sdk/platform-tools:$PATH"
cd /Users/haoyu/development/rivermind-poker

echo "== booting emulators"
nohup emulator -avd RiverMind_Foldable_API35 -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect -port 5554 -no-snapshot-load -no-snapshot-save > /tmp/emu_a.log 2>&1 &
nohup emulator -avd RiverMind_API35_b -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect -port 5556 -no-snapshot-load -no-snapshot-save > /tmp/emu_b.log 2>&1 &

for i in $(seq 1 40); do
  A=$(adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
  B=$(adb -s emulator-5556 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
  if [ "$A" = "1" ] && [ "$B" = "1" ]; then echo "both booted after ${i}0s"; break; fi
  sleep 10
done
adb devices

echo "== installing app (both)"
APK="${GATE_APK:-android/app/build/outputs/apk/debug/app-debug.apk}"
if [ -n "${GATE_APK:-}" ]; then adb -s emulator-5554 uninstall dev.isw.rivermindpoker > /dev/null 2>&1; adb -s emulator-5556 uninstall dev.isw.rivermindpoker > /dev/null 2>&1; fi
adb -s emulator-5554 install -r -g "$APK" | tail -1
adb -s emulator-5556 install -r -g "$APK" | tail -1

echo "== starting metro"
nohup pnpm exec expo start --dev-client --port 8081 > /tmp/metro.log 2>&1 &
sleep 25

echo "== launching apps"
adb -s emulator-5554 shell am start -n dev.isw.rivermindpoker/.MainActivity
adb -s emulator-5556 shell am start -n dev.isw.rivermindpoker/.MainActivity
sleep 40

echo "== running the gate"
python3 scripts/a2_two_client_gate.py
echo "== gate exit=$?"
