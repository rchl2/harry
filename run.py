#!/usr/bin/env python3
"""Run the writing harness.

  --diff        lint a diff. Deterministic only, no agent, no cost. Use this on
                every task, before handing work over.
  --calibrate   grade the fixtures. Every grader must fail its bad fixture and
                pass its good one. Run this after touching a grader.
  --task ID     run an agent on a golden, capture the artifacts, grade them.
                Slow and paid. Use this when you change a rule.

Nothing here blocks. compare.py decides that.
"""

import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).parent
sys.path.insert(0, str(ROOT))

import graders.deterministic as det  # noqa: E402
import graders.fix as fix  # noqa: E402
import graders.judges as judges  # noqa: E402

RULES = sorted(set(det.DETERMINISTIC) | set(judges.RULES))
KEEP_RUNS = 20

def load_goldens(only=None):
    rows = [json.loads(line) for line in (ROOT / "goldens.jsonl").read_text().splitlines() if line.strip()]
    return [r for r in rows if not only or r["id"] == only]

def grade_bundle(bundle, rules=None, judged=True):
    findings = det.grade(bundle, rules)
    verdicts = judges.grade(bundle, rules) if judged else []
    failed = {f["rule"] for f in findings} | {v["rule"] for v in verdicts if not v["pass"]}
    return {
        "pass": not failed,
        "failed_rules": sorted(failed),
        "findings": findings,
        "verdicts": verdicts,
    }

def print_findings(result):
    for f in result["findings"]:
        print(f"  {f['rule']}:{f['line']}  {f['message']}")
        if f["excerpt"]:
            print(f"    {f['excerpt']}")
    for v in result["verdicts"]:
        if not v["pass"]:
            print(f"  {v['rule']}  {v['reason']}")

def calibrate():
    """A grader that cannot separate bad from good is a harness bug."""
    fixtures = json.loads((ROOT / "fixtures.json").read_text())
    judged = not judges.available()
    ok = True
    for rule, pair in fixtures.items():
        if judged and rule in judges.RULES:
            print(f"skip  {rule}: no judge")
            continue
        bad = grade_bundle(pair["bad"], {rule})
        good = grade_bundle(pair["good"], {rule})

        if bad["pass"]:
            print(f"FAIL  {rule}: passed the bad fixture")
            ok = False
        elif not good["pass"]:
            print(f"FAIL  {rule}: failed the good fixture -> {good['failed_rules']}")
            ok = False
        else:
            print(f"ok    {rule}")
    return 0 if ok else 1

def capture(workdir, surface):
    def git(*args):
        return subprocess.run(
            ["git", *args], cwd=workdir, capture_output=True, text=True
        ).stdout

    # a commit golden has already moved HEAD, so read the commit itself
    diff = git("show", "--format=", "HEAD") if surface == "commit" else git("diff", "HEAD")
    bundle = {"diff": diff, "commit": git("log", "-1", "--format=%B")}
    body = pathlib.Path(workdir) / "PR_BODY.md"

    if body.exists():
        bundle["pr_body"] = body.read_text()
    return bundle

def run_agent(golden, workdir):
    adapter = ROOT / "adapters" / f"{os.environ.get('HARRY_ADAPTER', 'opencode')}.sh"
    if not adapter.exists():
        sys.exit(f"no adapter {adapter}. Copy adapters/opencode.sh.")

    prompt = golden["task"]
    if golden["surface"] == "pr_body":
        prompt += "\n\nWrite the body to PR_BODY.md. Do not commit it."
    if golden["surface"] == "commit":
        prompt += "\n\nCommit the change when done."

    env = {**os.environ}
    # subprocess does not update PWD, and opencode resolves its project from it.
    env["PWD"] = workdir

    proc = subprocess.run([str(adapter), prompt], cwd=workdir, capture_output=True, text=True, timeout=1800, env=env)
    if proc.returncode != 0:
        print(f"  adapter exited {proc.returncode}: {proc.stderr.strip()[:300]}")
    return proc.stdout

