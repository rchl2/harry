"""Word and pattern tables shared by the graders.

Tune what counts as detritus, vague, stiff, or unitless here. The grader logic stays in deterministic.py.
"""

import re

from graders import fix

# history that belongs in the commit, not the comment
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

BODY_OPENER = re.compile(r"^(this (?:commit|pr|change)|the changes|changes:|updated|changed|modified)\b", re.I)

GENERIC_ERROR = re.compile(r"^(failed to|unable to|something went wrong|could not|error)\b", re.I)
STABLE_CODE = re.compile(
    r"^(?:[a-z][a-z0-9]*(?:_[a-z0-9]+)+"
    r"|[a-z][a-z0-9]*(?:\.[a-z0-9_]+)+"
    r"|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)$"
)

# what a goal or a reason looks like
GOAL = re.compile(r"\b(so|because|to \w+|enables|lets|makes|avoids|prevents)\b", re.I)
WHY = re.compile(
    r"\b(because|so|why|must|never|avoid|trap|constraint|otherwise|unless|"
    r"only|before|after|until|cap|capped)\b",
    re.I,
)
PASSIVE = re.compile(r"\b(is|are|was|were|be|been|being)\s+\w+(ed|en)\b", re.I)

STOP = {
    "the", "and", "for", "from", "with", "this", "that", "into", "over",
    "when", "then", "than", "are", "was", "were", "has", "have", "had",
    "not", "but", "all", "any", "can", "will", "use", "used", "its",
}

# names
VAGUE_NAMES = {
    "data", "temp", "tmp", "result", "res", "handle", "manager", "util",
}
BOOL_NAMES = {"flag", "is", "has", "can", "should", "did"}
HANDLE_CALLBACK = re.compile(
    r"\b(?:const|let|var)\s+handle\s*=\s*(?:async\s+)?(?:"
    r"(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>"
    r"|function\b"
    r"|use[A-Z]\w*\s*\("
    r")"
)
NEW_TYPE = re.compile(r"=\s*new\s+([A-Za-z_$][\w$]*)")

# units
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

# source shapes
COMMENT = re.compile(r"^\s*(#|//|/\*|\*)\s?(.*)$")
CODE_DECL = re.compile(r"\b(const|let|var)\s+([A-Za-z_$][\w$]*)")
PHP_DECL = re.compile(r"\$([A-Za-z_]\w*)\s*=(?!=)")
THROW = re.compile(r"throw new \\?[A-Za-z_][\w\\]*\(\s*[`'\"](.+?)[`'\"]")

TODO = re.compile(r"\bTODO\b")
TODO_OK = re.compile(r"\bTODO\([^)]+\)|\bTODO:\s*\S")
EMPTY_CATCH = re.compile(r"\bcatch\s*(\([^)]*\))?\s*\{")
CATCH = re.compile(r"\bcatch\s*(?:\([^)]*\))?\s*\{")
LOG_CALL = re.compile(r"^(?:console\.\w+|logger\.\w+|log|print)\s*\(")
TEST_NAME = re.compile(r"\b(?:it|test|specify)\s*\(\s*[`'\"]([^`'\"]+)[`'\"]")
WEAK_TEST = re.compile(r"^(?:works?|it works|tests?|ok|does stuff)$", re.I)

# prose surfaces
DOC_SUFFIXES = (".md", ".mdx")
FENCE = re.compile(r"^\s*(```|~~~)")
INLINE_CODE = re.compile(r"`[^`\n]+`")
LINE_MARKER = re.compile(r"^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ x]\]\s+)?|\d+\.\s+)")
GENERIC_DOC = re.compile(
    r"^(?:gets|returns|sets|creates|builds|makes|finds|reads|writes|updates|deletes)"
    r"\s+(?:the\s+)?(?:value|data|result|item|thing|object|response)\.?$",
    re.I,
)

# commit subjects
PAST_TENSE = re.compile(rf"^({'|'.join(w.capitalize() for w in fix.PAST)})\b")
