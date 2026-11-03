"""Deterministic graders.

Each grader takes the artifact bundle and returns findings. A finding names the rule, the line, and what to do. An empty list means the artifact passes.
"""

import re

from graders import fix

DETRITUS = re.compile(
    "|".join([
        r"\bwe (changed|moved|switched|replaced|renamed|removed|added)\b",
        r"\bchanged from\b",
        r"\bpreviously\b",
        r"\bused to\b",
        r"\bthis replaces\b",
        r"\bnow that\b",
        r"\bas discussed\b",
        r"\bafter the fix\b",
        r"\breverted\b",
        r"\bthe old\b",
    ]),
    re.I,
)

PLAINER = {
    "commence": "start",
    "utilize": "use",
    "ensure": "make sure",
    "prior to": "before",
    "in order to": "to",
    "terminate": "end",
    "sufficient": "enough",
    "in the event": "if",
    "subsequent": "later",
}

VAGUE_NAMES = {
    "data", "temp", "tmp", "result", "res", "handle", "manager", "util",
}

PAST_TENSE = re.compile(rf"^({'|'.join(w.capitalize() for w in fix.PAST)})\b")

PASSIVE = re.compile(r"\b(is|are|was|were|be|been|being)\s+\w+(ed|en)\b", re.I)
GOAL = re.compile(r"\b(so that|because|to \w+|enables|lets|makes|avoids|prevents)\b", re.I)
WHY = re.compile(
    r"\b(because|so|why|must|never|avoid|trap|constraint|otherwise|unless|"
    r"only|before|after|until|cap|capped)\b",
    re.I,
)

STOP = {
    "the", "and", "for", "from", "with", "this", "that", "into", "over",
    "when", "then", "than", "are", "was", "were", "has", "have", "had",
    "not", "but", "all", "any", "can", "will", "use", "used", "its",
}

COMMENT = re.compile(r"^\s*(#|//|/\*|\*)\s?(.*)$")
CODE_DECL = re.compile(r"\b(const|let|var)\s+([A-Za-z_$][\w$]*)")
PHP_DECL = re.compile(r"\$([A-Za-z_]\w*)\s*=(?!=)")
THROW = re.compile(r"throw new \\?[A-Za-z_][\w\\]*\(\s*[`'\"](.+?)[`'\"]")

TODO = re.compile(r"\bTODO\b")
TODO_OK = re.compile(r"\bTODO\([^)]+\)|\bTODO:\s*\S")
EMPTY_CATCH = re.compile(r"\bcatch\s*(\([^)]*\))?\s*\{")

# time always needs a unit; a qualified size says what is counted
TIME_UNITS = {
    "timeout", "delay", "interval", "duration", "ttl", "age", "period",
    "wait", "expiry", "lifetime",
}

SIZE_UNITS = {"size", "budget"}
COUNT_SUFFIXES = {
    "count", "num", "index", "attempts", "retries", "hops", "pages", "items",
}

COUNT_VALUE = re.compile(r"\.\s*(length|size|count)\b|\bObject\.keys\s*\(")

DOC_SUFFIXES = (".md", ".mdx")
HANDLE_CALLBACK = re.compile(
    r"\b(?:const|let|var)\s+handle\s*=\s*(?:async\s+)?(?:"
    r"(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>"
    r"|function\b"
    r"|use[A-Z]\w*\s*\("
    r")"
)
STABLE_CODE = re.compile(
    r"^(?:[a-z][a-z0-9]*(?:_[a-z0-9]+)+"
    r"|[a-z][a-z0-9]*(?:\.[a-z0-9_]+)+"
    r"|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)$"
)
GENERIC_ERROR = re.compile(r"^(failed to|unable to|something went wrong|could not|error)\b", re.I)

def _is_doc(path):
    return path.lower().endswith(DOC_SUFFIXES)

def _finding(rule, path, line, message, excerpt=""):
    return {
        "rule": rule,
        "file": path,
        "line": line,
        "message": message,
        "excerpt": excerpt.strip()[:160],
    }

def _sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]

