#!/bin/sh

# Adapter contract: task in $1, run in the current directory, print narration on stdout.
set -e
exec opencode run --standalone --format json --auto \
  ${HARRY_MODEL:+--model "$HARRY_MODEL"} "$1" \
  | python3 -c '
import json, sys
for line in sys.stdin:
    try:
        part = (json.loads(line).get("part") or {})
    except json.JSONDecodeError:
        continue
    if part.get("type") == "text" and part.get("text"):
        print(part["text"])
'
