#!/usr/bin/env python3
"""Compare two runs. Report first, gate second.

A regression is a golden that always passed and now always fails. Anything flakier is listed for a person to read.
"""

import argparse
import json
import pathlib
import sys

def status(runs, repeats):
    if len(runs) != repeats:
        return "error"
    passes = [r["pass"] for r in runs]

    if all(passes):
        return "always pass"

    if not any(passes):
        return "always fail"
    return "flaky"


def load(path):
    data = json.loads(pathlib.Path(path).read_text())
    counts = [len(entry["runs"]) for entry in data["results"].values() if entry["runs"]]
    repeats = max(counts) if counts else 0
    return {gid: status(entry["runs"], repeats) for gid, entry in data["results"].items()}

def summarise(label, statuses):
    counts = {}

    for s in statuses.values():
        counts[s] = counts.get(s, 0) + 1
    total = len(statuses)
    passed = counts.get("always pass", 0)

    print(f"{label}: {passed} of {total} always pass | " + " | ".join(f"{k} {v}" for k, v in sorted(counts.items())))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("baseline")
    parser.add_argument("current")
    parser.add_argument("--report-only", action="store_true")
    args = parser.parse_args()

    before, after = load(args.baseline), load(args.current)
    summarise("baseline", before)
    summarise("current", after)

    fixed, regressions, flaky, still = [], [], [], []

    for gid, now in after.items():
        was = before.get(gid, "error")
        if was != "always pass" and now == "always pass":
            fixed.append(gid)
        elif was == "always pass" and now == "always fail":
            regressions.append(gid)
        elif was == "always pass" and now == "flaky":
            flaky.append(gid)
        elif now == "always fail":
            still.append(gid)

    def block(title, ids):
        if ids:
            print(f"\n{title} ({len(ids)})")
            for gid in ids:
                print(f"  {before.get(gid, 'error')} -> {after[gid]}  {gid}")

    block("Fixed", fixed)
    block("Regressions", regressions)
    block("Now flaky, read these", flaky)
    block("Still failing", still)

    if regressions and not args.report_only:
        sys.exit(1)

if __name__ == "__main__":
    main()