"""Arranque del fork: instala el mod de forma segura y cede el control a ZapZap.

Regla de oro: si algo del mod falla, ZapZap tiene que seguir funcionando igual
que el original. Por eso todo el enganche está envuelto en try/except y el mod
no modifica ningún archivo de ZapZap.
"""

import logging
import os
import sys

logger = logging.getLogger("zapzap-p5r")

DESKTOP_ID = "zapzap-p5r"


def _configure_logging():
    if logger.handlers:
        return
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("[ZapZap P5R] %(levelname)s: %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG if os.environ.get("ZAPZAP_P5R_DEBUG") else logging.INFO)
    logger.propagate = False


def original_command_args():
    """Argumentos (sin el intérprete) que abren este mismo ZapZap sin el mod.

    Comparte configuración y sesión de WhatsApp con el fork; el PYTHONPATH que
    puso el lanzador (la versión activa de ZapZap) se hereda.
    """
    return ["-m", "zapzap"]


def mod_disabled():
    return os.environ.get("ZAPZAP_P5R_DISABLE", "").lower() in ("1", "true", "yes")


def _autostart_entry(command):
    return (
        "[Desktop Entry]\n"
        "Type=Application\n"
        "Name=ZapZap P5R\n"
        "Comment=ZapZap con estética Persona 5 Royal y tarjetas de aviso\n"
        f"Exec={command} --hideStart\n"
        "Icon=zapzap-p5r\n"
        "Terminal=false\n"
        "X-GNOME-Autostart-enabled=true\n"
    )


def apply_compat_patches():
    """Ajustes no visuales para que ZapZap se comporte como app «ZapZap P5R».

    - Ícono y nombre propios en la barra de tareas y en las notificaciones.
    - «Iniciar con el sistema» crea el autoarranque del fork, en Linux y en
      Windows (el de ZapZap apuntaría a ZapZap sin el mod).
    """
    try:
        import zapzap

        zapzap.__desktopid__ = DESKTOP_ID
    except Exception:
        logger.exception("No se pudo ajustar el identificador de escritorio")

    # Comando completo (ya entre comillas) que abre el fork; lo pone el lanzador.
    launcher = os.environ.get("ZAPZAP_P5R_LAUNCHER")
    if not launcher:
        return
    try:
        from PyQt6.QtCore import QStandardPaths
        from zapzap.features.startup.autostart_manager import AutostartManager

        if sys.platform == "win32":
            def handle_windows(enable_autostart):
                try:
                    import winreg

                    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
                    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE) as key:
                        if enable_autostart:
                            winreg.SetValueEx(key, "ZapZap P5R", 0, winreg.REG_SZ, f"{launcher} --hideStart")
                        else:
                            try:
                                winreg.DeleteValue(key, "ZapZap P5R")
                            except FileNotFoundError:
                                pass
                except OSError:
                    logger.exception("No se pudo cambiar el inicio automático")

            AutostartManager._handle_windows = staticmethod(handle_windows)
            return

        config_dir = QStandardPaths.writableLocation(
            QStandardPaths.StandardLocation.ConfigLocation
        )
        path = os.path.join(config_dir, "autostart", f"{DESKTOP_ID}.desktop")

        def create_entry():
            try:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as handle:
                    handle.write(_autostart_entry(launcher))
            except OSError:
                logger.exception("No se pudo crear el inicio automático")

        AutostartManager.CONFIG_PATH = path
        AutostartManager._create_local_desktop_entry = staticmethod(create_entry)
    except Exception:
        logger.exception("No se pudo redirigir el inicio automático; se usa el de ZapZap")


def install_mod():
    """Arranca el mod justo antes del bucle de eventos (primer ``app.exec()``).

    Engancharse a ``exec`` evita depender de nombres internos de ZapZap: para
    entonces la ventana y las páginas de WhatsApp ya existen.
    """
    try:
        from PyQt6.QtWidgets import QApplication

        original_exec = QApplication.exec

        def exec_with_mod(*_args):
            app = QApplication.instance()
            if app is not None and getattr(app, "_p5r_controller", None) is None:
                try:
                    from p5r_mod.controller import P5RController

                    app._p5r_controller = P5RController(app)
                    app._p5r_controller.start()
                except Exception:
                    logger.exception("No se pudo iniciar el mod; ZapZap sigue normal")
            return original_exec()

        QApplication.exec = staticmethod(exec_with_mod)
        return True
    except Exception:
        logger.exception("No se pudo instalar el mod; ZapZap arrancará sin él")
        return False


def run():
    _configure_logging()
    apply_compat_patches()
    if mod_disabled():
        logger.warning("Mod desactivado (modo seguro): ZapZap sin estética ni tarjetas")
    else:
        install_mod()

    from zapzap.__main__ import main

    return main()
