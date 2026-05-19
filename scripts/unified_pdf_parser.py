"""Shim constants for legacy unified-pdf-parser scripts and TN 2026 tests."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FORM20_DIR = REPO_ROOT / "scripts/cache/tn-2026-form20"
OUTPUT_BASE = REPO_ROOT / "public/data/booths/TN"
PC_DATA_PATH = REPO_ROOT / "public/data/elections/pc/TN/2024.json"
SCHEMA_PATH = REPO_ROOT / "public/data/schema.json"


def validate_extraction(*_args, **_kwargs):  # noqa: ANN002
    return True
