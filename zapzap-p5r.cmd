@echo off
rem ZapZap P5R - lanzador para Windows (desde terminal). Ayuda: zapzap-p5r --help
rem El acceso directo del menu Inicio usa pythonw.exe para no abrir consola.
where py >nul 2>nul
if %errorlevel%==0 (
    py -3 "%~dp0p5r_mod\launcher.py" %*
) else (
    python "%~dp0p5r_mod\launcher.py" %*
)
