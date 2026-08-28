#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""json_arg_repair onarım zincirinin birim testleri."""

import unittest

from json_arg_repair import repair_tool_arguments


class RepairToolArgumentsTests(unittest.TestCase):
    def test_clean_json_passes_through(self):
        self.assertEqual(repair_tool_arguments('{"report": "stock_balance"}'),
                         {"report": "stock_balance"})

    def test_markdown_fence_stripped(self):
        raw = '```json\n{"report": "x", "criteria": {"durum": "AKTIF"}}\n```'
        self.assertEqual(repair_tool_arguments(raw),
                         {"report": "x", "criteria": {"durum": "AKTIF"}})

    def test_prose_wrapped_braces(self):
        raw = 'İşte argümanlar: {"tutarMiktar": 50000} — iyi günler.'
        self.assertEqual(repair_tool_arguments(raw), {"tutarMiktar": 50000})

    def test_trailing_comma_fixed(self):
        self.assertEqual(repair_tool_arguments('{"a": 1, "b": 2,}'), {"a": 1, "b": 2})

    def test_single_quotes_fixed(self):
        self.assertEqual(repair_tool_arguments("{'report': 'run_me'}"), {"report": "run_me"})

    def test_unclosed_brace_repaired(self):
        self.assertEqual(repair_tool_arguments('{"report": "stock_balance"'),
                         {"report": "stock_balance"})

    def test_truncated_stream_returns_none(self):
        self.assertIsNone(repair_tool_arguments('{"report": "stock_bala'))

    def test_garbage_returns_none(self):
        self.assertIsNone(repair_tool_arguments("tamamen anlamsız metin"))

    def test_non_dict_json_returns_none(self):
        self.assertIsNone(repair_tool_arguments("[1, 2, 3]"))
        self.assertIsNone(repair_tool_arguments('"sadece metin"'))

    def test_empty_and_none_return_none(self):
        self.assertIsNone(repair_tool_arguments(""))
        self.assertIsNone(repair_tool_arguments(None))
        self.assertIsNone(repair_tool_arguments("   "))


if __name__ == "__main__":
    unittest.main()
