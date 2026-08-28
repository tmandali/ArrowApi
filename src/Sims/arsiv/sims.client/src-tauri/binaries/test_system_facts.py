#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""system_facts kalıcı bilgi deposunun birim testleri (YULA_DATA_DIR ile izole)."""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import system_facts


class SystemFactsTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._old_env = os.environ.get("YULA_DATA_DIR")
        os.environ["YULA_DATA_DIR"] = self._tmp.name

    def tearDown(self):
        if self._old_env is None:
            os.environ.pop("YULA_DATA_DIR", None)
        else:
            os.environ["YULA_DATA_DIR"] = self._old_env
        self._tmp.cleanup()

    def test_empty_store_reads_back_empty(self):
        self.assertEqual(system_facts.get_all(), {})

    def test_set_many_merges_and_persists(self):
        system_facts.set_many({"varsayilan_depo": "MAIN", "para_birimi": "TRY"})
        system_facts.set_many({"para_birimi": "USD"})
        facts = system_facts.get_all()
        self.assertEqual(facts["varsayilan_depo"], "MAIN")
        self.assertEqual(facts["para_birimi"], "USD")
        # Gerçekten diske yazıldı mı?
        with open(system_facts.store_path(), "r", encoding="utf-8") as f:
            disk = json.load(f)
        self.assertEqual(disk["facts"]["para_birimi"], "USD")

    def test_clear_specific_keys(self):
        system_facts.set_many({"a": "1", "b": "2"})
        removed = system_facts.clear(["a"])
        self.assertEqual(removed, 1)
        self.assertEqual(system_facts.get_all(), {"b": "2"})

    def test_clear_all(self):
        system_facts.set_many({"a": "1", "b": "2"})
        self.assertEqual(system_facts.clear(), 2)
        self.assertEqual(system_facts.get_all(), {})

    def test_sanitize_caps_and_drops_empties(self):
        facts = system_facts.sanitize_facts({
            "  ": "boş anahtar atılır",
            "bos_deger": "   ",
            "null_deger": "NULL",
            "uzuk": "x" * 1000,
        })
        self.assertNotIn("", facts)
        self.assertNotIn("bos_deger", facts)
        self.assertNotIn("null_deger", facts)
        self.assertEqual(facts["uzuk"], "x" * system_facts.MAX_VALUE_LEN)

    def test_prompt_directive_empty_when_no_facts(self):
        self.assertEqual(system_facts.prompt_directive({}), "")

    def test_prompt_directive_lists_sorted_facts(self):
        block = system_facts.prompt_directive({"depo": "MAIN", "birim": "TRY"})
        self.assertIn("KALICI SİSTEM BİLGİLERİ", block)
        lines = [ln for ln in block.splitlines() if ln.startswith("- ")]
        self.assertEqual(lines, ["- birim: TRY", "- depo: MAIN"])


if __name__ == "__main__":
    unittest.main()
