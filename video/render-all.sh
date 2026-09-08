#!/usr/bin/env bash
# Renders every film to out/ at 1920x1080. ~2-4 min total on an M-series Mac.
set -euo pipefail
cd "$(dirname "$0")"

render () {
  echo "→ $1"
  npx remotion render src/index.ts "$1" "out/refract-$2.mp4" --log=error
}

render Intro        intro
render BestRoute    best-route
render Cashback     cashback
render LaunchPools  launch-pools

echo
echo "Done:"
ls -lh out/*.mp4
