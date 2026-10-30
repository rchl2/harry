# Testing the rules

The rules are prompts. Editing one can fix the case in front of you and break three others.

This rig tells you which. It runs an agent on a task, grades what it produced, and compares the result with the last run.

You need it when you edit `rules/writing_styles.md`. Not otherwise.

## Goldens

A golden is a small repo with one known prose problem, the task that should fix it, and the answer you expect.

`examples/` ships eleven, so the rig works on a fresh clone. They are generic — replace them with your own.

## Make your own

Run this from the project root:

```bash
python3 scripts/generate-goldens.py .
```

It scans for a real violation of each rule, copies the file into `.harry/goldens/`, and writes `.harry/goldens.jsonl` and `.harry/baseline.json`.

Your set takes over from the examples and stays with the project. Prune it to about five, keep the ones that show different rules, and add the failures that reached a customer. Every `uwotm8` earns one.

`.harry/` is not ignored. Commit it to share a set with the team, or ignore it to keep your own.

## Run

```bash
python3 run.py --all --repeats 3
```

Runs every golden three times in a throwaway repo and grades the diff, commit, PR body, and narration. Three runs because agent output varies. Slow and paid.

`--task <id>` runs one. Runs land in `.harry/runs/`, newest twenty kept.

## Compare

```bash
python3 compare.py .harry/baseline.json .harry/runs/<file>.json
```

Reports fixed, regressed, and flaky. A regression is a golden that always passed and now always fails. Gate on that, and only that.

Read from the bottom up: still failing is the work list, the pass rate goes last.

Change one rule per run. Read a failure before you rewrite the rule.

## Calibrate

```bash
python3 run.py --calibrate
```

Grades the bad and good example for each rule. Every rule must fail the bad one and pass the good one. A rule that cannot is a bug in the grader, not the rule.

## Judged rules

Four rules need reading rather than matching: why-not-what, restate, segmentation, and `what?` recovery.

They run through the opencode CLI, so they use the model and credentials you already have. `HARRY_JUDGE_MODEL` picks a different model.

For an OpenAI-compatible endpoint instead, set `HARRY_JUDGE_URL`, `HARRY_JUDGE_KEY`, and `HARRY_JUDGE_MODEL`. Without either path the judged rules pass and say so.

## Agents

`adapters/opencode.sh` is the only adapter. The contract is three lines at the top: task in `$1`, run in the current directory, narration on stdout. Copy it and change the command.

`HARRY_ADAPTER` picks the adapter by name. `HARRY_MODEL` passes a model through to it.

## Credit

The harness shape comes from Tony Cueva's [Build Your Eval Harness](https://x.com/tonycueva/status/2115089591824744957).
