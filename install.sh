#!/usr/bin/env bash
# Instala ZapZap P5R: ZapZap desde GitHub (en su propio entorno de Python) +
# el mod de Persona 5 + el acceso directo en el menú de aplicaciones.
#
#   ./install.sh               instala (o repara) y crea el acceso directo
#   ./install.sh --autostart   además, abrir ZapZap P5R al iniciar sesión (oculto en la bandeja)
#
# El Flatpak oficial de ZapZap no se toca: sigue disponible como respaldo.

set -euo pipefail

HERE="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
LAUNCHER="$HERE/zapzap-p5r"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
DESKTOP_FILE="$DATA_HOME/applications/zapzap-p5r.desktop"
ICON_FILE="$DATA_HOME/icons/hicolor/scalable/apps/zapzap-p5r.svg"
AUTOSTART_FILE="$CONFIG_HOME/autostart/zapzap-p5r.desktop"
BIN_LINK="$HOME/.local/bin/zapzap-p5r"

autostart=0
for arg in "$@"; do
    case "$arg" in
        --autostart) autostart=1 ;;
        -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Opción desconocida: $arg" >&2; exit 2 ;;
    esac
done

for tool in git python3; do
    command -v "$tool" >/dev/null 2>&1 || { echo "Falta '$tool' en el sistema." >&2; exit 1; }
done

chmod +x "$LAUNCHER" "$HERE/zapzap_p5r.py" "$HERE/p5r_mod/updater.py"

echo "→ ZapZap desde GitHub (la primera vez descarga PyQt6, ~150 MB)…"
python3 "$HERE/p5r_mod/updater.py" install --import-flatpak-settings
python3 "$HERE/p5r_mod/updater.py" check

render_desktop() {
    local escaped
    escaped="$(printf '%s' "$LAUNCHER" | sed 's/[&|\\]/\\&/g')"
    sed "s|@LAUNCHER@|$escaped|g" "$HERE/desktop/zapzap-p5r.desktop.in"
}

install -Dm644 "$HERE/desktop/zapzap-p5r.svg" "$ICON_FILE"
mkdir -p "$(dirname "$DESKTOP_FILE")"
render_desktop > "$DESKTOP_FILE"
chmod 644 "$DESKTOP_FILE"
echo "✓ Acceso directo: $DESKTOP_FILE"

mkdir -p "$(dirname "$BIN_LINK")"
ln -sfn "$LAUNCHER" "$BIN_LINK"
echo "✓ Comando en terminal: zapzap-p5r"

if [ "$autostart" = 1 ]; then
    mkdir -p "$(dirname "$AUTOSTART_FILE")"
    render_desktop \
        | sed 's|^Exec=\(.*\) %u$|Exec=\1 --hideStart|' \
        | sed '/^Actions=/d; /^\[Desktop Action/,$d' > "$AUTOSTART_FILE"
    echo "X-GNOME-Autostart-enabled=true" >> "$AUTOSTART_FILE"
    echo "✓ Inicio automático: $AUTOSTART_FILE"
    echo "  Desactiva «Iniciar con el sistema» en el ZapZap de Flathub para que no arranquen los dos."
fi

command -v update-desktop-database >/dev/null 2>&1 \
    && update-desktop-database -q "$(dirname "$DESKTOP_FILE")" || true
command -v gtk-update-icon-cache >/dev/null 2>&1 \
    && gtk-update-icon-cache -q -t "$DATA_HOME/icons/hicolor" 2>/dev/null || true

if [ -d "$HERE/.git" ] && command -v git >/dev/null 2>&1; then
    echo "✓ ZapZap P5R se actualizará solo desde su repositorio (git)"
else
    echo "Aviso: esta carpeta no es un clon de git (o falta git): ZapZap P5R no se"
    echo "  actualizará solo (ZapZap sí). Para eso, clona el repositorio con «git clone»."
fi

echo
echo "Listo. Abre «ZapZap P5R» desde el menú de aplicaciones."
echo "La primera vez escanea el código QR con tu teléfono (WhatsApp → Dispositivos vinculados)."
