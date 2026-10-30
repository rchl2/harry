"""Judged graders. One call, four rules, advisory only.

Deterministic graders catch the mechanical rules. This catches the four that need reading: why-not-what, restate, segmentation, and what? recovery.

Judging goes through the opencode CLI by default, so it reuses the model and credentials already configured. Set `HARRY_JUDGE_URL` to call an OpenAI-compatible endpoint instead.
"""

import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import urllib.request

# Only used when HARRY_JUDGE_URL is set. The key is inline, or a file holding it.
ENDPOINT = os.environ.get("HARRY_JUDGE_URL")
MODEL = os.environ.get("HARRY_JUDGE_MODEL")
KEY = os.environ.get("HARRY_JUDGE_KEY")
KEY_FILE = os.environ.get("HARRY_JUDGE_KEY_FILE")

SYSTEM = (
    "You grade prose that ships with code. Return JSON only: "
    '{"findings": [{"rule": "...", "reason": "one sentence"}]}. '
    "Return only rules that fail. An empty list means all pass. "
    "Judge the artifact only, not the code itself. Be strict but do not invent faults."
)

# rule -> (bundle key holding the evidence, the question to ask)
RULES = {
    "explains_why": (
        "comments",
        "Do the comments explain why, or a constraint, or a trap? "
        "A comment that only restates the code fails.",
    ),
    "restate": (
        "pr_body",
        "Can a reviewer restate what the change does in one sentence from the "
        "body alone, without opening the diff? Pass only if yes.",
    ),
    "narration_segmented": (
        "narration",
        "Is the narration segmented, one idea per paragraph, and does it tell "
        "the reader where it is going? A single dense block fails.",
    ),
    "what_recovery": (
        "what_after",
        "The reader said `what?` to the earlier version. Does this rewrite "
        "stand on its own: name what the thing is for, describe the behaviour, "
        "and explain why it is that way, in short paragraphs? A bare list of "
        "steps with no explanation fails.",
    ),
}

def _key():
    if KEY:
        return KEY
    return pathlib.Path(KEY_FILE).expanduser().read_text().strip()


def available():
    """Judging needs either an endpoint with a key, or the opencode CLI."""
    if ENDPOINT:
        return bool(KEY) or bool(KEY_FILE and pathlib.Path(KEY_FILE).expanduser().exists())
    return shutil.which("opencode") is not None


def _comments(bundle):
    return [
        line[1:].strip()
        for line in bundle.get("diff", "").splitlines()
        if line.startswith("+") and line[1:].strip().startswith(("//", "#"))
    ]


def _parse(content):
    content = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(content).get("findings", [])


def _ask_http(question, evidence):
    body = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"{question}\n\n---\n{evidence}"},
        ],
        "temperature": 0,
    }).encode()

    req = urllib.request.Request(
        ENDPOINT,
        data=body,
        headers={"content-type": "application/json", "authorization": f"Bearer {_key()}"},
    )

    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.load(resp)

    return _parse(payload["choices"][0]["message"]["content"])


def _ask_cli(question, evidence):
    """Run the judge through opencode, so it uses the configured model and auth."""
    prompt = f"{SYSTEM}\n\n{question}\n\n---\n{evidence}"
    cmd = ["opencode", "run", "--standalone", "--format", "json", "--auto"]
    if MODEL:
        cmd += ["--model", MODEL]
    cmd.append(prompt)

    with tempfile.TemporaryDirectory() as workdir:
        proc = subprocess.run(cmd, cwd=workdir, capture_output=True, text=True, timeout=300)

    text = []
    for line in proc.stdout.splitlines():
        try:
            part = json.loads(line).get("part") or {}
        except json.JSONDecodeError:
            continue
        if part.get("type") == "text" and part.get("text"):
            text.append(part["text"])

    return _parse("\n".join(text))


def _ask(question, evidence):
    return _ask_http(question, evidence) if ENDPOINT else _ask_cli(question, evidence)

def grade(bundle, rules=None):
    """One call covering every semantic rule the bundle has evidence for."""
    wanted = {}

    for rule, (source, _) in RULES.items():
        if rules and rule not in rules:
            continue
        text = "\n".join(_comments(bundle)) if source == "comments" else bundle.get(source, "")
        if text:
            wanted[rule] = text

    if not wanted:
        return []

    if not available():
        return [
            {"rule": rule, "pass": True, "reason": "no judge: install opencode or set HARRY_JUDGE_URL"}
            for rule in wanted
        ]

    question = "\n".join(f"- {rule}: {RULES[rule][1]}" for rule in wanted)
    evidence = "\n\n".join(f"### {rule}\n{text}" for rule, text in wanted.items())

    try:
        found = _ask(question, evidence)
    except Exception as exc:  # a judge outage is a harness bug, not a finding
        return [{"rule": r, "pass": True, "reason": f"judge error: {exc}"} for r in wanted]

    failed = {f.get("rule"): f.get("reason", "") for f in found if f.get("rule") in wanted}
    return [
        {"rule": rule, "pass": rule not in failed, "reason": str(failed.get(rule, ""))[:300]}
        for rule in wanted
    ]
