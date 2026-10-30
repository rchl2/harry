#!/usr/bin/env python3
"""Generate goldens from your own repos.

Takes repo paths, finds a real violation of each rule, copies the file into goldens/<repo>-<rule>/, and writes goldens.jsonl plus baseline.json.

The result is a starter set. Prune it, keep it small, and add the failures that actually reached a customer.
"""

import json
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from graders import deterministic as det  # noqa: E402

SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".php", ".py"}
SKIP_DIRS = {"node_modules", "vendor", ".git", "dist", "build", "storage", ".harry"}
MAX_PER_REPO = 4
MAX_FILE_BYTES = 40_000

TASKS = {
    "comment_detritus": "In {path}, replace the comment that describes history with one that says what is true now.",
    "comment_restates": "In {path}, replace the comment that restates the code with one that says why.",
    "name_pronoun": "In {path}, rename the vague local so the name says what it holds.",
    "error_message": "In {path}, make every thrown error say what happened and what to do next.",
    "commit_subject": "Add a one-line note to the README under the title, then commit it.",
    "pr_body": "Write the PR body for the diff between HEAD~1 and HEAD.",
    "narration": "Explain what {path} does and where it can fail.",
}

EXPECTED = {
    "comment_detritus": "The comment carries the reason or the trap. No `we`, no `changed`, no history.",
    "comment_restates": "The comment carries the reason, not a description of the next line.",
    "name_pronoun": "The new name says what the value holds. No comment needed to disambiguate.",
    "error_message": "Each throw reads `code: what happened, what to do`.",
    "commit_subject": "Imperative subject under fifty characters, no trailing period, no `we`. The body says why.",
    "pr_body": "One sentence a reviewer can restate, then what changed, why, and how to check it.",
    "narration": "Segmented, one idea per paragraph, told as a story. Not a wall.",
}

def files(repo):
    for path in repo.rglob("*"):
        if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
            continue
        if SKIP_DIRS & set(path.parts):
            continue
        if path.stat().st_size > MAX_FILE_BYTES:
            continue
        yield path

def probe(path, rule):
    """True when this file shows a real violation of the rule."""
    text = path.read_text(errors="ignore")
    diff = "\n".join(f"+{line}" for line in text.splitlines())
    return bool(det.DETERMINISTIC[rule]({"diff": diff}))

def bad_commits(repo):
    out = subprocess.run(["git", "log", "-40", "--format=%s"], cwd=repo, capture_output=True, text=True).stdout.splitlines()
    return [s for s in out if len(s) > 50 or det.PAST_TENSE.search(s)]

def main():
    if len(sys.argv) < 2:
        sys.exit("usage: generate-goldens.py <repo> [repo...]")
    repos = {}

    for raw in sys.argv[1:]:
        path = pathlib.Path(raw).expanduser().resolve()
        if not (path / ".git").exists():
            sys.exit(f"{path} is not a git repo.")
        repos[path.name] = str(path)

    # the set belongs to the project, not to wherever the script was run from
    target = pathlib.Path(next(iter(repos.values()))) / ".harry"
    shutil.rmtree(target / "goldens", ignore_errors=True)
    rows = []

    for name, raw in repos.items():
        repo = pathlib.Path(raw).expanduser()
        if not (repo / ".git").exists():
            print(f"skip  {name}: not a git repo")
            continue

        made = 0
        for rule in ("comment_detritus", "comment_restates", "name_pronoun", "error_message"):
            if made >= MAX_PER_REPO:
                break
            for path in files(repo):
                if not probe(path, rule):
                    continue
                rel = path.relative_to(repo)
                gid = f"{name}-{rule}"
                dest = target / "goldens" / gid / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, dest)
                rows.append({
                    "id": gid,
                    "rule": rule,
                    "surface": "diff",
                    "dir": f"goldens/{gid}",
                    "task": TASKS[rule].format(path=rel),
                    "expected": EXPECTED[rule],
                })
                made += 1
                break

        if bad_commits(repo) and made < MAX_PER_REPO:
            gid = f"{name}-commit"
            dest = target / "goldens" / gid
            dest.mkdir(parents=True, exist_ok=True)
            (dest / "README.md").write_text(f"# {name}\n")
            rows.append({
                "id": gid,
                "rule": "commit_subject",
                "surface": "commit",
                "dir": f"goldens/{gid}",
                "task": TASKS["commit_subject"],
                "expected": EXPECTED["commit_subject"],
            })

        if made < MAX_PER_REPO:
            first = next(files(repo), None)
            if first is not None:
                rel = first.relative_to(repo)
                gid = f"{name}-narration"
                dest = target / "goldens" / gid / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(first, dest)
                rows.append({
                    "id": gid,
                    "rule": "narration_segmented",
                    "surface": "narration",
                    "dir": f"goldens/{gid}",
                    "task": TASKS["narration"].format(path=rel),
                    "expected": EXPECTED["narration"],
                })
                made += 1

    if not rows:
        sys.exit("found nothing to seed. Add more repos or write goldens by hand.")

    first = next(iter(repos.values()))
    rows.append({
        "id": "pr-body",
        "rule": "pr_body",
        "surface": "pr_body",
        "dir": "goldens/pr-body",
        "task": TASKS["pr_body"],
        "expected": EXPECTED["pr_body"],
    })

    dest = target / "goldens" / "pr-body"
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "README.md").write_text("# notes\n")

    (target / "goldens.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n")
    baseline = {"results": {r["id"]: {"rule": r["rule"], "runs": []} for r in rows}}
    (target / "baseline.json").write_text(json.dumps(baseline, indent=2) + "\n")

    print(f"\n{len(rows)} goldens from {len(repos)} repos. Prune what you do not want.")
    return 0

if __name__ == "__main__":
    sys.exit(main())