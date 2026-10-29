---
name: harry
description: Rules and a checker for the prose you ship with code — comments, docstrings, commit messages, PR bodies, names, error messages, and narration. Load before you write any of these, and run the checker before you hand work over.
---

# harry

Read `rules/writing_styles.md` first. It is short and it is the whole rule set.

## Before you hand work over

```bash
git diff HEAD | python3 <skill-dir>/run.py --diff -
```

Fix what it reports. It is deterministic, so a finding is real unless the grader is wrong.

## When the reader says `what?`

Stop. Do not add detail to the same shape. Simplify, ground the context, and tell it as a story.

## Changing a rule

See `EVALS.md`.
