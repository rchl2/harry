#!/bin/sh
# Fail when the package would miss a file the plugin imports.
set -e
cd "$(dirname "$0")/.."
npm pack --dry-run > /tmp/harry-pack.txt 2>&1
for file in plugin/index.ts plugin/lib.ts plugin/rpc.ts plugin/draft.ts plugin/rules.ts \
            plugin/gui/index.tsx plugin/gui/state.ts plugin/gui/commands.ts \
            plugin/gui/panel.tsx plugin/gui/pill.tsx plugin/gui/settings.tsx \
            dist/gui-experimental.cjs examples/goldens.jsonl \
            scripts/generate-goldens.py; do
  grep -q "$file" /tmp/harry-pack.txt || { echo "missing from package: $file"; exit 1; }
done
echo "pack ok"
