#!/bin/sh
# Sets up the ML service's Python environment (ml-service/.venv) and installs its libraries.
#
# The pinned libraries need Python 3.12 or newer. On a Mac, plain `python3` is often Apple's own
# Python 3.9, which is too old — so this looks for a newer one by name first.
set -e

PY=""
for candidate in python3.14 python3.13 python3.12 python3; do
  if command -v "$candidate" >/dev/null 2>&1 &&
    "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' 2>/dev/null; then
    PY="$candidate"
    break
  fi
done

if [ -z "$PY" ]; then
  echo "Python 3.12 or newer is needed, and none was found."
  echo "Install it (see README, step 1), open a new Terminal window, and run: npm run ml:setup"
  exit 1
fi

echo "Using $("$PY" --version) at $(command -v "$PY")"
cd "$(dirname "$0")/../ml-service"
"$PY" -m venv .venv
.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements-dev.txt
echo "ML environment ready in ml-service/.venv"
