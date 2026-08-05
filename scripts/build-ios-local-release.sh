#!/usr/bin/env bash

set -euo pipefail

show_help() {
  cat <<'EOF'
Build a signed RiverMind IPA on this Mac with EAS Local Build.

Usage:
  bash scripts/build-ios-local-release.sh

  # Once your shell is already using Node 22.19 or newer:
  pnpm build:ios:release:local

What this script does:
  1. Activates the newest installed Node 22 through nvm, when available.
  2. Requires a clean local master branch.
  3. Fetches origin/master and fast-forwards to the latest merged PR.
  4. Checks the local Xcode, CocoaPods, and fastlane toolchain.
  5. Runs the complete RiverMind release check.
  6. Builds and signs the production IPA locally without using an EAS cloud worker.
  7. Saves a uniquely named IPA under artifacts/ios.

What this script does not do:
  - It does not upload or submit anything to App Store Connect.
  - It does not avoid Expo authentication when EAS-managed credentials are used.

Before the first run:
  - Install Node 22.19 or newer with: nvm install 22
  - Install CocoaPods with: brew install cocoapods
  - Install fastlane with: brew install fastlane
  - Sign in to Expo with: pnpm dlx eas-cli@21.4.0 login
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  show_help
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "Unknown option: $1" >&2
  show_help >&2
  exit 2
fi

rivermind_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rivermind_repo_dir="$(cd "${rivermind_script_dir}/.." && pwd)"
cd "${rivermind_repo_dir}"

rivermind_nvm_script="${NVM_DIR:-${HOME}/.nvm}/nvm.sh"
if [[ -s "${rivermind_nvm_script}" ]]; then
  # shellcheck source=/dev/null
  source "${rivermind_nvm_script}"
fi

if command -v nvm >/dev/null 2>&1; then
  if ! nvm use 22 >/dev/null; then
    echo "Node 22 is not installed. Install it with: nvm install 22" >&2
    exit 1
  fi
fi

for rivermind_command in git node pnpm xcodebuild pod fastlane; do
  if ! command -v "${rivermind_command}" >/dev/null 2>&1; then
    echo "Required command is missing: ${rivermind_command}" >&2
    if [[ "${rivermind_command}" == "pod" ]]; then
      echo "Install it with: brew install cocoapods" >&2
    elif [[ "${rivermind_command}" == "fastlane" ]]; then
      echo "Install it with: brew install fastlane" >&2
    fi
    exit 1
  fi
done

node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 19)) {
    console.error(`Node 22.19 or newer is required; found ${process.versions.node}.`);
    process.exit(1);
  }
'

if ! rivermind_cocoapods_version="$(pod --version 2>/dev/null)"; then
  echo "CocoaPods is installed but cannot run." >&2
  echo "Repair the Homebrew installation with: brew upgrade cocoapods" >&2
  echo "Then verify it with: pod --version" >&2
  exit 1
fi

if ! rivermind_fastlane_details="$(fastlane --version 2>/dev/null)"; then
  echo "fastlane is installed but cannot run." >&2
  echo "Repair the Homebrew installation with: brew upgrade fastlane" >&2
  echo "Then verify it with: fastlane --version" >&2
  exit 1
fi
rivermind_fastlane_version="${rivermind_fastlane_details##*$'\n'}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Local iOS release builds require macOS." >&2
  exit 1
fi

rivermind_developer_dir="$(xcode-select -p)"
if [[ "${rivermind_developer_dir}" == *"Xcode-beta.app"* ]]; then
  echo "Warning: the active toolchain is Xcode beta (${rivermind_developer_dir})." >&2
  echo "Use a stable App Store-supported Xcode before submitting this IPA." >&2
fi

rivermind_branch="$(git branch --show-current)"
if [[ "${rivermind_branch}" != "master" ]]; then
  echo "Release builds must start on master; current branch is ${rivermind_branch:-detached}." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "The workspace has local changes. Commit or stash them before building." >&2
  git status --short >&2
  exit 1
fi

echo "Fetching the latest merged master..."
git fetch origin master

rivermind_head="$(git rev-parse HEAD)"
rivermind_origin_master="$(git rev-parse origin/master)"
if [[ "${rivermind_head}" != "${rivermind_origin_master}" ]]; then
  if git merge-base --is-ancestor HEAD origin/master; then
    git merge --ff-only origin/master
  else
    echo "Local master is ahead of or diverged from origin/master. Resolve it before building." >&2
    exit 1
  fi
fi

rivermind_commit="$(git rev-parse HEAD)"
rivermind_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
rivermind_artifacts_dir="${rivermind_repo_dir}/artifacts/ios"
rivermind_ipa_path="${rivermind_artifacts_dir}/RiverMind-${rivermind_commit:0:7}-${rivermind_timestamp}.ipa"
mkdir -p "${rivermind_artifacts_dir}"

echo "Building commit ${rivermind_commit:0:7}: $(git log -1 --pretty=%s)"
rivermind_xcode_details="$(xcodebuild -version)"
rivermind_xcode_version="${rivermind_xcode_details%%$'\n'*}"
echo "Using $(node --version), ${rivermind_xcode_version}, CocoaPods ${rivermind_cocoapods_version}, and ${rivermind_fastlane_version}."

echo "Running the RiverMind release gate..."
pnpm release:check

echo "Confirming the Expo account..."
pnpm dlx eas-cli@21.4.0 whoami

echo "Starting the signed production build on this Mac..."
EAS_BUILD_NO_EXPO_GO_WARNING=true pnpm dlx eas-cli@21.4.0 build \
  --platform ios \
  --profile production \
  --local \
  --non-interactive \
  --output "${rivermind_ipa_path}"

echo
echo "Local build complete for commit ${rivermind_commit:0:7}."
echo "IPA: ${rivermind_ipa_path}"
echo "Nothing was uploaded or submitted to App Store Connect."
