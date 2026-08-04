#!/usr/bin/env bash

set -euo pipefail

show_help() {
  cat <<'EOF'
Build a signed RiverMind IPA with Expo EAS.

Usage:
  pnpm build:ios:release

What this script does:
  1. Requires a clean local master branch.
  2. Fetches origin/master and fast-forwards to the latest merged PR.
  3. Runs the complete RiverMind release check.
  4. Creates a signed iOS production build on Expo and waits for it.
  5. Prints the Expo build page, where the IPA can be downloaded.

What this script does not do:
  - It does not download the IPA to this Mac.
  - It does not upload or submit anything to App Store Connect.

Before the first run:
  - Install dependencies with: pnpm install
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
  nvm use 22 >/dev/null
fi

for rivermind_command in git node pnpm; do
  if ! command -v "${rivermind_command}" >/dev/null 2>&1; then
    echo "Required command is missing: ${rivermind_command}" >&2
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
echo "Building commit ${rivermind_commit:0:7}: $(git log -1 --pretty=%s)"

echo "Running the RiverMind release gate..."
pnpm release:check

echo "Confirming the Expo account..."
pnpm dlx eas-cli@21.4.0 whoami

echo "Starting the signed Expo production build..."
EAS_BUILD_NO_EXPO_GO_WARNING=true pnpm dlx eas-cli@21.4.0 build \
  --platform ios \
  --profile production \
  --non-interactive \
  --wait

echo
echo "Build complete for commit ${rivermind_commit:0:7}."
echo "Download the IPA from the Expo build link printed above."
echo "Nothing was submitted to App Store Connect."
