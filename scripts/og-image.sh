#!/bin/sh
# Renders the link-preview image (assets/og-image.html -> public/og-image.png,
# 1200x630) and the home-screen icon (assets/icon.svg -> public/apple-touch-icon.png).
# Needs Google Chrome. Run with: npm run og-image
set -e
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
if [ ! -x "$CHROME" ]; then
  echo "Google Chrome not found. Set CHROME to its path." >&2
  exit 1
fi

render() { # source, output, width, height
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size="$3,$4" --screenshot="$PWD/$2" "file://$PWD/$1" >/dev/null 2>&1
  echo "Wrote $2"
}

render assets/og-image.html public/og-image.png 1200 630
render assets/icon.svg public/apple-touch-icon.png 180 180