def _added_lines(diff):
    """Yield (file, new-file line number, text) for added lines only."""
    path = ""
    number = 0
    for raw in diff.splitlines():
        if raw.startswith("+++ "):
            path = raw[4:].strip()
            if path.startswith("b/"):
                path = path[2:]
            continue
        if raw.startswith("--- "):
            continue
        if raw.startswith("@@"):
            found = re.search(r"\+(\d+)", raw)
            number = int(found.group(1)) if found else 0
            continue
        if raw.startswith("+"):
            yield path, number, raw[1:]
            number += 1
        elif not raw.startswith("-"):
            number += 1

def comment_detritus(bundle):
    out = []
    for path, number, text in _added_lines(bundle.get("diff", "")):
        if _is_doc(path):
            continue
        m = COMMENT.match(text)

        if not m:
            continue
        body = m.group(2)

        if DETRITUS.search(body):
            out.append(_finding("comment_detritus", path, number, "History, not state. Say what is true now.", body))
    return out

def comment_restates(bundle):
    out = []
    lines = list(_added_lines(bundle.get("diff", "")))
    for i, (path, number, text) in enumerate(lines[:-1]):
        if _is_doc(path):
            continue
        m = COMMENT.match(text)
        if not m:
            continue
        body = m.group(2).strip()

        if len(body.split()) < 2 or WHY.search(body):
            continue
        window = " ".join(t for _, _, t in lines[i + 1:i + 3]).lower()
        words = {w for w in re.findall(r"[a-z]{3,}", body.lower()) if w not in STOP}

        if len(words) < 2:
            continue

        if sum(1 for w in words if w in window) / len(words) >= 0.7:
            out.append(_finding("comment_restates", path, number, "The code already says this. Delete it or add why.", body))
    return out

def commented_out_code(bundle):
    out = []
    for path, number, text in _added_lines(bundle.get("diff", "")):
        if _is_doc(path):
            continue
        m = COMMENT.match(text)

        if not m:
            continue
        body = m.group(2).strip()

        if re.search(r"[;{}]\s*$", body) or re.match(r"^(const|let|var|return|if|for|await)\b", body):
            out.append(_finding("commented_out_code", path, number, "Dead code in a comment.", body))
    return out

def name_pronoun(bundle):
    out = []
    for path, number, text in _added_lines(bundle.get("diff", "")):
        if re.search(r"\bfor\s*\(", text):
            continue  # a loop binding is scoped to three lines; `item` is fine

        for m in CODE_DECL.finditer(text):
            name = m.group(2)
            if name.lower() not in VAGUE_NAMES:
                continue

            # a handler verb is enough when the value is the callback
            if name == "handle" and HANDLE_CALLBACK.search(text):
                continue

            # `res.json()` and friends read fine when the call names the thing
            if re.search(rf"\b{name}\.(json|ok|status|data|text)\b", text):
                continue

            out.append(_finding("name_pronoun", path, number, f"`{name}` is a pronoun. Name what it holds.", text))
    return out

def error_message(bundle):
    out = []
    for path, number, text in _added_lines(bundle.get("diff", "")):
        for m in THROW.finditer(text):
            msg = m.group(1)

            if STABLE_CODE.match(msg):
                continue

            if GENERIC_ERROR.match(msg):
                out.append(_finding("error_message", path, number, "Generic opening. Lead with a stable code.", msg))
            elif ": " not in msg:
                out.append(_finding("error_message", path, number, "No next action. Use `code: what happened, what to do`.", msg))
                continue
            else:
                tail = msg.split(": ", 1)[1]
                if len(tail.split()) < 3:
                    out.append(_finding("error_message", path, number, "The part after the code does not say what to do.", msg))
                    continue

            if msg.endswith("."):
                out.append(_finding("error_message", path, number, "No trailing period in an error message.", msg))
    return out

def ste_procedure(bundle):
    out = []
    text = bundle.get("pr_body", "")
    for n, para in enumerate(text.split("\n\n")):
        for s in _sentences(para):
            if len(s.split()) > 20:
                out.append(_finding("ste_procedure", "", n, "over twenty words. Split it.", s))

            if PASSIVE.search(s):
                out.append(_finding("ste_procedure", "", n, "passive voice hides who acts. Name the actor.", s))
            banned = [w for w in PLAINER if re.search(rf"\b{w}\b", s, re.I)]

            if banned:
                out.append(_finding(
                    "ste_procedure", "", n,
                    f"`{banned[0]}` is stiff. Use `{PLAINER[banned[0]]}`.",
                    s,
                ))
    return out

