#!/usr/bin/env bash
# Regenerate the ML architecture diagrams (SVG/HTML), export PNG with headless Chrome, then PDF from the PNG
# (Pillow, via ml-service/.venv) — Chrome's --print-to-pdf hangs on some macOS setups.
# Usage: bash docs/ml/diagrams/render.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
python3 docs/ml/diagrams/build_diagrams.py
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PROFILE="$(mktemp -d)"
render() { # name width height
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" --force-device-scale-factor=2 \
    --window-size="$2,$3" --screenshot="docs/$1.png" "file://$PWD/docs/$1.html" >/dev/null 2>&1
  ml-service/.venv/bin/python -c "from PIL import Image; Image.open('docs/$1.png').convert('RGB').save('docs/$1.pdf', resolution=200)"
  echo "rendered docs/$1.png and .pdf"
}
render architecture-diagram-ml 1600 1240
render service-communication-diagram-ml 1600 1260
rm -rf "$PROFILE"
