# Changing a rule

The README covers using Harry. This covers keeping the rules honest.

A rule file decays when nobody can tell whether an edit helped. So every rule has a bad example and a good one, and every change has to show its numbers.

This is a maintenance tool, not a second product. You need it when you edit `rules/writing_styles.md`, and rarely otherwise.

## Calibrate

```bash
python3 run.py --calibrate
```

Grades the bad and good example for each rule. Every rule must fail the bad one and pass the good one. A rule that cannot is a bug in the grader, not the rule.

Run this after touching a grader.

## Generate goldens

Goldens are yours, not the repo's. Point the generator at your projects:

```bash
python3 scripts/generate-goldens.py ../project ../project-crm
```

It scans each repo for a real violation of each rule, copies the file into `goldens/<repo>-<rule>/`, and writes `goldens.jsonl` and `baseline.json`. Both are gitignored.

The output is a starter. Prune it, keep it small, and add the failures that actually reached a customer. Every `what?` earns one.

## Run a task

```bash
python3 run.py --task obok-name_pronoun --repeats 3
```

Runs a real agent on the task in a throwaway repo, captures the diff, commit, PR body, and narration, and grades them. Slow and paid. Three runs, because agent output varies.

## Compare

```bash
python3 compare.py baseline.json runs/<file>.json --report-only
```

Reports fixed, regressed, and flaky. A regression is a task that always passed and now always fails. Gate on that, and only that.

Runs land in `runs/`, which is gitignored. Each carries the whole diff, so `run.py` keeps the newest twenty. Raise `KEEP_RUNS` for a longer history.

Change one rule per run. Read a failure before you rewrite the rule.

## Judged rules

Four rules need reading rather than matching: why-not-what, restate, segmentation, and `what?` recovery.

They run through the opencode CLI, so they use the model and credentials you already have. Nothing to configure.

Only set the variables below if judging has to go somewhere else — a different provider, a cheaper model, or CI:

```bash
export HARRY_JUDGE_URL="https://api.example.com/v1/chat/completions"
export HARRY_JUDGE_KEY="sk-..."
export HARRY_JUDGE_MODEL="some-model"
```

`HARRY_JUDGE_KEY_FILE` works instead of `HARRY_JUDGE_KEY` if you keep keys in files. `HARRY_JUDGE_MODEL` is optional.

They are read at import, so put them in your shell profile or a `direnv` entry. Without either path the judged rules pass and say so.

## Agents

`adapters/opencode.sh` is the only adapter. The contract is three lines at the top of the file: task in `$1`, run in the current directory, narration on stdout. Copy it and change the command.

`HARRY_ADAPTER` picks the adapter by name. `HARRY_MODEL` passes a model through to it. Neither is needed if you use opencode and its default model.
