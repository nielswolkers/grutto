#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/src-tauri/icons/icon.png"
ICONSET="$ROOT/src-tauri/icons/grutto.iconset"

if [[ ! -f "$SOURCE" ]]; then
  echo "Missing Grutto source icon: $SOURCE" >&2
  exit 1
fi

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

make_icon() {
  local pixels="$1"
  local name="$2"
  sips -z "$pixels" "$pixels" "$SOURCE" --out "$ICONSET/icon_$name.png" >/dev/null
}

make_icon 16 "16x16"
make_icon 32 "16x16@2x"
make_icon 32 "32x32"
make_icon 64 "32x32@2x"
make_icon 128 "128x128"
make_icon 256 "128x128@2x"
make_icon 256 "256x256"
make_icon 512 "256x256@2x"
make_icon 512 "512x512"
make_icon 1024 "512x512@2x"

iconutil -c icns "$ICONSET" -o "$ROOT/src-tauri/icons/icon.icns"
echo "Generated src-tauri/icons/icon.icns"
