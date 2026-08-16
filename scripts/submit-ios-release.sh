#!/usr/bin/env bash

set -euo pipefail

show_help() {
  cat <<'EOF'
Upload one explicit RiverMind IPA to App Store Connect.

Usage:
  pnpm submit:ios:testflight -- artifacts/ios/RiverMind-<commit>-<timestamp>.ipa

This command intentionally has no --latest mode. Local production builds are
not listed as EAS cloud builds, so choosing the latest cloud build can upload
an older binary.
EOF
}

if (( $# > 0 )); then
  if [[ "$1" == "--" ]]; then
    shift
  fi
fi

if [[ $# -eq 0 ]]; then
  show_help >&2
  exit 2
fi

if [[ "$1" == "--help" || "$1" == "-h" ]]; then
  show_help
  exit 0
fi

if [[ $# -ne 1 ]]; then
  show_help >&2
  exit 2
fi

rivermind_ipa_path="$1"
if [[ ! -f "$rivermind_ipa_path" || "$rivermind_ipa_path" != *.ipa ]]; then
  echo "Provide the exact path to an existing .ipa file." >&2
  exit 1
fi

rivermind_script_dir="$(cd "$(dirname "$0")" && pwd)"
rivermind_repo_dir="$(cd "$rivermind_script_dir/.." && pwd)"
cd "$rivermind_repo_dir"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.nvm/nvm.sh"
fi
if command -v nvm >/dev/null 2>&1; then
  nvm use 22 >/dev/null
fi

rivermind_ipa_path="$(cd "$(dirname "$rivermind_ipa_path")" && pwd)/$(basename "$rivermind_ipa_path")"
rivermind_test_notes='Please test improved Chinese localization, account deletion, optional AI consent, private-table stability, player avatars, and iPhone/iPad table layouts.'

pnpm dlx eas-cli@21.4.0 submit \
  --platform ios \
  --profile production \
  --path "$rivermind_ipa_path" \
  --what-to-test "$rivermind_test_notes" \
  --non-interactive \
  --wait
