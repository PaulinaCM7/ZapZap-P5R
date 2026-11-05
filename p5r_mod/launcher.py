#!/usr/bin/env python3
"""ZapZap P5R — lanzador (Linux y Windows).

Abre ZapZap (código de GitHub, en su propio entorno de Python) con el mod de
Persona 5 encima. ZapZap se mantiene al día solo: cada arranque busca en
segundo plano (como mucho cada 12 h) una versión estable nueva y la deja lista
para la próxima vez. Si una versión nueva falla al arrancar, se vuelve sola a
la anterior.

    zapzap-p5r              abre el fork
    zapzap-p5r --original   abre el mismo ZapZap sin el mod (misma sesión de WhatsApp)
    zapzap-p5r --flatpak    abre el ZapZap oficial de Flathub (solo Linux, sesión aparte)
    zapzap-p5r --safe       abre el fork con el mod desactivado (diagnóstico)
    zapzap-p5r --debug      muestra el registro detallado del mod en la terminal
    zapzap-p5r --update     busca ya una versión nueva de ZapZap (y de PyQt6 si está cerrado)
    zapzap-p5r --rollback   vuelve a la versión anterior de ZapZap
    zapzap-p5r --status     versión activa, versiones guardadas y última búsqueda
    zapzap-p5r --check      comprueba que el mod carga con la versión activa

Cualquier otro argumento se pasa a ZapZap (p. ej. --hideStart o un enlace whatsapp://).
Solo usa la biblioteca estándar.
"""

import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import updater  # noqa: E402

ENTRY = os.path.join(PROJECT_DIR, "zapzap_p5r.py")
FLATPAK_ID = "com.rtosta.zapzap"
QUICK_CRASH_S = 25
IS_WINDOWS = updater.IS_WINDOWS
FLAGS = {"--original", "--flatpak", "--safe", "--debug", "--update", "--rollback", "--status", "--check"}


def say(message):
    print(f"[ZapZap P5R] {message}", file=sys.stderr, flush=True)
    if not IS_WINDOWS and not sys.stderr.isatty():
        updater.notify(message)


def autostart_command():
    """Comando que vuelve a abrir el fork (para el inicio automático de ZapZap)."""
    if IS_WINDOWS:
        base = sys.executable
        windowless = os.path.join(os.path.dirname(base), "pythonw.exe")
        python = windowless if os.path.exists(windowless) else base
        return f'"{python}" "{os.path.abspath(__file__)}"'
    return f'"{os.path.join(PROJECT_DIR, "zapzap-p5r")}"'


# ------------------------------------------------------------ procesos
# El fork y el original comparten sesión de WhatsApp: nunca deben correr a la
# vez. Se busca solo el proceso de Python de cada modo para cerrarlo en orden.
def _python_processes():
    """[(pid, línea de comando)] de los procesos de Python del usuario."""
    if IS_WINDOWS:
        script = ("Get-CimInstance Win32_Process -Filter \"Name like 'python%'\" | "
                  "ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }")
        try:
            out = subprocess.run(["powershell", "-NoProfile", "-Command", script],
                                 capture_output=True, text=True, timeout=20,
                                 creationflags=subprocess.CREATE_NO_WINDOW).stdout
        except (OSError, subprocess.SubprocessError):
            return []
        result = []
        for line in out.splitlines():
            pid, _, command = line.partition("\t")
            if pid.strip().isdigit():
                result.append((int(pid), command))
        return result
    result = []
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        try:
            if os.stat(f"/proc/{name}").st_uid != os.getuid():
                continue
            with open(f"/proc/{name}/cmdline", "rb") as handle:
                parts = handle.read().split(b"\0")
        except OSError:
            continue
        command = " ".join(p.decode("utf-8", "replace") for p in parts if p)
        if os.path.basename(parts[0].decode("utf-8", "replace")).startswith("python"):
            result.append((int(name), command))
    return result


def _venv_command(command):
    return os.path.normcase(updater.VENV_DIR) in os.path.normcase(command)


def fork_pids():
    return [pid for pid, cmd in _python_processes() if _venv_command(cmd) and "zapzap_p5r.py" in cmd]


def original_pids():
    return [pid for pid, cmd in _python_processes()
            if _venv_command(cmd) and ("-m zapzap" in cmd or "__main__.py" in cmd)
            and "zapzap_p5r.py" not in cmd]


def flatpak_pids():
    if IS_WINDOWS:
        return []
    return [pid for pid, cmd in _python_processes() if " /app/bin/zapzap" in f" {cmd}"]


