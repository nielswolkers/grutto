#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/src-tauri/icons/icon.png"
RGBA_SOURCE="$ROOT/src-tauri/icons/icon-rgba.png"
ICONSET="$ROOT/src-tauri/icons/grutto.iconset"

if [[ ! -f "$SOURCE" ]]; then
  echo "Missing Grutto source icon: $SOURCE" >&2
  exit 1
fi

# Tauri's PNG decoder requires an RGBA image. The supplied artwork can be RGB,
# so normalize it with Apple's native AppKit/CoreGraphics before generating sizes.
swift - "$SOURCE" "$RGBA_SOURCE" <<'SWIFT'
import AppKit
import Foundation

let input = CommandLine.arguments[1]
let output = CommandLine.arguments[2]
guard let image = NSImage(contentsOfFile: input),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fatalError("Unable to load source app icon: \(input)")
}
guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: cgImage.width,
    pixelsHigh: cgImage.height,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bitmapFormat: .alphaNonpremultiplied,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else {
    fatalError("Unable to create RGBA bitmap")
}
NSGraphicsContext.saveGraphicsState()
if let context = NSGraphicsContext(bitmapImageRep: bitmap) {
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    image.draw(in: NSRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height))
    context.flushGraphics()
}
NSGraphicsContext.restoreGraphicsState()
guard let data = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Unable to encode RGBA PNG")
}
try data.write(to: URL(fileURLWithPath: output))
SWIFT

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

make_icon() {
  local pixels="$1"
  local name="$2"
  sips -z "$pixels" "$pixels" "$RGBA_SOURCE" --out "$ICONSET/icon_$name.png" >/dev/null
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
echo "Generated RGBA PNGs and src-tauri/icons/icon.icns"
