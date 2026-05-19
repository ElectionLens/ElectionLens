#!/usr/bin/env python3
"""Tests for TN Form20 parser, unified strategies shim, and master pipeline helpers."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
_SCRIPTS = str(REPO / "scripts")
if _SCRIPTS not in sys.path:
    sys.path.insert(0, _SCRIPTS)

from form20_unified_strategies import (  # noqa: E402
    Form20UnifiedRow,
    unified_rows_to_form20_records,
)
from tn_2026_accuracy_report import strict_deltas_for_ac  # noqa: E402
from tn_2026_form20_2026 import (  # noqa: E402
    assemble_2026_json_doc,
    parse_form20_pdf,
    parse_postal_text_line,
    resolve_booth_metas_for_form20_key,
    row_cells_to_candidate_votes_out,
    split_form20_record_equal,
)
from tn_2026_form20_coverage import (  # noqa: E402
    count_legacy_booths_mapped,
    fill_zero_results_for_missing,
    form20_key_maps_to_legacy,
    phase_a_ok,
)
from tn_2026_reconcile_votes import force_strict_to_elections, reconcile_doc_to_elections  # noqa: E402


class TestUnifiedPdfParserShim(unittest.TestCase):
    def test_repo_paths_without_legacy_cv2(self) -> None:
        from unified_pdf_parser import FORM20_DIR, OUTPUT_BASE, PC_DATA_PATH, SCHEMA_PATH

        self.assertTrue(str(FORM20_DIR).endswith("scripts/cache/tn-2026-form20"))
        self.assertIn("public/data/booths/TN", str(OUTPUT_BASE))
        self.assertIn("public/data/elections/pc/TN/2024.json", str(PC_DATA_PATH))
        self.assertIn("public/data/schema.json", str(SCHEMA_PATH))


class TestForm20UnifiedStrategies(unittest.TestCase):
    def test_unified_rows_to_form20_records_padding(self) -> None:
        rows = {
            "1": Form20UnifiedRow("1", [10, 20], 30, 0, 0.9, "tables"),
        }
        out = unified_rows_to_form20_records(rows, 4)
        self.assertEqual(len(out["1"]["votes"]), 4)


class TestAssemble2026JsonDoc(unittest.TestCase):
    def test_maps_booth_no_to_id(self) -> None:
        booths_doc = {
            "totalBooths": 1,
            "booths": [{"id": "TN-TEST-1", "boothNo": "1", "name": "PS", "address": "", "area": ""}],
        }
        by_booth = {"1": {"votes": [5, 1], "total": 7, "rejected": 1}}
        doc = assemble_2026_json_doc(
            "TN-TEST",
            {"name": "Test AC"},
            {"constituencyName": "TEST", "electors": 100, "candidates": [{"name": "A"}, {"name": "NOTA"}]},
            [{"name": "A"}, {"name": "NOTA"}],
            by_booth,
            "01-01-2026",
            None,
            "file:///x.pdf",
            booths_doc,
        )
        self.assertIn("TN-TEST-1", doc["results"])
        self.assertEqual(doc["results"]["TN-TEST-1"]["votes"], [5, 1])

    def test_digit_key_maps_via_num_to_split_m_w_booths(self) -> None:
        booths_doc = {
            "totalBooths": 2,
            "booths": [
                {"id": "TN-T-7A", "boothNo": "7A(W)", "num": 7, "name": "", "address": "", "area": ""},
                {"id": "TN-T-7M", "boothNo": "7M", "num": 7, "name": "", "address": "", "area": ""},
            ],
        }
        by_booth = {"7": {"votes": [5, 1], "total": 6, "rejected": 0}}
        doc = assemble_2026_json_doc(
            "TN-TEST",
            {"name": "Test AC"},
            {"constituencyName": "TEST", "electors": 100, "candidates": [{"name": "A"}, {"name": "NOTA"}]},
            [{"name": "A"}, {"name": "NOTA"}],
            by_booth,
            "01-01-2026",
            None,
            "file:///x.pdf",
            booths_doc,
        )
        self.assertEqual(doc["results"]["TN-T-7A"]["votes"], [3, 1])
        self.assertEqual(doc["results"]["TN-T-7M"]["votes"], [2, 0])

    def test_resolve_prefers_exact_booth_no_over_num(self) -> None:
        booths = [
            {"id": "a", "boothNo": "10", "num": 10},
            {"id": "b", "boothNo": "10M", "num": 10},
        ]
        self.assertEqual(len(resolve_booth_metas_for_form20_key("10", booths)), 1)
        self.assertEqual(resolve_booth_metas_for_form20_key("10", booths)[0]["id"], "a")

    def test_resolve_19a_maps_to_base_booth(self) -> None:
        booths = [{"id": "TN-009-19", "boothNo": "19", "num": 19}]
        metas = resolve_booth_metas_for_form20_key("19A", booths)
        self.assertEqual(len(metas), 1)
        self.assertEqual(metas[0]["id"], "TN-009-19")

    def test_resolve_synthetic_for_high_ps_number(self) -> None:
        booths = [{"id": "TN-001-330", "boothNo": "330", "num": 330}]
        metas = resolve_booth_metas_for_form20_key("331", booths, ac_id="TN-001")
        self.assertEqual(len(metas), 1)
        self.assertEqual(metas[0]["id"], "TN-001-331")
        self.assertTrue(metas[0].get("_form20Synthetic"))

    def test_assemble_no_skipped_high_ps(self) -> None:
        booths_doc = {
            "acId": "TN-001",
            "booths": [{"id": "TN-001-330", "boothNo": "330", "num": 330, "name": "", "address": "", "area": ""}],
        }
        by_booth = {
            "330": {"votes": [1, 0], "total": 1, "rejected": 0},
            "331": {"votes": [2, 0], "total": 2, "rejected": 0},
        }
        doc = assemble_2026_json_doc(
            "TN-001",
            {"name": "X"},
            {"constituencyName": "X", "electors": 100, "candidates": [{"name": "A"}, {"name": "NOTA"}]},
            [{"name": "A"}, {"name": "NOTA"}],
            by_booth,
            "01-01-2026",
            None,
            "file:///x.pdf",
            booths_doc,
        )
        self.assertIn("TN-001-331", doc["results"])

    def test_split_form20_record_equal_preserves_totals(self) -> None:
        rec = {"votes": [11, 5], "total": 18, "rejected": 2}
        parts = split_form20_record_equal(rec, 3)
        self.assertEqual(len(parts), 3)
        self.assertEqual(sum(p["votes"][0] for p in parts), 11)
        self.assertEqual(sum(p["votes"][1] for p in parts), 5)
        self.assertEqual(sum(p["rejected"] for p in parts), 2)
        self.assertEqual(sum(p["total"] for p in parts), 18)


class TestStrictOracle(unittest.TestCase):
    def test_strict_deltas_pass_two_booths_with_postal(self) -> None:
        booths_doc: dict = {"booths": [{"id": "1"}, {"id": "2"}], "totalBooths": 2}
        res_doc: dict = {
            "candidates": [{"name": "A"}, {"name": "NOTA"}],
            "results": {
                "1": {"votes": [40, 1], "total": 42, "rejected": 1},
                "2": {"votes": [50, 2], "total": 53, "rejected": 1},
            },
            "postal": {"candidates": [{"postal": 5}, {"postal": 0}]},
        }
        econ: dict = {"candidates": [{"name": "A", "votes": 95}, {"name": "NOTA", "votes": 3}]}
        ok, max_d, mism, miss_b = strict_deltas_for_ac(booths_doc, res_doc, econ)
        self.assertTrue(ok, msg=f"{mism} {miss_b} max={max_d}")
        self.assertEqual(max_d, 0)

    def test_strict_deltas_fail_extra_result_key(self) -> None:
        booths_doc: dict = {"booths": [{"id": "1"}], "totalBooths": 1}
        res_doc: dict = {
            "candidates": [{"name": "A"}, {"name": "NOTA"}],
            "results": {
                "1": {"votes": [10, 0], "total": 10, "rejected": 0},
                "99": {"votes": [1, 0], "total": 1, "rejected": 0},
            },
            "postal": {"candidates": [{"postal": 0}, {"postal": 0}]},
        }
        econ: dict = {"candidates": [{"name": "A", "votes": 10}, {"name": "NOTA", "votes": 0}]}
        ok, _max_d, mism, miss_b = strict_deltas_for_ac(booths_doc, res_doc, econ)
        self.assertFalse(ok)
        self.assertEqual(miss_b, [])

    def test_force_strict_drops_extra_and_matches(self) -> None:
        booths_doc: dict = {"booths": [{"id": "1"}], "totalBooths": 1}
        res_doc: dict = {
            "candidates": [{"name": "A"}, {"name": "NOTA"}],
            "results": {
                "1": {"votes": [10, 0], "total": 10, "rejected": 0},
                "99": {"votes": [100, 0], "total": 100, "rejected": 0},
            },
        }
        econ: dict = {"candidates": [{"name": "A", "votes": 10}, {"name": "NOTA", "votes": 0}]}
        applied, max_d = force_strict_to_elections(res_doc, econ, booths_doc)
        self.assertTrue(applied)
        self.assertEqual(max_d, 0)
        ok, max_after, _, _ = strict_deltas_for_ac(booths_doc, res_doc, econ)
        self.assertTrue(ok)
        self.assertEqual(max_after, 0)
        self.assertNotIn("99", res_doc["results"])


class TestForm20Coverage(unittest.TestCase):
    def test_count_mapped_uses_num_for_split_booth(self) -> None:
        booths_doc = {
            "booths": [
                {"id": "TN-T-7A", "boothNo": "7A(W)", "num": 7},
                {"id": "TN-T-7M", "boothNo": "7M", "num": 7},
                {"id": "TN-T-8", "boothNo": "8", "num": 8},
            ]
        }
        by_booth = {
            "7": {"votes": [1], "total": 1, "rejected": 0},
            "8": {"votes": [2], "total": 2, "rejected": 0},
        }
        self.assertEqual(count_legacy_booths_mapped(by_booth, booths_doc), 3)
        self.assertTrue(form20_key_maps_to_legacy("7", booths_doc))
        self.assertFalse(form20_key_maps_to_legacy("999", booths_doc))

    def test_fill_zero_results_phase_a(self) -> None:
        booths_doc = {"booths": [{"id": "a"}, {"id": "b"}]}
        doc = {"candidates": [{"name": "A"}], "results": {"a": {"votes": [1], "total": 1, "rejected": 0}}}
        n = fill_zero_results_for_missing(doc, booths_doc)
        self.assertEqual(n, 1)
        ok, missing, extra = phase_a_ok(booths_doc, doc)
        self.assertTrue(ok)
        self.assertEqual(missing, [])
        self.assertEqual(extra, [])


class TestReconcileVotes(unittest.TestCase):
    def test_reconcile_fixes_small_delta(self) -> None:
        booths_doc: dict = {"booths": [{"id": "1"}, {"id": "2"}]}
        doc: dict = {
            "candidates": [{"name": "A"}, {"name": "NOTA"}],
            "results": {
                "1": {"votes": [40, 1], "total": 41, "rejected": 0},
                "2": {"votes": [54, 2], "total": 56, "rejected": 0},
            },
            "postal": {"candidates": [{"postal": 5}, {"postal": 0}]},
        }
        econ: dict = {"candidates": [{"name": "A", "votes": 100}, {"name": "NOTA", "votes": 3}]}
        applied, max_d, _rem = reconcile_doc_to_elections(doc, econ, max_total_abs_delta=100)
        self.assertTrue(applied)
        self.assertEqual(max_d, 0)


class TestOcrStrategies(unittest.TestCase):
    def test_ocr_returns_empty_without_tesseract(self) -> None:
        from unittest.mock import patch

        from form20_ocr_strategies import extract_form20_ocr

        with patch("form20_ocr_strategies._ocr_available", return_value=False):
            out = extract_form20_ocr(Path("/nonexistent.pdf"), 3, use_surya=False)
        self.assertEqual(out, {})


class TestPostalExtraction(unittest.TestCase):
    def test_postal_table_row_with_votes_column(self) -> None:
        row = [
            "Total\nPostal\nBallot",
            "Votes",
            "824",
            "9",
            "698",
            "81",
            "3",
            "479",
            "0",
            "1",
            "4",
            "2",
            "7",
            "3",
            "0",
            "2",
            "2113",
            "348",
            "24",
            "2485",
            "0",
        ]
        n_person = 15
        rej = 17
        cmap = {i: i + 1 for i in range(14)}
        cmap[14] = 15
        nota_i = 14
        cands = [{"name": f"C{i}"} for i in range(14)] + [{"name": "NOTA"}]
        out = row_cells_to_candidate_votes_out(row, n_person, rej, cmap, nota_i, cands)
        self.assertIsNotNone(out)
        self.assertEqual(len(out), 15)
        self.assertEqual(out[nota_i], 24)

    def test_postal_text_line(self) -> None:
        ln = "Postal Votes 824 9 698 81 3 479 0 1 4 2 7 3 0 2 2113 348 24 2485 0"
        n_person = 15
        cmap = {i: i + 1 for i in range(14)}
        cmap[14] = 15
        nota_i = 14
        cands = [{"name": f"C{i}"} for i in range(14)] + [{"name": "NOTA"}]
        out = parse_postal_text_line(ln, n_person, cmap, nota_i, cands)
        self.assertIsNotNone(out)
        self.assertEqual(out[0], 824)


class TestEasyOcrBoothLineParser(unittest.TestCase):
    def test_duplicate_booth_prefix(self) -> None:
        from form20_ocr_strategies import _parse_easyocr_booth_line

        line = "273 273 728 1 285 120 90 80 70 60 50 40 30 20 10 5 4"
        row = _parse_easyocr_booth_line(line, 16, 600)
        self.assertIsNotNone(row)
        self.assertEqual(row.booth_key, "273")
        self.assertEqual(sum(row.votes), row.total)

    def test_rejects_sequential_header(self) -> None:
        from form20_ocr_strategies import _parse_easyocr_booth_line

        self.assertIsNone(_parse_easyocr_booth_line("5 6 7 8 9 10 11 12", 16, 600))

    def test_permissive_with_allowed_booths(self) -> None:
        from form20_ocr_strategies import _parse_easyocr_booth_line

        line = "42 42 10 20 30 40 50 60 70 80 90 100 110 120 130 140"
        row = _parse_easyocr_booth_line(
            line, 16, 600, strictness="permissive", allowed_booths=frozenset({42})
        )
        self.assertIsNotNone(row)
        self.assertEqual(row.booth_key, "42")
        self.assertIsNone(
            _parse_easyocr_booth_line(
                line, 16, 600, strictness="permissive", allowed_booths=frozenset({99})
            )
        )


class TestBoothEnsembleHelpers(unittest.TestCase):
    def test_expected_booth_ints(self) -> None:
        from form20_booth_ensemble import expected_booth_ints

        doc = {"booths": [{"boothNo": "1"}, {"boothNo": "19A"}, {"boothNo": "225"}]}
        self.assertEqual(expected_booth_ints(doc), frozenset({1, 19, 225}))


class TestTn2026Form20Parser(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        path = REPO / "public/data/elections/ac/TN/2026.json"
        cls.elections = json.loads(path.read_text(encoding="utf-8"))

    def test_ac001_parse_runs_if_pdf_cached(self) -> None:
        econ = self.elections["TN-001"]
        ac_no = int(econ["constituencyNo"])
        pdf = REPO / "scripts/cache/tn-2026-form20" / f"AC{ac_no:03d}_f20.pdf"
        if not pdf.is_file():
            self.skipTest(f"missing cached Form20 PDF {pdf}")
        cands = econ.get("candidates") or []
        _names, by_booth, _nota_i, _date, _postal = parse_form20_pdf(
            pdf,
            cands,
            allow_extra_pdf_columns=True,
        )
        self.assertGreater(len(by_booth), 0, msg="TN-001")


if __name__ == "__main__":
    unittest.main()
