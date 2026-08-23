# -*- coding: utf-8 -*-
"""Bileşik nitelik grameri testleri: python3 -m unittest test_compound_qualifier -v"""

import unittest

from needle_engine import apply_compound_qualifier_args


CRITERIA_TOOL = {
    "name": "filter_stock_balance",
    "parameters": {
        "type": "object",
        "properties": {
            "date_start": {"title": "Başlangıç Tarihi"},
            "date_end": {"title": "Bitiş Tarihi"},
            "item_name": {"title": "Malzeme Adı", "description": "Item Name / açıklama"},
            "item_code": {"title": "Malzeme Kodu", "description": "Item Code / SKU"},
        },
    },
}

GRID_TOOL = {
    "name": "clear_grid_filters",
    "parameters": {"type": "object", "properties": {}},
}


class CompoundQualifierTests(unittest.TestCase):
    def test_itemname_routes_to_name_field(self):
        args = apply_compound_qualifier_args("itemname timur", CRITERIA_TOOL, {})
        self.assertEqual(args.get("item_name"), "timur")
        self.assertNotIn("item_code", args)

    def test_spaced_qualifier(self):
        args = apply_compound_qualifier_args("item adı ahmet", CRITERIA_TOOL, {})
        self.assertEqual(args.get("item_name"), "ahmet")

    def test_code_qualifier(self):
        args = apply_compound_qualifier_args("ürün kodu SKU-9", CRITERIA_TOOL, {})
        self.assertEqual(args.get("item_code"), "SKU-9")
        self.assertNotIn("item_name", args)

    def test_qualifier_first_recovery(self):
        args = apply_compound_qualifier_args("name timur", CRITERIA_TOOL, {})
        self.assertEqual(args.get("item_name"), "timur")

    def test_existing_args_not_overwritten(self):
        args = apply_compound_qualifier_args(
            "itemname timur", CRITERIA_TOOL, {"item_name": "veli"}
        )
        self.assertEqual(args["item_name"], "veli")

    def test_unrelated_prompt_untouched(self):
        args = apply_compound_qualifier_args(
            "2025 ocak ayı raporu", CRITERIA_TOOL, {}
        )
        self.assertEqual(args, {})

    def test_no_matching_field_passthrough(self):
        tool = {"name": "x", "parameters": {"properties": {"date_start": {}}}}
        args = apply_compound_qualifier_args("itemname timur", tool, {})
        self.assertEqual(args, {})

    def test_grid_tool_shape_untouched_here(self):
        # Grid araçları bu fonksiyona hiç sokulmaz (çağrı tarafında); ama doğrudan
        # çağrıda da props boşsa dokunmaz.
        self.assertEqual(apply_compound_qualifier_args("itemname timur", GRID_TOOL, {}), {})


if __name__ == "__main__":
    unittest.main()
