"""Pruebas del estado persistente (no necesitan pantalla)."""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from p5r_mod.state import MAX_CARDS_PER_ACCOUNT, P5RState, sanitize_cards  # noqa: E402


def card(**overrides):
    base = {
        "id": "a1",
        "chatKey": "123@g.us",
        "chatTitle": "Los Ladrones",
        "isGroup": True,
        "title": "Robo del corazón",
        "message": "Prepárense",
        "target": "2026-12-24",
        "reminders": True,
        "createdAt": 1,
        "updatedAt": 2,
    }
    base.update(overrides)
    return base


class SanitizeCardsTests(unittest.TestCase):
    def test_keeps_valid_card(self):
        self.assertEqual(sanitize_cards([card()])[0]["title"], "Robo del corazón")

    def test_drops_invalid_entries(self):
        cards = [card(), "texto", {"id": "sin-fecha"}, card(id="")]
        self.assertEqual([c["id"] for c in sanitize_cards(cards)], ["a1"])

    def test_truncates_long_fields_and_ignores_unknown(self):
        result = sanitize_cards([card(title="x" * 500, extra="<script>")])[0]
        self.assertEqual(len(result["title"]), 140)
        self.assertNotIn("extra", result)

    def test_limits_amount(self):
        cards = [card(id=str(i)) for i in range(MAX_CARDS_PER_ACCOUNT + 50)]
        self.assertEqual(len(sanitize_cards(cards)), MAX_CARDS_PER_ACCOUNT)

    def test_non_list_is_empty(self):
        self.assertEqual(sanitize_cards({"id": "x"}), [])


class StateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, "estado", "state.json")

    def tearDown(self):
        self.tmp.cleanup()

    def test_defaults(self):
        state = P5RState(self.path)
        self.assertTrue(state.theme_enabled)
        self.assertEqual(state.cards_for("1"), {"rev": 0, "cards": [], "tombstones": {}})

    def test_round_trip(self):
        state = P5RState(self.path)
        state.set_theme(False)
        self.assertTrue(state.update_cards("1", 10, [card()]))
        reloaded = P5RState(self.path)
        self.assertFalse(reloaded.theme_enabled)
        self.assertEqual(reloaded.cards_for("1")["rev"], 10)
        self.assertEqual(reloaded.cards_for("1")["cards"][0]["chatTitle"], "Los Ladrones")

    def test_older_revision_is_ignored(self):
        state = P5RState(self.path)
        state.update_cards("1", 10, [card()])
        self.assertFalse(state.update_cards("1", 5, []))
        self.assertFalse(state.update_cards("1", "11", []))
        self.assertEqual(len(state.cards_for("1")["cards"]), 1)

    def test_accounts_are_separate(self):
        state = P5RState(self.path)
        state.update_cards("1", 10, [card()])
        state.update_cards("2", 3, [card(id="b2", chatTitle="Otro")])
        self.assertEqual(state.cards_for("1")["cards"][0]["id"], "a1")
        self.assertEqual(state.cards_for("2")["cards"][0]["id"], "b2")

    def test_tombstones_round_trip_and_survive_updates_without_them(self):
        state = P5RState(self.path)
        state.update_cards("1", 10, [card()], {"zz99yy88xx": 2000000000000, 5: 1, "bad": "x"})
        self.assertEqual(state.cards_for("1")["tombstones"], {"zz99yy88xx": 2000000000000})
        state.update_cards("1", 11, [card()])
        self.assertEqual(P5RState(self.path).cards_for("1")["tombstones"], {"zz99yy88xx": 2000000000000})

    def test_shared_card_fields_are_kept(self):
        result = sanitize_cards([card(shared=True, origin="them", author="Ann", msgTime=123)])[0]
        self.assertEqual((result["shared"], result["origin"], result["author"], result["msgTime"]),
                         (True, "them", "Ann", 123))

    def test_corrupt_file_is_backed_up(self):
        os.makedirs(os.path.dirname(self.path))
        with open(self.path, "w", encoding="utf-8") as handle:
            handle.write("{no es json")
        with self.assertLogs("zapzap-p5r", level="ERROR"):
            state = P5RState(self.path)
        self.assertTrue(state.theme_enabled)
        self.assertTrue(os.path.exists(self.path + ".corrupto"))

    def test_saved_file_is_valid_json(self):
        state = P5RState(self.path)
        state.update_cards("1", 1, [card()])
        with open(self.path, encoding="utf-8") as handle:
            self.assertEqual(json.load(handle)["version"], 1)


if __name__ == "__main__":
    unittest.main()
