# Testing the rules

The rules are prompts. Editing one is a prompt edit, and a prompt edit can fix the case in front of you while breaking three others.

This is the rig that tells you which. It runs an agent on a task, grades what it produced, and compares the result with the last run.

You need it when you edit `rules/writing_styles.md`. Not otherwise.

## Goldens

A golden is a small repo with one known prose problem, the task that should fix it, and the answer you expect.

`examples/` ships five, so the rig works on a fresh clone. They are generic — replace them with your own.

## Make your own

```bash
python3 scripts/generate-goldens.py ../your-project
```

It scans the repo for a real violation of each rule, copies the file into `goldens/<repo>-<rule>/`, and writes `goldens.jsonl` and `baseline.json`. All three are gitignored, and your set takes over from the examples.

The output is a starter. Prune it to about five, keep the ones that show different rules, and add the failures that actually reached a customer. Every `uwotm8` earns one.

## Run

```bash
python3 run.py --all --repeats 3
```

Runs every golden three times in a throwaway repo and grades the diff, commit, PR body, and narration. Three runs because agent output varies. Slow and paid.

`--task <id>` runs one.

## Compare

```bash
python3 compare.py baseline.json runs/<file>.json
```

Reports fixed, regressed, and flaky. A regression is a golden that always passed and now always fails. Gate on that, and only that.

Read from the bottom up: still failing is the work list, the pass rate goes last.

Change one rule per run. Read a failure before you rewrite the rule.

## In opencode

`/harry-goldens` asks the agent to build a set from the current project. `/harry-eval` runs the set once and reports the count.

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

## Updating

`/harry-update`, then restart. It removes the plugin, clears the cache, and re-adds it.

`opencode plugin update` does not work for a git spec, and re-adding alone reuses the cache. The command does both steps.

## Layout

The repo is the npm package. `exports` points at `plugin/index.ts`, and `files` ships the harness beside it, so the plugin resolves from its own package root.

Resolution order is `HARRY_HARNESS`, then the project's `.harry/`, then the package root.

## Credit

The harness shape comes from Tony Cueva's [Build Your Eval Harness](https://x.com/tonycueva/status/2115089591824744957).
