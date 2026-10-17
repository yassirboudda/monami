#!/usr/bin/env bash
# Zips extension/ into public/octohandy-extension.zip
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -r "$ROOT/extension" "$TMP/octohandy-extension"
rm -f "$ROOT/public/octohandy-extension.zip"
(cd "$TMP" && zip -rq "$ROOT/public/octohandy-extension.zip" octohandy-extension)
echo "packed $(unzip -l "$ROOT/public/octohandy-extension.zip" | tail -1)"
