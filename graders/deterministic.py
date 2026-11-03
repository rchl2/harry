"""Deterministic graders.

Each grader takes the artifact bundle and returns findings. A finding names the rule, the line, and what to do. An empty list means the artifact passes.
"""

import re

from graders.lexicon import (
    BOOL_NAMES,
    BODY_OPENER,
    CATCH,
    CODE_DECL,
    COMMENT,
    COUNT_SUFFIXES,
    COUNT_VALUE,
    DETRITUS,
    DOC_SUFFIXES,
    EMPTY_CATCH,
    FENCE,
    GENERIC_DOC,
    GENERIC_ERROR,
    GOAL,
    HANDLE_CALLBACK,
    INLINE_CODE,
    LINE_MARKER,
    LOG_CALL,
    NEW_TYPE,
    PASSIVE,
    PAST_TENSE,
    PHP_DECL,
    PLAINER,
    SIZE_UNITS,
    STABLE_CODE,
    STOP,
    TEST_NAME,
    THROW,
    TIME_UNITS,
    TODO,
    TODO_OK,
    VAGUE_NAMES,
    WEAK_TEST,
    WHY,
)

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

def _prose(text):
    """Drop fenced and inline code, and list or heading markers."""
    out = []
    fenced = False
    for line in text.splitlines():
        if FENCE.match(line):
            fenced = not fenced
            continue
        if not fenced:
            out.append(LINE_MARKER.sub("", line) if line.strip() else "")
    return INLINE_CODE.sub("", "\n".join(out))

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
            lower = name.lower()
            if lower not in VAGUE_NAMES:
                continue

            # a handler verb is enough when the value is the callback
            if lower == "handle" and HANDLE_CALLBACK.search(text):
                continue

            # the constructed type carries the noun: `new QueueManager()`
            created = NEW_TYPE.search(text)
            if lower in {"manager", "util"} and created and lower in created.group(1).lower():
                continue

            # `res.json()` and friends read fine when the call names the thing
            if re.search(rf"\b{name}\.(json|ok|status|data|text)\b", text):
                continue

            out.append(_finding("name_pronoun", path, number, f"`{name}` is a pronoun. Name what it holds.", text))
    return out

def bool_name(bundle):
    """A boolean needs its subject, not just the question."""
    out = []
    for path, number, text in _added_lines(bundle.get("diff", "")):
        if _is_doc(path):
            continue
        names = [m.group(2) for m in CODE_DECL.finditer(text)]
        names += [m.group(1) for m in PHP_DECL.finditer(text)]

        for name in names:
            lower = name.lower()
            if lower not in BOOL_NAMES:
                continue
            if lower == "flag":
                out.append(_finding("bool_name", path, number, "`flag` says nothing. Name the condition it holds.", text))
            else:
                out.append(_finding("bool_name", path, number, f"`{name}` has no noun. Name the subject.", text))
    return out

def _doc_line(text):
    body = re.sub(r"^\s*/?\*+", "", text)
    return re.sub(r"\*/\s*$", "", body).strip()

def docstring_generic(bundle):
    """A first line that names a generic noun tells the caller nothing."""
    out = []
    lines = list(_added_lines(bundle.get("diff", "")))

    for i, (path, number, text) in enumerate(lines):
        if _is_doc(path) or not re.match(r"^\s*/\*\*", text):
            continue

        first = _doc_line(text)
        j = i
        while not first and j + 1 < len(lines) and lines[j + 1][0] == path:
            j += 1
            first = _doc_line(lines[j][2])
            if not first and lines[j][2].strip() == "*/":
                break

        if first and GENERIC_DOC.match(first):
            out.append(_finding(
                "docstring_generic", path, number,
                f"`{first.rstrip('.')}` names nothing specific. Say what it returns and when it fails.",
                text,
            ))
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
    text = _prose(bundle.get("pr_body", ""))
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

def commit_body(bundle):
    """A body says why. Filler openers and a repeated subject say nothing."""
    out = []
    lines = bundle.get("commit", "").splitlines()

    if len(lines) < 2:
        return out

    subject = lines[0].strip()

    if lines[1].strip():
        out.append(_finding("commit_body", "", 0, "Blank line after the subject, then why.", subject))
        body = [line for line in lines[1:] if line.strip()]
    else:
        body = [line for line in lines[2:] if line.strip()]

    if not body:
        return out

    first = body[0].strip()
    opener = BODY_OPENER.match(first)

    if opener:
        out.append(_finding("commit_body", "", 0, f"`{opener.group(0)}` is filler. Say what is true now.", first))

    norm = lambda value: re.sub(r"\W+", " ", value.lower()).strip()

    if norm(first) == norm(subject):
        out.append(_finding("commit_body", "", 0, "The body repeats the subject. Say why.", first))
    return out

def intent_first(bundle):
    out = []
    for surface in ("pr_body", "narration"):
        text = _prose(bundle.get(surface, ""))

        if not text.strip():
            continue

        head = " ".join(_sentences(text)[:2])

        if not GOAL.search(head):
            out.append(_finding("intent_first", "", 0, f"{surface} opens without a goal or problem.", head))
    return out

def test_name(bundle):
    """A test name carries the behaviour and its condition."""
    out = []
    for path, number, text in _added_lines(bundle.get("diff", "")):
        if _is_doc(path):
            continue
        for m in TEST_NAME.finditer(text):
            name = m.group(1).strip()
            words = name.split()

            if WEAK_TEST.match(name):
                out.append(_finding("test_name", path, number, "`works` says nothing. Name the behaviour and the condition.", text))
            elif words and words[0].lower() == "should":
                out.append(_finding("test_name", path, number, "Drop `should`. Name the behaviour and the condition.", text))
            elif len(words) < 3:
                out.append(_finding("test_name", path, number, "Too short to say the behaviour. Add the condition.", text))
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

def _catch_body(lines, index, rest):
    """The lines inside this catch, up to its closing brace."""
    if "}" in rest:
        return [rest.split("}", 1)[0]]

    body = []
    depth = 1

    for _, _, text in lines[index + 1:]:
        depth += text.count("{") - text.count("}")
        if depth <= 0:
            body.append(text.split("}", 1)[0])
            return body
        body.append(text)

    return body

def swallow_log(bundle):
    """Logging is not handling. A catch that only logs still hides the failure."""
    out = []
    lines = list(_added_lines(bundle.get("diff", "")))

    for i, (path, number, text) in enumerate(lines):
        if _is_doc(path):
            continue

        m = CATCH.search(text)
        if not m:
            continue

        body = [line.strip() for line in _catch_body(lines, i, text[m.end():]) if line.strip()]

        if not body or any(line.startswith(("//", "/*", "*")) for line in body):
            continue

        if any(re.search(r"\b(throw|return)\b", line) for line in body):
            continue
            
        if all(LOG_CALL.match(line) for line in body):
            out.append(_finding("swallow_log", path, number, "Logging is not handling. Rethrow or say why.", text))
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
    "docstring_generic": docstring_generic,
    "name_pronoun": name_pronoun,
    "bool_name": bool_name,
    "error_message": error_message,
    "ste_procedure": ste_procedure,
    "commit_subject": commit_subject,
    "commit_body": commit_body,
    "intent_first": intent_first,
    "test_name": test_name,
    "todo_bare": todo_bare,
    "empty_catch": empty_catch,
    "swallow_log": swallow_log,
    "unit_in_name": unit_in_name,
}

def grade(bundle, rules=None):
    findings = []
    
    for rule, fn in DETERMINISTIC.items():
        if rules and rule not in rules:
            continue
        findings.extend(fn(bundle))
        
    return findings
