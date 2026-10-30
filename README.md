# Harry

A linter for the prose your coding agent writes: comments, commit messages, PR bodies, names, error messages.

Agent output is often correct and unreadable. Harry checks it while you work, so reviewers spend their time on the logic instead of on `const data` and comments that repeat the code.

## Install

Needs Python 3.11 or newer.

```bash
npm_config_allow_git=all opencode plugin add 'github:rchl2/harry'
```

`npm_config_allow_git=all` is there because many npm configs set `allow-git`, which blocks git installs. Drop it if yours does not.

Restart opencode afterwards.

## What it does

When a turn changes the diff, Harry lints it and hands the findings to the agent, which fixes them. You get a count above the composer and a panel with the details.

Nothing blocks. If a finding is wrong, keep going and fix the rule.

## What it catches

```
$ /harry
  name_pronoun:5  `data` is a pronoun. Name what it holds.
```

- comments that restate the code
- commit subjects in past tense, or over fifty characters
- `const data`, `const temp`, `const result`
- `const fetchTimeout` with no unit
- `throw new Error('bad_payload')` with no next action
- commented-out code
- bare TODOs, and catches that swallow silently

## Commands

`/harry` lints now, without waiting for a turn. 
`/harry-status` shows whether it is loaded. 
`/harry-open` opens the rules. 
`/harry-reload` re-reads them after an edit. 
`/harry-update` reinstalls.
`/harry-goldens` builds a test set from this project. `/harry-eval` runs it. See [EVALS.md](EVALS.md).
`/commit` lints the staged diff, offers three subjects, and commits the one you pick. Harry also offers this when a turn ends clean with something staged.

## Rules

`rules/writing_styles.md`. Edit them. Settings has a Harry section for turning injection and the automatic check off.

## Limits

- It grades prose, not code. A clean run says nothing about whether the change works.
- Rubric-shaped comments are worse than none. Keep reading the output.
- The judged rules can flake.

## Credit

The harness shape comes from Tony Cueva's [Build Your Eval Harness](https://x.com/tonycueva/status/2115089591824744957).
