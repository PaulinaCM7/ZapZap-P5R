@echo off
rem Doble clic para quitar ZapZap P5R de Windows (usa uninstall.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
pause
