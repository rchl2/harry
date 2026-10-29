---
name: writing-styles
description: Rules for prose an agent ships with code - comments, docstrings, commit messages, PR bodies, names, error messages, and task narration. Use whenever the agent writes any of these.
---

# Writing styles

## Overview

Prose that ships with code is read by a human in a hurry, often months later, often while something is broken. Write for that reader that user can later understand.

These rules bind agent output. They do not bind the human. They must still read as something a person would plausibly write or think about, because a rule that produces a register no human uses gets ignored by every reviewer.

## Intent first

Open with the goal or the problem. Then the points that carry it, each with why it matters. 

For a PR body, the intent is what the change enables. 

For a comment, it is the constraint the code cannot express.

For narration, it is where you are going.

## Comments

Say why, not what. If the code already says it, delete the comment - it's not needed.

No decision detritus. Describe the state and the active intent. How you got here belongs in the commit.

```py
# changed from a loop because it was slow
```

```py
# batch lookup: one round trip instead of N
```

No commented-out code.

No restating the identifier. `// increment i` above `i++` is noise.

A comment earns its place by carrying what the code cannot: a constraint, a trap, a reason.

## TODO comments

A bare `TODO` says nothing. Say who owns it, or when it lifts.

```ts
// TODO clean this up
```

```ts
// TODO(marco): drop once the v1 endpoint is gone
```

## Docstrings

First line: what the caller gets, in the caller's terms.

Then the constraints and the failure modes. Skip the walkthrough of the body.

## Commit messages

Imperative subject. Fifty characters. No trailing period. No `we`.

The body is why, plus whatever a reader would otherwise get wrong.

No detritus. Not "changed X to Y because Z" — say what is true now.

## PR bodies

One sentence a reviewer can restate after reading. If they cannot, the body failed.

Then what changed, why, and how to check it.

No changelog of your own process. The reviewer does not need the order you tried things. He needs a result.

## Names

Reuse the noun instead of a pronoun-like name. `data`, `temp`, `result`, `handle`, `manager`, `util` are the code form of an unclear antecedent.

A name that needs a comment to disambiguate is the wrong name.

## Units

A quantity without a unit is a bug waiting for a reader. Name the unit.

```ts
const fetchTimeout = 8000;
```

```ts
const fetchTimeoutMs = 8000;
```

## Error messages

Say what happened and what to do next.

No stack trace as the message. No bare `Error:`.

## Empty catch

A catch that swallows silently hides the failure. Say why, or rethrow.

```ts
try { await send(); } catch (e) {}
```

```ts
try { await send(); } catch (e) {
  // offline is fine, the queue retries
}
```

## Narration

Segment. One idea per paragraph.

Tell the reader a story: where you are, what you found, what you did, what is left.

Never a wall without story.

## Procedures

For repro steps, runbooks, and setup, use Simplified Technical English (STE).

One instruction per sentence. Active voice, imperative. Under twenty words.

Banned: commence, utilize, ensure, prior to, in order to, terminate, sufficient.

## Safeword

`what?` means the reader could not parse what you wrote.

On `what?`, stop. Simplify. Ground the context. Tell it as a story, because the flat version was unhelpful.

## Social rules

1. Review a thing before you inflict it on another human being.
2. A reader handed a huge document may ask for a meeting to be taken through it. This backs up rule 1.
3. AI content can be rejected without effort, including tickets and PRs with unreadable descriptions. Hard decline. Try again.

## If something fails

Read the finding before you rewrite. A grader that fails a good artifact is a harness bug, not a finding.

Change one rule per run. If two rules move together, you cannot say which one helped.

## Try it on your own

Take the last PR you bounced. Find the sentence that made you bounce it. That sentence is a golden.