def commit_subject(bundle):
    out = []

    if "commit" not in bundle:
        return out
    subject = bundle.get("commit", "").splitlines()[0] if bundle.get("commit") else ""

    if not subject:
        return [_finding("commit_subject", "", 0, "No commit message captured.")]

    if len(subject) > 50:
        out.append(_finding("commit_subject", "", 0, f"{len(subject)} chars. Cut to fifty.", subject))

    if subject.endswith("."):
        out.append(_finding("commit_subject", "", 0, "No trailing period.", subject))

    if PAST_TENSE.search(subject):
        out.append(_finding("commit_subject", "", 0, "Past tense. Use the imperative.", subject))

    if re.search(r"\bwe\b", subject, re.I):
        out.append(_finding("commit_subject", "", 0, "Drop `we`.", subject))
    return out

def intent_first(bundle):
    out = []
    for surface in ("pr_body", "narration"):
        text = bundle.get(surface, "")

        if not text:
            continue

        head = " ".join(_sentences(text)[:2])

        if not GOAL.search(head):
            out.append(_finding("intent_first", "", 0, f"{surface} opens without a goal or problem.", head))
    return out

def todo_bare(bundle):
    """A TODO must say who owns it or when it lifts off."""
    out = []
    for path, number, text in _added_lines(bundle.get("diff", "")):
        if _is_doc(path):
            continue
        m = COMMENT.match(text)

        if not m:
            continue
        body = m.group(2).strip()

        if TODO.search(body) and not TODO_OK.search(body):
            out.append(_finding("todo_bare", path, number, "A bare TODO says nothing. Use `TODO(name)` or `TODO: when X`.", body))
    return out

def empty_catch(bundle):
    """A catch that swallows silently hides the failure."""
    out = []
    lines = list(_added_lines(bundle.get("diff", "")))

    for i, (path, number, text) in enumerate(lines):
        m = EMPTY_CATCH.search(text)

        if not m:
            continue
        rest = text[m.end():].strip()

        if rest.startswith("}"):
            out.append(_finding("empty_catch", path, number, "Swallows the error. Say why, or rethrow.", text))
            continue

        if rest == "" and i + 1 < len(lines) and lines[i + 1][2].strip() == "}":
            out.append(_finding("empty_catch", path, number, "Swallows the error. Say why, or rethrow.", text))
    return out

def unit_in_name(bundle):
    """A quantity without a unit is a bug waiting for a reader."""
    out = []
    for path, number, text in _added_lines(bundle.get("diff", "")):
        names = [m.group(2) for m in CODE_DECL.finditer(text)]
        names += [m.group(1) for m in PHP_DECL.finditer(text)]

        for name in names:
            parts = re.findall(r"[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+", name)

            if not parts:
                continue
            last = parts[-1].lower()

            if last in COUNT_SUFFIXES:
                continue
            if last in SIZE_UNITS and len(parts) > 1:
                continue
            if last in SIZE_UNITS and COUNT_VALUE.search(text):
                continue
            if last in TIME_UNITS or last in SIZE_UNITS:
                out.append(_finding("unit_in_name", path, number, f"`{name}` has no unit. Say ms, bytes, or days.", text))
    return out

DETERMINISTIC = {
    "comment_detritus": comment_detritus,
    "comment_restates": comment_restates,
    "commented_out_code": commented_out_code,
    "name_pronoun": name_pronoun,
    "error_message": error_message,
    "ste_procedure": ste_procedure,
    "commit_subject": commit_subject,
    "intent_first": intent_first,
    "todo_bare": todo_bare,
    "empty_catch": empty_catch,
    "unit_in_name": unit_in_name,
}

def grade(bundle, rules=None):
    findings = []
    
    for rule, fn in DETERMINISTIC.items():
        if rules and rule not in rules:
            continue
        findings.extend(fn(bundle))
        
    return findings
