#!/usr/bin/env python3
"""Punto de entrada de ZapZap P5R.

Arranca la versión activa de ZapZap (descargada de GitHub y mantenida al día
por ``p5r_mod/updater.py``) con el mod de Persona 5 encima. No contiene ni
modifica código de ZapZap. Ábrelo con el lanzador ``zapzap-p5r``.

ZapZap reinicia la app re-ejecutando ``sys.argv``; por eso este archivo es un
script y no un ``python -m``: así un reinicio vuelve a abrir el fork.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from p5r_mod.bootstrap import run  # noqa: E402


if __name__ == "__main__":
    sys.exit(run())
