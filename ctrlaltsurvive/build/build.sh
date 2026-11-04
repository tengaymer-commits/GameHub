#!/usr/bin/env bash
# Builds the standalone game:
#   dist/CtrlAltSurvive.html                 one self-contained HTML file (double-click to play)
#   dist/CtrlAltSurvive.exe                  Windows launcher with the game embedded
#   dist/CtrlAltSurvive-2003-windows.zip     both, plus a ReadMe
# Needs: node and go (cross-compiles for Windows from any OS).
# The exe icon step is optional and needs Playwright + Python 3.
set -euo pipefail
cd "$(dirname "$0")"
DIST=dist; L=launcher
mkdir -p "$DIST"
node bundle.js "$DIST/CtrlAltSurvive.html"
cp "$DIST/CtrlAltSurvive.html" "$L/game.html"

TMP=$(mktemp -d)
if node make_icon.js "$TMP" 2>/dev/null; then
  python3 mkres.py "$L/rsrc_windows_amd64.syso" "$TMP/icon256.png" "$TMP/icon48.png" "$TMP/icon32.png" "$TMP/icon16.png"
else
  echo "(skipping exe icon: Playwright not available)"
fi
rm -rf "$TMP"

( cd "$L" && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H windowsgui" -o "../$DIST/CtrlAltSurvive.exe" . )
cp ReadMe.txt "$DIST/ReadMe.txt"
rm -f "$DIST/CtrlAltSurvive-2003-windows.zip"
( cd "$DIST" && zip -q -9 CtrlAltSurvive-2003-windows.zip CtrlAltSurvive.exe CtrlAltSurvive.html ReadMe.txt )
ls -la "$DIST"
