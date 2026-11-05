#!/usr/bin/env bash
# Quita ZapZap P5R. El Flatpak oficial de ZapZap no se toca.
#
#   ./uninstall.sh            quita menú, ícono, comando e inicio automático
#   ./uninstall.sh --purge    además borra el ZapZap descargado, su entorno de Python
#                             y el estado del mod (tarjetas y preferencia de tema)
#
# La sesión de WhatsApp y los ajustes del ZapZap nativo (~/.config/ZapZap y
# ~/.local/share/ZapZap) nunca se borran solos: elimínalos a mano si quieres.

set -euo pipefail

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
P5R_HOME="${ZAPZAP_P5R_HOME:-$DATA_HOME/zapzap-p5r}"
STATE_DIR="$CONFIG_HOME/ZapZap-P5R"

purge=0
[ "${1:-}" = "--purge" ] && purge=1

rm -fv "$DATA_HOME/applications/zapzap-p5r.desktop" \
       "$DATA_HOME/icons/hicolor/scalable/apps/zapzap-p5r.svg" \
       "$CONFIG_HOME/autostart/zapzap-p5r.desktop" \
       "$HOME/.local/bin/zapzap-p5r"

if [ "$purge" = 1 ]; then
    rm -rf "$P5R_HOME" && echo "Borrado: $P5R_HOME"
    rm -rf "$STATE_DIR" && echo "Borrado: $STATE_DIR"
fi

command -v update-desktop-database >/dev/null 2>&1 \
    && update-desktop-database -q "$DATA_HOME/applications" || true

echo "Listo. El ZapZap de Flathub sigue instalado y funcionando como siempre."
if [ "$purge" = 0 ]; then
    echo "Se conservaron $P5R_HOME y tus tarjetas en $STATE_DIR (usa --purge para borrarlos)."
fi
