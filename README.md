# Harry

A linter for the prose that ships with code: comments, commit messages, PR bodies, names, error messages.

It runs inside opencode. The rules go into every request, so the agent writes to them without being told, and the check runs on its own when the agent stops.

## Install

Needs Python 3.11 or newer.

```bash
opencode plugin add 'github:rchl2/harry'
```

If you forked it, swap `rchl2` for your account.

If npm refuses with `Fetching packages of type "git" have been disabled`, your npm config sets `allow-git`. Override it:

```bash
npm_config_allow_git=all opencode plugin add 'github:rchl2/harry'
```

If you cloned it locally instead, point the config at the directory:

```jsonc
{ "plugins": ["/Users/you/harry"] }
```

Check it loaded with `/harry-status`:

```
plugin: harry
harness: /Users/you/harry
found: yes
rules injected: yes
```

`found: no` means the plugin loaded but could not find `run.py`. Set `HARRY_HARNESS` to the directory holding it.

## What happens on its own

When the agent finishes a turn, Harry lints the working diff — but only if that turn actually changed it. A question answered with no edits stays quiet. If anything is wrong it posts the findings into the session, and the agent fixes them before handing over. Three nags per turn, then it stops.

Nothing blocks. If a finding is wrong, keep going and fix the rule later.

The automatic check needs a server that outlives the turn. It works in the TUI and in Desktop. Under `opencode run` the location shuts down first, so use `/harry` there.

## What it catches

```
$ /harry
  name_pronoun:5  `data` is a pronoun. Name what it holds.
    const data = await db.batch(ids)
```

- comments that restate the code
- commit subjects in past tense, or over fifty characters
- `const data`, `const temp`, `const result`, `const res`
- `const fetchTimeout` with no unit
- `throw new Error('bad_payload')` with no next action
- commented-out code
- bare TODOs, and catches that swallow silently
- flat narration, and a PR body a reviewer cannot restate

## Commands

`/harry` lints the working diff now. `/harry-status` shows what the plugin found. `/harry-reload` re-reads the rules after you edit them.

`/commit` lints the staged diff, offers three subjects, and commits the one you pick.

Commit by hand with `git commit` and the message goes unchecked. Use `/commit` when you want it checked:

```
$ /commit
  name_pronoun:5  `data` is a pronoun. Name what it holds.

Pick one with /commit <n>:
1. Add aircraft source
2. Introduce aircraft source
3. Wire the aircraft source

$ /commit 1
Committed: Add aircraft source

3735 tokens, $0.0000
```

The token line is the draft's own usage, so you can see what a picker costs.

## Rules

`rules/writing_styles.md`. Edit them.

## Turning it down

Rule injection costs about 900 tokens on every request. The automatic check is the noisiest part. Both are switchable:

```jsonc
{
  "plugins": [
    {
      "package": "github:rchl2/harry",
      "options": { "injectRules": false, "autoCheck": false }
    }
  ]
}
```

## Changing a rule

See [EVALS.md](EVALS.md).

## Limits

- It grades prose, not code. A clean run says nothing about whether the change works.
- The judged rules can flake.

## Credit

The harness shape comes from Tony Cueva's [Build Your Eval Harness](https://x.com/tonycueva/status/2115089591824744957).