def execute(golden, repeats):
    results = []

    for i in range(repeats):
        workdir = ROOT / ".scratch" / f"{golden['id']}-{i}"
        shutil.rmtree(workdir, ignore_errors=True)
        workdir.mkdir(parents=True)

        try:
            subprocess.run(["git", "init", "--quiet"], cwd=workdir, check=True)
            seed = ROOT / golden["dir"]
            for source in seed.rglob("*"):
                if source.is_file():
                    target = workdir / source.relative_to(seed)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, target)

            subprocess.run(["git", "add", "-A"], cwd=workdir, check=True)
            subprocess.run(["git", "-c", "user.email=harness@local", "-c", "user.name=harness", "commit", "--quiet", "-m", "seed"], cwd=workdir, check=True)

            narration = run_agent(golden, workdir)
            bundle = capture(workdir, golden["surface"])

            if golden["surface"] == "narration":
                bundle["narration"] = narration
            result = grade_bundle(bundle, {golden["rule"]})

            if golden["surface"] != "narration" and not bundle["diff"].strip():
                result["findings"].append({
                    "rule": "no_change", "line": 0,
                    "message": "the agent produced no diff.",
                    "excerpt": "",
                })

                result["failed_rules"] = sorted(set(result["failed_rules"]) | {"no_change"})
                result["pass"] = False

            result["run"] = i + 1
            result["bundle"] = bundle
            results.append(result)

            print(f"  run {i + 1}: {'pass' if result['pass'] else result['failed_rules']}")
            print_findings(result)
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
            try:
                workdir.parent.rmdir()
            except OSError:
                pass
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--diff", nargs="?", const="-", help="lint a diff file, or - for stdin")
    parser.add_argument("--commit-msg", help="lint a commit message file")
    parser.add_argument("--calibrate", action="store_true")
    parser.add_argument("--task")
    parser.add_argument("--repeats", type=int, default=1)
    parser.add_argument("--strict", action="store_true", help="exit 1 on findings")
    parser.add_argument("--suggest", action="store_true", help="suggest a fixed commit subject")
    args = parser.parse_args()

    if args.calibrate:
        sys.exit(calibrate())

    if args.commit_msg:
        text = pathlib.Path(args.commit_msg).read_text()
        result = grade_bundle({"commit": text}, {"commit_subject"}, judged=False)

        if result["pass"]:
            print("clean")
        else:
            print_findings(result)
            if args.suggest:
                better = fix.subject(text)
                if better:
                    print(f"\nsuggested: {better}")
        sys.exit(0 if result["pass"] or not args.strict else 1)

    if args.diff:
        text = sys.stdin.read() if args.diff == "-" else pathlib.Path(args.diff).read_text()
        result = grade_bundle({"diff": text}, judged=False)

        if result["pass"]:
            print("clean")
        else:
            print_findings(result)
        sys.exit(0 if result["pass"] or not args.strict else 1)

    goldens = load_goldens(args.task)
    if not goldens:
        sys.exit(f"no golden with id {args.task}")

    report = {"started": time.strftime("%Y-%m-%dT%H:%M:%S"), "results": {}}

    for golden in goldens:
        print(f"{golden['id']} ({golden['rule']})")
        report["results"][golden["id"]] = {
            "rule": golden["rule"],
            "runs": execute(golden, args.repeats),
        }

    out = ROOT / "runs" / f"{report['started'].replace(':', '')}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))
    prune_runs()
    print(f"\nwrote {out}")

def prune_runs(keep=KEEP_RUNS):
    """Runs carry whole diffs. Keep the newest few, drop the rest."""
    runs = sorted((ROOT / "runs").glob("*.json"))

    for old in runs[:-keep]:
        old.unlink(missing_ok=True)

if __name__ == "__main__":
    main()