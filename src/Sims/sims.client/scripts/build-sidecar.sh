#!/usr/bin/env bash
# Needle sidecar PyInstaller build — npm script'inden çağrılır.
# NOT: Bu dosya MSBuild tarafından package.g.props'a gömülür; burada $(...)
# kalıpları sorun değildir çünkü artık package.json'a yazılmıyor.
set -e
cd "$(dirname "$0")/.."

NEEDLE_DYLIB=$(ls -t "$HOME"/.cache/cactus-needle/*/libneedle.dylib 2>/dev/null | head -1)
EXTRA="--hidden-import needle --hidden-import needle.agent.fetch --hidden-import needle.agent.tools --add-data src-tauri/binaries/intents.tr.json:."
if [ -n "$NEEDLE_DYLIB" ]; then
  EXTRA="$EXTRA --add-binary $NEEDLE_DYLIB:."
fi

PYINSTALLER="python3 -m PyInstaller"
[ -f src-tauri/binaries/.venv/bin/pyinstaller ] && PYINSTALLER="src-tauri/binaries/.venv/bin/pyinstaller"

$PYINSTALLER --onefile --clean \
  --name main-aarch64-apple-darwin \
  src-tauri/binaries/main.py \
  --distpath src-tauri/binaries \
  $EXTRA \
  --copy-metadata genai_prices --copy-metadata pydantic_ai_slim --copy-metadata pydantic_graph \
  --copy-metadata openai --copy-metadata pydantic --copy-metadata pydantic_core \
  --copy-metadata httpx --copy-metadata anyio --copy-metadata google_genai

cp -f src-tauri/binaries/main-aarch64-apple-darwin src-tauri/target/debug/main 2>/dev/null || true
rm -rf src-tauri/binaries/build build main-aarch64-apple-darwin.spec
echo "[build-sidecar] OK → src-tauri/target/debug/main"
