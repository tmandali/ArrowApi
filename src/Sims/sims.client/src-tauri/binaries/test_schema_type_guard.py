# -*- coding: utf-8 -*-
"""schema_type_guard birim testleri: python3 -m unittest test_schema_type_guard -v"""

import unittest

from schema_type_guard import self_correct_grid_filter, value_matches_physical_type


class ValueMatchesPhysicalTypeTests(unittest.TestCase):
    def test_date_valid(self):
        for v in (
            "2025-01-31",
            "2025-1-5",
            "31.01.2025",
            "31.01",
            "2025-01-01..2025-01-31",
            "today",
            "bugün",
        ):
            self.assertTrue(value_matches_physical_type(v, "date"), v)

    def test_date_invalid(self):
        for v in ("kaç var", "kaç kayıt var", "how many records", "", "aktif olanlar"):
            self.assertFalse(value_matches_physical_type(v, "date"), v)

    def test_number_valid(self):
        for v in ("100", "-42", "100..500", ">1000", "<>0", "10|20|30"):
            self.assertTrue(value_matches_physical_type(v, "number"), v)

    def test_number_invalid(self):
        for v in ("kaç var", "stokta olanlar", "", "SKU-102"):
            self.assertFalse(value_matches_physical_type(v, "number"), v)

    def test_text_always_true(self):
        self.assertTrue(value_matches_physical_type("kaç kayıt var", "text"))
        self.assertTrue(value_matches_physical_type("her şey", ""))


class SelfCorrectGridFilterTests(unittest.TestCase):
    COLS = {"Posting Date": "date", "Quantity": "number", "Item": "text"}

    def test_needle_hallucination_rerouted_to_kpi(self):
        # Gerçek hata senaryosu: DATE kolona soru metni
        tool, args = self_correct_grid_filter(
            "filter_active_grid",
            {"column": "Posting Date", "query": "kaç var"},
            self.COLS,
        )
        self.assertEqual(tool, "analyze_grid_data")
        self.assertEqual(args, {"chartType": "kpi"})

    def test_valid_date_filter_passes(self):
        tool, args = self_correct_grid_filter(
            "filter_active_grid",
            {"column": "Posting Date", "query": "2025-01-01..2025-01-31"},
            self.COLS,
        )
        self.assertEqual(tool, "filter_active_grid")
        self.assertEqual(args["query"], "2025-01-01..2025-01-31")

    def test_valid_number_filter_passes(self):
        tool, args = self_correct_grid_filter(
            "filter_active_grid",
            {"column": "Quantity", "query": "<>0"},
            self.COLS,
        )
        self.assertEqual(tool, "filter_active_grid")

    def test_column_lookup_case_insensitive(self):
        tool, _ = self_correct_grid_filter(
            "filter_active_grid",
            {"column": "posting date", "query": "kaç kayıt"},
            self.COLS,
        )
        self.assertEqual(tool, "analyze_grid_data")

    def test_unknown_column_passthrough(self):
        tool, args = self_correct_grid_filter(
            "filter_active_grid",
            {"column": "Bilinmeyen", "query": "xyz"},
            self.COLS,
        )
        self.assertEqual(tool, "filter_active_grid")

    def test_non_filter_tools_untouched(self):
        tool, args = self_correct_grid_filter(
            "clear_grid_filters", {}, self.COLS
        )
        self.assertEqual(tool, "clear_grid_filters")
        self.assertEqual(args, {})

    def test_empty_schema_passthrough(self):
        tool, args = self_correct_grid_filter(
            "filter_active_grid",
            {"column": "Posting Date", "query": "kaç var"},
            {},
        )
        self.assertEqual(tool, "filter_active_grid")


if __name__ == "__main__":
    unittest.main()
