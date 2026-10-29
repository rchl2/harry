"""Deterministic fixes for commit subjects. Prints a suggestion."""

import re

PAST = {
    "added": "Add", "fixed": "Fix", "updated": "Update", "changed": "Change",
    "removed": "Remove", "refactored": "Refactor", "moved": "Move",
    "created": "Create", "improved": "Improve", "renamed": "Rename",
    "deleted": "Delete", "bumped": "Bump", "reverted": "Revert",
    "implemented": "Implement", "made": "Make", "used": "Use",
}

LIMIT = 50

def subject(text):
    first = text.strip().split("\n", 1)[0].strip()
    if not first:
        return ""

    first = re.sub(r"^we\s+", "", first, flags=re.I)
    words = first.rstrip(".").split()

    if words and words[0].lower() in PAST:
        words[0] = PAST[words[0].lower()]
    out = " ".join(words)

    if len(out) > LIMIT:
        out = out[:LIMIT].rsplit(" ", 1)[0]
    return out
