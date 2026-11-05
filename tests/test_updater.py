"""Pruebas del actualizador (sin red: trabajan sobre carpetas temporales)."""

import importlib
import json
import os
import sys
import tempfile
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def load_updater(home):
    os.environ["ZAPZAP_P5R_HOME"] = home
    import p5r_mod.updater as updater

    updater = importlib.reload(updater)
    updater.QUIET = True
    updater.notify = lambda _message: None
    return updater


class UpdaterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = os.path.join(self.tmp.name, "zapzap-p5r")
        self.updater = load_updater(self.home)

    def tearDown(self):
        os.environ.pop("ZAPZAP_P5R_HOME", None)
        self.tmp.cleanup()

    def make_releases(self, *names, current=None, state=None):
        for name in names:
            os.makedirs(os.path.join(self.home, "releases", name))
        if current:
            self.updater.point_current_to(current)
        if state is not None:
            self.updater.save_state(state)

    def test_version_key_accepts_only_stable_tags(self):
        key = self.updater.version_key
        self.assertEqual(key("7.5.1"), (7, 5, 1))
        self.assertEqual(key("v4.5"), (4, 5, 0))
        self.assertIsNone(key("7.6-beta"))
        self.assertIsNone(key("nightly"))
        self.assertGreater(key("7.5.1"), key("v4.5.2"))

    def test_point_current_and_list(self):
        self.make_releases("7.4", "7.5.1", "7.5.0", current="7.5.1")
        self.assertEqual(self.updater.current_release(), "7.5.1")
        self.assertEqual(self.updater.installed_releases(), ["7.4", "7.5.0", "7.5.1"])

    def test_rollback_after_failed_update(self):
        self.make_releases("7.5.0", "7.5.1", current="7.5.1",
                           state={"previous": "7.5.0", "fresh": True})
        args = types.SimpleNamespace(only_if_fresh=True, reason="prueba")
        self.assertEqual(self.updater.cmd_rollback(args), 0)
        self.assertEqual(self.updater.current_release(), "7.5.0")
        state = self.updater.load_state()
        self.assertIn("7.5.1", state["skip"])
        self.assertFalse(state["fresh"])

    def test_no_rollback_when_version_was_already_good(self):
        self.make_releases("7.5.0", "7.5.1", current="7.5.1",
                           state={"previous": "7.5.0", "fresh": False})
        args = types.SimpleNamespace(only_if_fresh=True, reason="prueba")
        self.updater.cmd_rollback(args)
        self.assertEqual(self.updater.current_release(), "7.5.1")

    def test_mark_good_clears_fresh(self):
        self.make_releases("7.5.1", current="7.5.1", state={"fresh": True})
        self.updater.cmd_mark_good(None)
        self.assertFalse(self.updater.load_state()["fresh"])

    def test_prune_keeps_current_and_previous(self):
        self.make_releases("7.1", "7.2", "7.3", "7.4", "7.5", current="7.2")
        # Las candidatas a borrar (7.1 y 7.2) están protegidas: no se borra nada.
        self.updater.prune_releases(keep_also="7.1")
        self.assertEqual(self.updater.installed_releases(), ["7.1", "7.2", "7.3", "7.4", "7.5"])
        self.make_releases("7.6")
        self.updater.prune_releases()
        self.assertEqual(self.updater.installed_releases(), ["7.2", "7.4", "7.5", "7.6"])

    def test_import_flatpak_settings_filters_keys(self):
        flatpak = os.path.join(self.tmp.name, "flatpak.conf")
        native = os.path.join(self.tmp.name, "config", "ZapZap", "ZapZap.conf")
        with open(flatpak, "w", encoding="utf-8") as handle:
            handle.write("[main]\ngeometry=@ByteArray(x)\n[system]\ntheme=dark\nstart_system=true\n"
                         "[onboarding]\nlast_environment=flatpak\ncompleted=true\n")
        self.updater.FLATPAK_CONFIG = flatpak
        self.updater.NATIVE_CONFIG = native
        self.assertTrue(self.updater.import_flatpak_settings())
        text = open(native, encoding="utf-8").read()
        self.assertIn("theme=dark", text)
        self.assertIn("completed=true", text)
        for removed in ("geometry=", "start_system=", "last_environment="):
            self.assertNotIn(removed, text)
        # Nunca pisa una configuración nativa existente.
        self.assertFalse(self.updater.import_flatpak_settings())

    def _git(self, *args, cwd):
        import subprocess
        return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()

    def _repos(self):
        """Repositorio «de GitHub» (bare), el clon del compañero y otro para publicar."""
        base = self.tmp.name
        origin = os.path.join(base, "origin.git")
        self._git("init", "--bare", "-q", "-b", "main", origin, cwd=base)
        author = os.path.join(base, "autor")
        self._git("clone", "-q", origin, author, cwd=base)
        for repo in (author,):
            self._git("config", "user.email", "t@t", cwd=repo)
            self._git("config", "user.name", "t", cwd=repo)
        with open(os.path.join(author, "mod.txt"), "w") as handle:
            handle.write("v1\n")
        self._git("add", "-A", cwd=author)
        self._git("commit", "-q", "-m", "v1", cwd=author)
        self._git("push", "-q", "origin", "main", cwd=author)
        mate = os.path.join(base, "companero")
        self._git("clone", "-q", origin, mate, cwd=base)
        return author, mate

    def _publish(self, author, text):
        with open(os.path.join(author, "mod.txt"), "w") as handle:
            handle.write(text)
        self._git("commit", "-q", "-am", text, cwd=author)
        self._git("push", "-q", "origin", "main", cwd=author)

    def test_mod_updates_from_git(self):
        author, mate = self._repos()
        self.assertEqual(self.updater.update_mod(mate, verify=lambda: None), "al-dia")
        self._publish(author, "v2\n")
        self.assertEqual(self.updater.update_mod(mate, verify=lambda: None), "actualizado")
        self.assertEqual(open(os.path.join(mate, "mod.txt")).read(), "v2\n")

    def test_broken_mod_update_is_reverted(self):
        author, mate = self._repos()
        self._publish(author, "roto\n")

        def broken():
            raise RuntimeError("no carga")

        self.assertEqual(self.updater.update_mod(mate, verify=broken), "revertido")
        self.assertEqual(open(os.path.join(mate, "mod.txt")).read(), "v1\n")

    def test_local_changes_are_respected(self):
        author, mate = self._repos()
        self._publish(author, "v2\n")
        with open(os.path.join(mate, "mod.txt"), "w") as handle:
            handle.write("mi cambio\n")
        self.assertEqual(self.updater.update_mod(mate, verify=lambda: None), "cambios-locales")
        self.assertEqual(open(os.path.join(mate, "mod.txt")).read(), "mi cambio\n")

    def test_folder_without_git_or_remote(self):
        plain = os.path.join(self.tmp.name, "copia-zip")
        os.makedirs(plain)
        self.assertEqual(self.updater.update_mod(plain), "no-git")
        self._git("init", "-q", plain, cwd=self.tmp.name)
        self.assertEqual(self.updater.update_mod(plain), "sin-remoto")

    def test_state_file_is_json(self):
        self.updater.save_state({"current": "7.5.1"})
        with open(self.updater.STATE_FILE, encoding="utf-8") as handle:
            self.assertEqual(json.load(handle)["current"], "7.5.1")


if __name__ == "__main__":
    unittest.main()
