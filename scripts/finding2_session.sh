#!/bin/bash
# Finding-2 root-cause session: run the gate until the touch-dead relaunch is
# detected, then capture JS/diagnostics evidence from the frozen process.
set -u
export PATH="$HOME/.nvm/versions/node/v22.19.0/bin:/usr/local/bin:$HOME/Library/Android/sdk/platform-tools:$PATH"
cd /Users/haoyu/development/rivermind-poker

for RUN in 1 2 3; do
  echo "== gate run $RUN"
  python3 scripts/a2_two_client_gate.py > /tmp/f2_gate_$RUN.log 2>&1
  if grep -q "touch-dead first relaunch" /tmp/f2_gate_$RUN.log; then
    echo "== TOUCH-DEAD DETECTED in run $RUN — capturing diagnostics"
    # The gate's matrix c left the guest frozen after its second restart
    # recovery; reproduce once more under observation:
    adb -s emulator-5556 logcat -d > /tmp/f2_logcat_guest.log 2>&1
    adb -s emulator-5554 logcat -d > /tmp/f2_logcat_host.log 2>&1
    GUEST_PID=$(adb -s emulator-5556 shell "pidof dev.isw.rivermindpoker" | tr -d '\r')
    echo "guest pid: $GUEST_PID"
    if [ -n "$GUEST_PID" ]; then
      adb -s emulator-5556 shell "kill -3 $GUEST_PID"
      sleep 4
      adb -s emulator-5556 logcat -d -t 200 > /tmp/f2_trace.log 2>&1
    fi
    echo "== diagnostics captured: /tmp/f2_logcat_guest.log /tmp/f2_trace.log"
    break
  fi
  grep -E "PASS|FAIL" /tmp/f2_gate_$RUN.log | head -8
done
echo "== session complete"
