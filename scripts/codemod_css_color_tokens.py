#!/usr/bin/env python3
"""Replace repeated legacy hex literals in the split CSS chunks with semantic tokens.

Safety model: this codemod is only allowed to be a *rename*. After rewriting, every
`var(--token)` it introduced is expanded back to the literal it replaced; the result
must be byte-identical to the original file. Anything else means the edit changed
meaning, and the run aborts without writing.

Deliberately NOT tokenised:
  * party colours (owned by partyData.ts, the correct single source)
  * third-party brand colours (X/Facebook/LinkedIn), which are brand identity
  * alpha-suffixed literals such as #6366f115, whose alpha is load-bearing
  * one-off colours used a single time, which a token would only obfuscate
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

CSS_DIR = Path("src/styles/legacy")
TOKEN_HOME = CSS_DIR / "phase1-13.css"

# Role-based names, grouped by the surface they serve. Ordered longest-first at
# substitution time so no shorthand can shadow a longer literal.
TOKENS: dict[str, str] = {
    # Neutral text / border ramp
    "#111827": "--legacy-text-strong",
    "#334155": "--legacy-text",
    "#475569": "--legacy-text-muted",
    "#666666": "--legacy-text-soft",
    "#cbd5e1": "--legacy-border-strong",
    # Danger
    "#dc2626": "--legacy-danger-strong",
    "#fee2e2": "--legacy-danger-soft",
    # Success / assembly green
    "#047857": "--legacy-success-strong",
    "#16a34a": "--legacy-success-mid",
    "#166534": "--legacy-success-text",
    "#ecfdf5": "--legacy-success-wash",
    "#d1fae5": "--legacy-success-tint",
    "#dcfce7": "--legacy-success-tint-strong",
    "#bbf7d0": "--legacy-success-tint-deep",
    # Informational blue
    "#dbeafe": "--legacy-info-soft",
    "#bfdbfe": "--legacy-info-border",
    # Indigo accents
    "#6366f1": "--legacy-indigo-mid",
    "#4f46e5": "--legacy-indigo-strong",
    "#c7d2fe": "--legacy-indigo-soft",
    "#a5b4fc": "--legacy-indigo-border",
    # Parliament violet
    "#6d28d9": "--legacy-parliament-strong",
    "#5b21b6": "--legacy-parliament-deep",
    # Warning amber
    "#b45309": "--legacy-warning-strong",
}

# #666 and #666666 are the same colour; accept the shorthand spelling too.
SHORTHAND = {"#666": "#666666"}


def literal_pattern(hex_value: str) -> re.Pattern[str]:
    """Match a hex literal not followed by another hex digit.

    Without the lookahead, `#6366f1` would match inside `#6366f115` and silently
    destroy the alpha channel.
    """
    return re.compile(re.escape(hex_value) + r"(?![0-9a-fA-F])", re.IGNORECASE)


def is_token_definition(line: str) -> bool:
    return re.match(r"\s*--[a-z0-9-]+\s*:", line) is not None


def rewrite(text: str) -> tuple[str, int]:
    out: list[str] = []
    count = 0
    for line in text.split("\n"):
        # Never rewrite the right-hand side of a token definition. That is exactly
        # the mistake that produced the self-referential cycles in 76f78e02.
        if is_token_definition(line):
            out.append(line)
            continue
        for spelling, canonical in list(SHORTHAND.items()) + [(h, h) for h in TOKENS]:
            token = TOKENS[canonical]
            new_line, n = literal_pattern(spelling).subn(f"var({token})", line)
            line = new_line
            count += n
        out.append(line)
    return "\n".join(out), count


def expand_back(text: str) -> str:
    """Inverse mapping, used to prove the rewrite was meaning-preserving."""
    by_token = {token: hex_value for hex_value, token in TOKENS.items()}
    for token, hex_value in by_token.items():
        text = text.replace(f"var({token})", hex_value)
    return text


def canonicalise_shorthand(text: str) -> str:
    out = []
    for line in text.split("\n"):
        if not is_token_definition(line):
            for short, full in SHORTHAND.items():
                line = literal_pattern(short).sub(full, line)
        out.append(line)
    return "\n".join(out)


def main() -> int:
    write = "--write" in sys.argv
    total = 0
    pending: list[tuple[Path, str]] = []

    for path in sorted(CSS_DIR.glob("*.css")):
        original = path.read_text()
        rewritten, n = rewrite(original)
        if n == 0:
            continue

        # Round-trip proof: expanding the tokens back must reproduce the original
        # (modulo the #666 -> #666666 spelling normalisation, which is the same colour).
        if expand_back(rewritten) != canonicalise_shorthand(original):
            print(f"ABORT: {path.name} round-trip mismatch; refusing to write")
            return 1

        total += n
        pending.append((path, rewritten))
        print(f"{path.name}: {n} literals tokenised")

    print(f"\ntotal replacements: {total}")
    if not write:
        print("dry run; pass --write to apply")
        return 0

    for path, content in pending:
        path.write_text(content)
    print(f"wrote {len(pending)} files")
    print(f"remember: token definitions live in {TOKEN_HOME.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
