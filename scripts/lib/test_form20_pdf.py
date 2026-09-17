import unittest
from pathlib import Path
from unittest.mock import patch

from form20_pdf import parse_form20_pdf_rows


class Form20PdfTests(unittest.TestCase):
    def test_accepts_five_field_tail_when_invariants_hold(self) -> None:
        text = "1 10 20 30 60 2 1 63 0\n2 3 4 7 14 0 0 14 0\n"
        with patch("form20_pdf.subprocess.run") as run:
            run.return_value.stdout = text
            rows = parse_form20_pdf_rows(Path("fixture.pdf"), 3)

        self.assertEqual(rows[1], ([10, 20, 30], 60, 2, 1, 63, 0))
        self.assertEqual(rows[2], ([3, 4, 7], 14, 0, 0, 14, 0))

    def test_accepts_four_field_tail_with_rejected_votes(self) -> None:
        # Candidate sum = valid; valid + rejected + NOTA = total.
        text = "1 4 5 9 18 2 1 21 0\n"
        with patch("form20_pdf.subprocess.run") as run:
            run.return_value.stdout = text
            rows = parse_form20_pdf_rows(Path("fixture.pdf"), 3)

        self.assertEqual(rows[1], ([4, 5, 9], 18, 2, 1, 21, 0))

    def test_rejects_arithmetic_garbage(self) -> None:
        text = "1 4 5 9 99 1 105 0\n"
        with patch("form20_pdf.subprocess.run") as run:
            run.return_value.stdout = text
            rows = parse_form20_pdf_rows(Path("fixture.pdf"), 3)

        self.assertEqual(rows, {})

    def test_does_not_overwrite_duplicate_booth_rows(self) -> None:
        text = "1 4 5 9 18 0 0 18 0\n1 8 8 8 24 0 0 24 0\n"
        with patch("form20_pdf.subprocess.run") as run:
            run.return_value.stdout = text
            rows = parse_form20_pdf_rows(Path("fixture.pdf"), 3)

        self.assertEqual(rows[1][0], [4, 5, 9])


if __name__ == "__main__":
    unittest.main()
