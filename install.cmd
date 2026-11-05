@echo off
rem Doble clic para instalar ZapZap P5R en Windows (usa install.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
pause
