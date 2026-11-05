"""Estado persistente del mod: un JSON junto a la configuración de ZapZap.

Queda en ``~/.config/ZapZap-P5R/state.json``. Nunca se escribe en la
configuración de ZapZap, así que el original no se entera.
"""

import json
import logging
import os
import tempfile

from PyQt6.QtCore import QStandardPaths

logger = logging.getLogger("zapzap-p5r")

STATE_VERSION = 1
CARD_FIELDS = {
    "id": 64,
    "chatKey": 256,
    "chatTitle": 256,
    "title": 140,
    "message": 1000,
    "target": 10,
    "lastNotified": 10,
    "author": 80,
    "origin": 8,
}
MAX_CARDS_PER_ACCOUNT = 200
MAX_TOMBSTONES = 500


def state_dir():
    override = os.environ.get("ZAPZAP_P5R_STATE_DIR")
    if override:
        return override
    base = QStandardPaths.writableLocation(
        QStandardPaths.StandardLocation.GenericConfigLocation
    )
    return os.path.join(base, "ZapZap-P5R")


def sanitize_cards(cards):
    """Descarta lo que no sea una tarjeta válida; los datos vienen de la página."""
    if not isinstance(cards, list):
        return []
    clean = []
    for card in cards[:MAX_CARDS_PER_ACCOUNT]:
        if not isinstance(card, dict):
            continue
        item = {}
        for field, limit in CARD_FIELDS.items():
            value = card.get(field)
            if isinstance(value, str):
                item[field] = value[:limit]
        if not item.get("id") or not item.get("target"):
            continue
        item["isGroup"] = card.get("isGroup") if isinstance(card.get("isGroup"), bool) else None
        item["reminders"] = bool(card.get("reminders", True))
        item["shared"] = bool(card.get("shared", False))
        for field in ("createdAt", "updatedAt", "msgTime"):
            value = card.get(field)
            item[field] = int(value) if isinstance(value, (int, float)) else 0
        clean.append(item)
    return clean


def sanitize_tombstones(tombstones):
    """IDs de tarjetas canceladas → fecha (ms) hasta la que se recuerdan."""
    if not isinstance(tombstones, dict):
        return {}
    clean = {}
    for card_id, expiry in list(tombstones.items())[:MAX_TOMBSTONES]:
        if isinstance(card_id, str) and 0 < len(card_id) <= 64 and isinstance(expiry, (int, float)):
            clean[card_id] = int(expiry)
    return clean


class P5RState:
    def __init__(self, path=None):
        self.path = path or os.path.join(state_dir(), "state.json")
        self.theme_enabled = True
        self.accounts = {}
        self.load()

    def load(self):
        try:
            with open(self.path, encoding="utf-8") as handle:
                data = json.load(handle)
        except FileNotFoundError:
            return
        except (OSError, ValueError):
            logger.exception("Estado ilegible; se respalda y se empieza de cero")
            try:
                os.replace(self.path, self.path + ".corrupto")
            except OSError:
                pass
            return

        self.theme_enabled = bool(data.get("theme_enabled", True))
        accounts = data.get("accounts", {})
        if isinstance(accounts, dict):
            for account_id, entry in accounts.items():
                if isinstance(entry, dict):
                    self.accounts[str(account_id)] = {
                        "rev": int(entry.get("rev", 0) or 0),
                        "cards": sanitize_cards(entry.get("cards", [])),
                        "tombstones": sanitize_tombstones(entry.get("tombstones", {})),
                    }

    def save(self):
        data = {
            "version": STATE_VERSION,
            "theme_enabled": self.theme_enabled,
            "accounts": self.accounts,
        }
        folder = os.path.dirname(self.path)
        try:
            os.makedirs(folder, exist_ok=True)
            fd, tmp_path = tempfile.mkstemp(prefix=".state-", dir=folder)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=2)
            os.replace(tmp_path, self.path)
        except OSError:
            logger.exception("No se pudo guardar el estado del mod")

    def cards_for(self, account_id):
        entry = self.accounts.get(str(account_id), {})
        return {
            "rev": entry.get("rev", 0),
            "cards": entry.get("cards", []),
            "tombstones": entry.get("tombstones", {}),
        }

    def update_cards(self, account_id, rev, cards, tombstones=None):
        """Guarda las tarjetas si la página trae una revisión más nueva."""
        current = self.cards_for(account_id)
        if not isinstance(rev, (int, float)) or rev <= current["rev"]:
            return False
        self.accounts[str(account_id)] = {
            "rev": int(rev),
            "cards": sanitize_cards(cards),
            "tombstones": sanitize_tombstones(
                tombstones if tombstones is not None else current["tombstones"]
            ),
        }
        self.save()
        return True

    def set_theme(self, enabled):
        enabled = bool(enabled)
        if enabled == self.theme_enabled:
            return False
        self.theme_enabled = enabled
        self.save()
        return True
