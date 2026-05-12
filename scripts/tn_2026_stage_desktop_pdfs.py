#!/usr/bin/env python3
"""
Copy TN LA 2026 Form 20 and English PS PDFs from local folders into scripts/cache
with names expected by tn_2026_form20_2026.py and tn_2026_pslist_booths.py.

  python3 scripts/tn_2026_stage_desktop_pdfs.py --dry-run
  python3 scripts/tn_2026_stage_desktop_pdfs.py

Default sources (override with --form20-dir / --ps-english-dir):
  ~/Desktop/TNLA2026
  ~/Desktop/TN_PS_2026_English
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from tn_2026_booth_common import REPO_ROOT, is_pdf_bytes  # noqa: E402

AC_PATTERNS = (
    re.compile(r"(?:^|[/\\])AC(\d{3})(?:\.pdf)?$", re.I),
    re.compile(r"(?:^|[/\\])(\d{3})\.pdf$", re.I),
    re.compile(r"Form20.*?(\d{3})", re.I),
    re.compile(r"PSLIST.*?(\d{3})", re.I),
)


def discover_pdfs(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    return sorted(p for p in root.rglob("*.pdf") if p.is_file())


def infer_ac_no(path: Path) -> int | None:
    name = path.name
    for pat in AC_PATTERNS:
        m = pat.search(name.replace("\\", "/"))
        if m:
            return int(m.group(1))
    # Some dumps use only folder name e.g. dt11/AC145.pdf already matched
    for pat in AC_PATTERNS:
        m = pat.search(str(path).replace("\\", "/"))
        if m:
            return int(m.group(1))
    return None


def copy_ac_pdfs(
    src_files: list[Path],
    dest_dir: Path,
    dest_name_fn,
    *,
    dry_run: bool,
    force: bool,
) -> tuple[int, list[str]]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    by_ac: dict[int, Path] = {}
    conflicts: list[str] = []
    for p in src_files:
        ac = infer_ac_no(p)
        if ac is None or ac < 1 or ac > 234:
            conflicts.append(f"skip (no AC): {p}")
            continue
        if ac in by_ac:
            conflicts.append(f"duplicate AC{ac:03d}: {by_ac[ac]} vs {p}")
            continue
        by_ac[ac] = p

    n = 0
    for ac, src in sorted(by_ac.items()):
        dest = dest_dir / dest_name_fn(ac)
        if dest.exists() and not force:
            continue
        if dry_run:
            print(f"would copy {src} -> {dest}")
        else:
            shutil.copy2(src, dest)
            if not is_pdf_bytes(dest.read_bytes()[:8192]):
                print(f"WARN: not PDF magic after copy: {dest}", file=sys.stderr)
        n += 1
    return n, conflicts


def main() -> None:
    home = Path.home()
    ap = argparse.ArgumentParser(description="Stage Desktop TN 2026 PDFs into scripts/cache")
    ap.add_argument(
        "--form20-dir",
        type=Path,
        default=home / "Desktop" / "TNLA2026",
        help="Folder containing Form 20 PDFs (recursive)",
    )
    ap.add_argument(
        "--ps-english-dir",
        type=Path,
        default=home / "Desktop" / "TN_PS_2026_English",
        help="Folder containing English PS list PDFs (recursive)",
    )
    ap.add_argument(
        "--form20-cache",
        type=Path,
        default=REPO_ROOT / "scripts/cache/tn-2026-form20",
        help="Destination for ACnnn_f20.pdf",
    )
    ap.add_argument(
        "--ps-cache",
        type=Path,
        default=REPO_ROOT / "scripts/cache/tn-2026-pslist",
        help="Destination for ACnnn_en.pdf",
    )
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="Overwrite existing cached PDFs")
    args = ap.parse_args()

    f20_files = discover_pdfs(args.form20_dir)
    ps_files = discover_pdfs(args.ps_english_dir)

    print(f"Form20 source: {args.form20_dir} ({len(f20_files)} pdf files)")
    print(f"PS English source: {args.ps_english_dir} ({len(ps_files)} pdf files)")

    n1, c1 = copy_ac_pdfs(
        f20_files,
        args.form20_cache,
        lambda ac: f"AC{ac:03d}_f20.pdf",
        dry_run=args.dry_run,
        force=args.force,
    )
    n2, c2 = copy_ac_pdfs(
        ps_files,
        args.ps_cache,
        lambda ac: f"AC{ac:03d}_en.pdf",
        dry_run=args.dry_run,
        force=args.force,
    )

    for line in c1 + c2:
        print(line, file=sys.stderr)

    print(f"Staged Form20: {n1} files -> {args.form20_cache}")
    print(f"Staged PS EN:  {n2} files -> {args.ps_cache}")

    def count_range(cache: Path, prefix: str, suffix: str) -> int:
        return sum(1 for i in range(1, 235) if (cache / f"{prefix}{i:03d}{suffix}").exists())

    print(f"Coverage Form20 AC001–AC234 present: {count_range(args.form20_cache, 'AC', '_f20.pdf')}/234")
    print(f"Coverage PS EN AC001–AC234 present: {count_range(args.ps_cache, 'AC', '_en.pdf')}/234")

    # Minimal HTML so tn_2026_* scripts can use --fetch without blocking on CEO index when offline.
    for label, path in (
        ("Form20 index placeholder", args.form20_cache / "Form20_TNLA2026.html"),
        ("PSLIST index placeholder", args.ps_cache / "PSLIST_06042026.html"),
    ):
        if not path.exists() and not args.dry_run:
            path.write_text("<html></html>\n", encoding="utf-8")
            print(f"Wrote {label}: {path}")


if __name__ == "__main__":
    main()
