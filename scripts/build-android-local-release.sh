#!/usr/bin/env bash
# Build an installable Android release APK locally, for device/emulator QA.
#
# EAS produces the store binary. This script exists because the Android QA loop
# cannot wait on a cloud build every time: it prebuilds the native project and
# assembles a Hermes release build signed with the local debug keystore, which
# is installable on an emulator or a dev device.
#
#   scripts/build-android-local-release.sh
#
# The output is NOT a store artifact — debug-signed release builds must never be
# uploaded to Google Play. Use `pnpm build:android:release` (EAS) for that.
# Perf measured on this build is representative (release variant, Hermes, no dev
# server); signing identity is the only difference.

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17)}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export EXPO_NO_TELEMETRY=1

keystore="${RIVERMIND_LOCAL_KEYSTORE:-$HOME/.android/debug.keystore}"
if [[ ! -f "$keystore" ]]; then
  echo "No signing keystore at $keystore." >&2
  echo "Generate one, or set RIVERMIND_LOCAL_KEYSTORE to a keystore whose" >&2
  echo "alias/password are supplied by KEYSTORE_ALIAS / KEYSTORE_PASSWORD." >&2
  exit 1
fi

commit="$(git rev-parse --short HEAD)"
stamp="$(date +%Y%m%d-%H%M%S)"
output_dir="artifacts/android"
mkdir -p "$output_dir"

echo "[android-local] prebuild (generates android/ from app.json + plugins)"
node_modules/.bin/expo prebuild --platform android --clean

echo "sdk.dir=$ANDROID_HOME" > android/local.properties

echo "[android-local] assembleRelease (first run downloads Gradle; expect several minutes)"
(cd android && ./gradlew --no-daemon assembleRelease \
  -Pandroid.injected.signing.store.file="$keystore" \
  -Pandroid.injected.signing.store.password="${KEYSTORE_PASSWORD:-android}" \
  -Pandroid.injected.signing.key.alias="${KEYSTORE_ALIAS:-androiddebugkey}" \
  -Pandroid.injected.signing.key.password="${KEY_PASSWORD:-android}")

built_apk="android/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$built_apk" ]]; then
  echo "Gradle reported success but $built_apk is missing." >&2
  exit 1
fi

artifact="$output_dir/RiverMind-${commit}-${stamp}-local-release.apk"
cp "$built_apk" "$artifact"
echo "[android-local] built $artifact"

# Play's target-API and 16 KB page rules are asserted before a human installs
# anything, so a broken toolchain fails here rather than at submission time.
node scripts/verify-android-artifact.mjs "$artifact"

echo "[android-local] install with: adb install -r -g $artifact"