def stop(find_pids, label):
    pids = find_pids()
    if not pids:
        return
    say(f"Cerrando {label}…")
    for pid in pids:
        if IS_WINDOWS:
            subprocess.run(["taskkill", "/PID", str(pid)], capture_output=True,
                           creationflags=subprocess.CREATE_NO_WINDOW)
        else:
            try:
                os.kill(pid, 15)
            except OSError:
                pass
    for _ in range(40):
        if not find_pids():
            return
        time.sleep(0.25)
    say("No se cerró a tiempo; forzando el cierre.")
    for pid in find_pids():
        if IS_WINDOWS:
            subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True,
                           creationflags=subprocess.CREATE_NO_WINDOW)
        else:
            try:
                os.kill(pid, 9)
            except OSError:
                pass
    time.sleep(1)


# --------------------------------------------------------------- ZapZap
def ensure_installed():
    if os.path.isfile(updater.VENV_PYTHON) and updater.current_dir():
        return
    say("Preparando ZapZap (la primera vez tarda unos minutos)…")
    if updater.main(["install", "--import-flatpak-settings"]) != 0:
        say(f"No se pudo instalar ZapZap. Detalles en {updater.LOG_FILE}")
        sys.exit(1)


def start_background_update():
    cmd = [sys.executable, os.path.join(HERE, "updater.py"), "update", "--quiet"]
    kwargs = {"stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
    if IS_WINDOWS:
        kwargs["creationflags"] = (subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
                                   | subprocess.CREATE_NO_WINDOW)
    else:
        kwargs["start_new_session"] = True
    try:
        subprocess.Popen(cmd, **kwargs)
    except OSError:
        pass


def run_zapzap(args, extra_env):
    """Ejecuta ZapZap; si una versión recién actualizada se cae al arrancar, vuelve a la anterior."""
    release = updater.current_dir()
    start_background_update()
    env = dict(os.environ, PYTHONPATH=release, ZAPZAP_P5R_LAUNCHER=autostart_command(), **extra_env)
    started = time.time()
    code = subprocess.call([updater.VENV_PYTHON_GUI, *args], env=env)
    elapsed = time.time() - started
    if code != 0 and elapsed < QUICK_CRASH_S:
        updater.QUIET = True
        updater.main(["rollback", "--only-if-fresh", "--reason", f"falló al arrancar (código {code})"])
    else:
        updater.main(["mark-good"])
    return code


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if "-h" in argv or "--help" in argv:
        print(__doc__)
        return 0
    flags = {a for a in argv if a in FLAGS}
    zapzap_args = [a for a in argv if a not in FLAGS]
    extra_env = {}
    if "--safe" in flags:
        extra_env["ZAPZAP_P5R_DISABLE"] = "1"
    if "--debug" in flags:
        extra_env["ZAPZAP_P5R_DEBUG"] = "1"

    if "--status" in flags:
        return updater.main(["status"])
    if "--rollback" in flags:
        return updater.main(["rollback"])
    if "--check" in flags:
        ensure_installed()
        return updater.main(["check"])
    if "--update" in flags:
        ensure_installed()
        if fork_pids() or original_pids():
            code = updater.main(["update", "--force", "--retry-skipped"])
            print("(PyQt6 se actualiza solo con ZapZap cerrado: vuelve a pedir la actualización después de cerrarlo)")
        else:
            code = updater.main(["update", "--force", "--retry-skipped", "--deps"])
        say(f"Versión activa de ZapZap: {updater.current_release()}")
        return code
    if "--flatpak" in flags:
        if IS_WINDOWS or not shutil.which("flatpak"):
            say("El ZapZap de Flathub solo existe en Linux con Flatpak.")
            return 1
        stop(fork_pids, "ZapZap P5R")
        stop(original_pids, "ZapZap original")
        return subprocess.call(["flatpak", "run", FLATPAK_ID, *zapzap_args])

    ensure_installed()
    if "--original" in flags:
        stop(fork_pids, "ZapZap P5R")
        stop(flatpak_pids, "el ZapZap de Flathub")
        return run_zapzap(["-m", "zapzap", *zapzap_args], extra_env)

    stop(original_pids, "ZapZap original")
    stop(flatpak_pids, "el ZapZap de Flathub (para no duplicar notificaciones)")
    return run_zapzap([ENTRY, *zapzap_args], extra_env)


if __name__ == "__main__":
    sys.exit(main())
