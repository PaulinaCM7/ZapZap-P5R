"""Prueba de humo: arranca ZapZap real con el mod, sin pantalla, y lo ejercita.

Usa la página de WhatsApp Web sin sesión (QR) y un chat de mentira dibujado
encima para probar el tema, el botón nativo, las tarjetas, el banner y la
sincronización con Python. Guarda capturas en --out.

    ~/.local/share/zapzap-p5r/venv/bin/python tests/smoke_offscreen.py --out /tmp/p5r-smoke

Por defecto prueba la versión de ZapZap activa del fork (--zapzap-src para otra).
Usa carpetas temporales: no toca la configuración real de ZapZap.
"""

import argparse
import base64
import datetime
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_HOME = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
sys.path.insert(0, os.path.join(ROOT, "p5r_mod"))
import updater  # noqa: E402

DEFAULT_SRC = updater.current_dir() or ""

# Imita la estructura de WhatsApp Web (lista de chats + conversación) con
# estilos basados en sus variables, para probar el marcado por geometría.
FAKE_CHAT_JS = r"""
(() => {
  for (const id of ['main', 'pane-side']) document.getElementById(id)?.remove();
  const face = (color) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${color}"/>` +
    `<circle cx="20" cy="15" r="8" fill="#f1d7c3"/><rect x="8" y="26" width="24" height="14" rx="7" fill="#333"/></svg>`);
  const chats = [
    ['Los Ladrones', '10:30 a. m.', 'Ann: ¿Vas a enviar el aviso?', '#c0392b', true],
    ['Ann', '9:12 a. m.', '¡Buena suerte hoy!', '#8e44ad', false],
    ['Makoto', 'Ayer', 'Ruta de infiltración segura', '#2c3e50', false],
    ['Yusuke', 'jueves', 'Ayuda con movimiento nuevo', '#16a085', false],
  ];
  const pane = document.createElement('div');
  pane.id = 'pane-side';
  pane.style.cssText = 'position:fixed;left:72px;top:0;width:36%;bottom:0;overflow:auto;z-index:1000;background:var(--WDS-surface-default,#111b21)';
  pane.innerHTML = `<div role="grid" style="position:relative;height:${chats.length * 72}px">` + chats.map(([name, time, last, color, selected], i) => `
    <div role="listitem" style="position:absolute;top:${i * 72}px;left:0;right:0;height:72px">
      <div ${selected ? 'aria-selected="true"' : ''} style="display:flex;align-items:center;height:100%;padding:0 14px;gap:14px">
        <div style="width:49px;height:49px;flex:none;border-radius:50%;overflow:hidden"><img src="${face(color)}" style="width:100%;height:100%;display:block"></div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">
          <div style="display:flex;justify-content:space-between;gap:8px">
            <span dir="auto" title="${name}" style="overflow:hidden;white-space:nowrap;color:var(--WDS-content-default,#e9edef);font-size:16px">${name}</span>
            <div style="font-size:12px;color:var(--WDS-content-deemphasized,#8696a0)">${time}</div>
          </div>
          <div style="display:flex"><span dir="auto" title="${last}" style="overflow:hidden;white-space:nowrap;color:var(--WDS-content-deemphasized,#8696a0);font-size:14px">${last}</span></div>
        </div>
      </div>
    </div>`).join('') + '</div>';
  const main = document.createElement('div');
  main.id = 'main';
  main.style.cssText = 'position:fixed;top:0;right:0;width:calc(64% - 72px);height:100%;z-index:1000;display:flex;flex-direction:column;';
  // Como WhatsApp ahora: fila role=row con data-id ("true_" = mío) y, solo en
  // algunas, las clases clásicas message-in/out (para probar ambos caminos).
  const bubble = (dir, author, text, opts = {}) => `
    <div role="row"><div data-id="${dir === 'in' ? 'false' : 'true'}_123@g.us_${Math.random().toString(36).slice(2, 10)}"
         ${opts.classic ? `class="message-${dir}"` : ''}
         style="display:flex;justify-content:${dir === 'in' ? 'flex-start' : 'flex-end'};align-items:flex-start;gap:12px">
      ${dir === 'in' && opts.avatar ? `<div style="width:28px;height:28px;flex:none;border-radius:50%;overflow:hidden"><img src="${opts.avatar}" style="width:100%;height:100%;display:block"></div>` : ''}
      <div style="position:relative;max-width:70%;background:var(--WDS-systems-bubble-surface-${dir === 'in' ? 'incoming' : 'outgoing'},#202c33);color:var(--WDS-content-default,#eee);padding:8px 12px;border-radius:8px">
        <span data-icon="tail-${dir}" style="position:absolute;top:0;${dir === 'in' ? 'left:-8px' : 'right:-8px'};width:8px;height:13px;background:inherit"></span>
        ${opts.image ? `<div style="margin:-4px -8px 4px"><img src="${opts.image}" style="width:260px;height:160px;display:block;border-radius:6px"></div>` : ''}
        ${text ? `<div class="copyable-text" data-pre-plain-text="[10:30, 3/11/2026] ${author}: "><span class="selectable-text" style="white-space:pre-wrap">${text}</span></div>` : ''}
      </div>
    </div></div>`;
  // Sticker como lo dibuja WhatsApp: sin burbuja, nombre y hora en etiquetas.
  const sticker = (author, image, avatar) => `
    <div role="row"><div data-testid="conv-msg-${Math.random().toString(36).slice(2, 10)}"
         style="position:relative;display:flex;justify-content:flex-start;align-items:flex-start;padding-left:40px">
      <div style="position:absolute;left:0;top:0;z-index:0"><div><div id="sticker-avatar" style="width:28px;height:31px;border-radius:50%;overflow:hidden">
        <div data-testid="group-chat-profile-picture" role="button" style="position:sticky;top:0;width:28px;height:31px"><img src="${avatar}" style="width:100%;height:100%;display:block"></div>
      </div></div></div>
      <div data-testid="msg-container" style="display:flex;flex-direction:column;gap:4px">
        <span data-testid="tail-in" data-icon="tail-in" style="display:none"></span>
        <div id="sticker-author" style="align-self:flex-start;background:var(--WDS-systems-bubble-surface-incoming,#202c33);color:#e91e63;padding:2px 8px;border-radius:6px;font-size:13px">${author}</div>
        <div style="width:170px;height:150px"><img src="${image}" style="width:170px;height:150px;display:block"></div>
        <span style="align-self:flex-end;background:var(--WDS-systems-bubble-surface-incoming,#202c33);color:#ccc;padding:2px 6px;border-radius:6px;font-size:11px">10:52 p.m.</span>
      </div>
    </div></div>`;
  // Archivo como en WhatsApp 2026: sin data-id ni texto, con msg-container.
  const fileMsg = (name) => `
    <div role="row"><div data-testid="conv-msg-${Math.random().toString(36).slice(2, 10)}"
         style="display:flex;justify-content:flex-start;gap:12px;padding-left:40px">
      <div data-testid="msg-container" style="position:relative;border-radius:7.5px">
        <span data-testid="tail-in" data-icon="tail-in" style="display:none"></span>
        <div style="background:var(--WDS-systems-bubble-surface-incoming,#202c33);color:#eee;padding:6px;border-radius:7.5px;width:300px">
          <div style="display:flex;gap:10px;align-items:center;background:rgba(0,0,0,.35);padding:10px;border-radius:6px">
            <div style="width:30px;height:38px;background:#e53935"></div><div>${name}<br><small>12 MB · PDF</small></div>
          </div>
          <div data-testid="msg-meta" style="text-align:right;font-size:11px">5:27 p.m.</div>
        </div>
      </div>
    </div></div>`;
  // Grupo de mensajes como en WhatsApp 2026 (según el diagnóstico): contenedor
  // relativo con la foto en una columna absoluta (foto sticky) y las filas
  // después, con capa propia alta (z-index 70). El primer mensaje es corto y su
  // rayo llegaría encima de la foto.
  const senderGroup = (author, avatar, text, image) => `
    <div style="position:relative">
      <div style="position:absolute;left:0;top:0;bottom:12px;width:28px">
        <div style="height:100%"><div id="group-avatar" style="width:28px;height:31px;border-radius:50%;overflow:hidden;position:relative">
          <div data-testid="group-chat-profile-picture" role="button" style="position:sticky;top:0;width:28px;height:31px"><img src="${avatar}" style="width:100%;height:100%;display:block"></div>
        </div></div>
      </div>
      <div role="row"><div data-testid="conv-msg-${Math.random().toString(36).slice(2, 10)}" style="position:relative;z-index:70;display:flex;padding-left:40px">
        <div data-testid="msg-container" style="position:relative">
          <span data-testid="tail-in" data-icon="tail-in" style="display:none"></span>
          <div id="group-first-bubble" style="background:var(--WDS-systems-bubble-surface-incoming,#202c33);color:var(--WDS-content-default,#eee);padding:4px 10px;border-radius:7.5px">
            <div data-testid="author" style="font-size:12px;color:#e9a">${author}</div>
            <div class="copyable-text" data-pre-plain-text="[2:35, 5/11/2026] ${author}: "><span class="selectable-text">${text}</span></div>
          </div>
        </div>
      </div></div>
      <div role="row"><div data-testid="conv-msg-${Math.random().toString(36).slice(2, 10)}" style="position:relative;z-index:70;display:flex;padding-left:40px;margin-top:4px">
        <div data-testid="msg-container" style="display:flex;flex-direction:column;gap:4px">
          <div id="sticker-author" style="align-self:flex-start;background:var(--WDS-systems-bubble-surface-incoming,#202c33);padding:2px 8px;border-radius:6px;font-size:13px"><span data-testid="author" role="button" style="color:#e91e63">${author}</span></div>
          <div style="width:170px;height:150px"><img src="${image}" style="width:170px;height:150px;display:block"></div>
          <span style="align-self:flex-end;background:var(--WDS-systems-bubble-surface-incoming,#202c33);color:#ccc;padding:2px 6px;border-radius:6px;font-size:11px">10:52 p.m.</span>
        </div>
      </div></div>
    </div>`;
  const photo = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 160"><defs><linearGradient id="g" x1="0" x2="1">' +
    '<stop offset="0" stop-color="#f6b26b"/><stop offset="1" stop-color="#8e7cc3"/></linearGradient></defs>' +
    '<rect width="260" height="160" fill="url(#g)"/><circle cx="70" cy="70" r="30" fill="#fff3"/><rect x="120" y="90" width="110" height="50" fill="#0003"/></svg>');
  main.innerHTML = `
    <header style="height:60px;display:flex;align-items:center;gap:12px;padding:0 16px;background:var(--WDS-surface-default,#202c33)">
      <div style="width:40px;height:40px;border-radius:50%;background:#888"></div>
      <div style="flex:1"><span dir="auto" title="Los Ladrones">Los Ladrones</span><br><span dir="auto" style="font-size:12px">Ann, Ryuji, Morgana, tú</span></div>
      <div><button style="width:40px;height:40px">⋮</button></div>
    </header>
    <div id="fake-messages" style="flex:1;padding:70px 28px 24px;display:flex;flex-direction:column;gap:16px;overflow:auto">
      ${bubble('in', 'Ann', '¿Mañana nos vemos en el escondite?', { avatar: face('#8e44ad'), classic: true })}
      ${bubble('out', 'Tú', 'Sí, llevo la tarjeta de aviso 🎭')}
      ${bubble('in', 'Ryuji', '¡Esta vez sí le robamos el corazón!', { avatar: face('#2980b9') })}
      ${bubble('in', 'Ann', '', { avatar: face('#8e44ad'), image: photo })}
      ${senderGroup('Proyecto', face('#27ae60'), 'Amikos', photo)}
      ${fileMsg('reporte-final.pdf')}
      <div id="loose-avatar" style="width:28px;height:28px;flex:none;border-radius:50%;overflow:hidden;align-self:flex-start"><img src="${face('#d35400')}" style="width:100%;height:100%;display:block"></div>
    </div>
    <footer style="display:flex;gap:8px;padding:10px 16px;background:var(--WDS-systems-chat-surface-tray,#202c33)">
      <div contenteditable="true" role="textbox" style="flex:1;min-height:24px;padding:8px;background:var(--WDS-systems-chat-surface-composer,#2a3942);color:var(--WDS-content-default,#eee)"></div>
      <button aria-label="Enviar" id="fake-send" style="width:40px"><span data-icon="send">➤</span></button>
    </footer>`;
  document.body.append(pane, main);
  // «Enviar» de mentira: mueve el texto de la caja a una burbuja nueva.
  window.__p5rFakeBubble = bubble;
  document.getElementById('fake-send').addEventListener('click', () => {
    const box = main.querySelector('footer [contenteditable]');
    const text = box.innerText;
    if (!text.trim()) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = bubble('out', 'Tú', text.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
    document.getElementById('fake-messages').append(wrap.firstElementChild);
    box.textContent = '';
  });
  return true;
})()
"""

ADD_INCOMING_JS = r"""
(() => {
  const wrap = document.createElement('div');
  wrap.innerHTML = window.__p5rFakeBubble('in', %(author)s, %(text)s.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
  document.getElementById('fake-messages').append(wrap.firstElementChild);
  return true;
})()
"""


def card_message(card_id, title, target, message=""):
    lines = ["🎭 *TARJETA DE AVISO* 🎭", f"«{title}»"]
    if message:
        lines += ["", message]
    lines += ["", "📅 Fecha: algún día", "— Los Ladrones Fantasma", f"p5r://aviso/{target}/{card_id}"]
    return "\n".join(lines)


def prepare_environment(tmp):
    for name in ("config", "data", "cache", "state", "runtime"):
        os.makedirs(os.path.join(tmp, name), exist_ok=True)
    os.chmod(os.path.join(tmp, "runtime"), 0o700)
    # Sin DISPLAY el plugin offscreen no intenta usar GLX del servidor X real.
    for name in ("DISPLAY", "WAYLAND_DISPLAY"):
        os.environ.pop(name, None)
    os.environ.update({
        "XDG_CONFIG_HOME": os.path.join(tmp, "config"),
        "XDG_DATA_HOME": os.path.join(tmp, "data"),
        "XDG_CACHE_HOME": os.path.join(tmp, "cache"),
        "XDG_RUNTIME_DIR": os.path.join(tmp, "runtime"),
        "ZAPZAP_P5R_STATE_DIR": os.path.join(tmp, "state"),
        "ZAPZAP_P5R_DEBUG": "1",
        "QT_QPA_PLATFORM": "offscreen",
        "QT_QUICK_BACKEND": "software",
        "QTWEBENGINE_DISABLE_SANDBOX": "1",
        "QTWEBENGINE_CHROMIUM_FLAGS": "--disable-gpu",
    })
    conf_dir = os.path.join(tmp, "config", "ZapZap")
    os.makedirs(conf_dir, exist_ok=True)
    with open(os.path.join(conf_dir, "ZapZap.conf"), "w", encoding="utf-8") as handle:
        handle.write(
            "[onboarding]\ncompleted=true\ninitial_setup_completed=true\nversion=2\n"
            "[website]\nopen_page=false\n"
            "[notification]\ndonation_message=false\n"
            "[system]\ntheme=dark\nstart_background=false\ntray_icon=false\n"
        )


class Driver:
    """Ejecuta los pasos como una corrutina sobre el bucle de Qt."""

    def __init__(self, app, out_dir):
        from PyQt6.QtCore import QTimer

        self.QTimer = QTimer
        self.app = app
        self.out = out_dir
        self.results = []
        self.failures = 0
        self.steps = self.run()

    # -- infraestructura
    def start(self):
        self._advance(None)

    def _advance(self, value):
        try:
            action = self.steps.send(value)
        except StopIteration:
            return
        except Exception as error:  # noqa: BLE001 - reportar y salir
            self.check(f"excepción en la prueba: {error!r}", False)
            self.finish()
            return
        kind = action[0]
        if kind == "wait":
            self.QTimer.singleShot(action[1], lambda: self._advance(None))
        elif kind == "js":
            _, page, code = action
            page.runJavaScript(code, 0, lambda result: self.QTimer.singleShot(0, lambda: self._advance(result)))

    def check(self, label, ok, detail=""):
        self.results.append((label, bool(ok), detail))
        if not ok:
            self.failures += 1
        print(f"  {'✔' if ok else '✘'} {label}{(' — ' + str(detail)) if detail else ''}", flush=True)

    def shot(self, window, name):
        path = os.path.join(self.out, name)
        window.grab().save(path)
        print(f"  📸 {path}", flush=True)

    def finish(self):
        print(f"\nResultado: {len(self.results) - self.failures}/{len(self.results)} comprobaciones OK", flush=True)
        self.app.exit(1 if self.failures else 0)

    # -- pasos
    def run(self):
        from PyQt6.QtWidgets import QMenuBar, QPushButton

        controller = self.app._p5r_controller
        self.check("controlador del mod iniciado", controller is not None)
        self.check("app identificada como zapzap-p5r (ícono propio)",
                   self.app.desktopFileName() == "zapzap-p5r", self.app.desktopFileName())
        from zapzap.features.startup.autostart_manager import AutostartManager
        AutostartManager.create_desktop_file(True)
        autostart = AutostartManager.CONFIG_PATH
        content = open(autostart, encoding="utf-8").read() if os.path.exists(autostart) else ""
        self.check("«Iniciar con el sistema» crea el autoarranque del fork",
                   autostart.endswith("zapzap-p5r.desktop") and "zapzap-p5r\" --hideStart" in content, autostart)
        AutostartManager.create_desktop_file(False)
        self.check("y desactivarlo lo borra", not os.path.exists(autostart))

        page = None
        for _ in range(90):
            pages = [p for p, _a in controller._live_pages() if p.url().host() == "web.whatsapp.com"]
            if pages:
                ready = yield ("js", pages[0], "document.readyState === 'complete' && !!window.__zapzapP5R")
                if ready:
                    page = pages[0]
                    break
            yield ("wait", 1000)
        self.check("WhatsApp Web cargó con el runtime P5R inyectado", page is not None)
        if page is None:
            self.finish()
            return
        yield ("wait", 2500)

        window = self.app.activeWindow() or next(
            w for w in self.app.topLevelWidgets() if w.property("p5r_menu_installed")
        )
        window.resize(1280, 800)
        for widget in self.app.allWidgets():
            if "Donation" in type(widget).__name__:
                widget.hide()
        yield ("wait", 800)
        menubar = window.findChild(QMenuBar)
        titles = [a.text() for a in menubar.actions()] if menubar else []
        self.check("menú «Persona 5» en la barra de menús", "&Persona 5" in titles, titles)
        button = window.findChild(QPushButton, "p5r_toggle")
        self.check("botón P5R en la barra lateral", button is not None and button.isChecked())

        info = yield ("js", page, "JSON.stringify(window.__zapzapP5R.debug())")
        info = json.loads(info)
        self.check("tema activo en la página", info["theme"] is True)
        self.check("selectores de tema de WhatsApp detectados", info["overrideSelectors"] > 0, info["overrideSelectors"])
        accent = yield ("js", page, "getComputedStyle(document.body).getPropertyValue('--WDS-accent').trim()")
        self.check("color de acento sobrescrito a rojo", accent.lower() == "#e60012", accent)

        account = page.profile().storageName() or "default"
        today = datetime.date.today()
        in_days = lambda n: (today + datetime.timedelta(days=n)).isoformat()  # noqa: E731

        def js_debug():
            return ("js", page, "JSON.stringify(window.__zapzapP5R.debug())")

        def js_cards():
            return ("js", page, "window.__zapzapP5R.debugCards()")

        yield ("js", page, FAKE_CHAT_JS)
        yield ("wait", 1500)
        info = json.loads((yield js_debug()))
        self.check("chat abierto detectado", bool(info["chat"]) and info["chat"]["title"] == "Los Ladrones", info["chat"])

        # --- Tarjeta recibida (como la entregaría el vigilante de mensajes) ---
        received = card_message("ann0000001", "Robar el corazón del casero", in_days(5),
                                "Tu codicia por subir la renta termina aquí.")
        meta = {"chatKey": "title:Los Ladrones", "chatTitle": "Los Ladrones", "isGroup": True,
                "fromMe": False, "author": "Ann", "msgTime": 1_000_000}
        ok = yield ("js", page, f"window.__zapzapP5R.debugIngest({json.dumps(received)}, {json.dumps(meta)})")
        cards = json.loads((yield js_cards()))
        self.check("una tarjeta recibida por el chat se guarda sola", ok is True and len(cards) == 1
                   and cards[0]["origin"] == "them" and cards[0]["author"] == "Ann"
                   and cards[0]["message"].startswith("Tu codicia"), cards[:1])
        again = yield ("js", page, f"window.__zapzapP5R.debugIngest({json.dumps(received)}, {json.dumps(meta)})")
        self.check("el mismo mensaje no la duplica", again is False)

        # --- Modo normal: casi sin cambios, solo los días en la lista ---
        controller.set_theme(False)
        yield ("wait", 1500)
        has_class = yield ("js", page, "document.documentElement.classList.contains('p5r')")
        self.check("apagar desde Qt quita el tema", has_class is False)
        self.check("el botón nativo refleja el apagado", not button.isChecked())
        normal = json.loads((yield ("js", page, """JSON.stringify((() => {
            const hidden = (sel) => { const n = document.querySelector(sel); return !n || n.classList.contains('p5r-hidden'); };
            const badge = document.querySelector('.p5r-list-badge');
            return { button: hidden('[data-p5r="chat-btn"]'), banner: hidden('[data-p5r="banner"]'),
                     badge: badge ? badge.textContent : null,
                     radius: badge ? getComputedStyle(badge).borderRadius : null,
                     bubbleSkin: getComputedStyle(document.querySelector('#main [data-p5r-bubble]'), '::before').content };
        })())""")))
        self.check("modo normal: sin botón ni banner en el chat", normal["button"] and normal["banner"], normal)
        self.check("modo normal: días pendientes en la lista de chats", normal["badge"] == "5d" and normal["radius"] == "9px", normal)
        self.check("modo normal: burbujas originales", normal["bubbleSkin"] in ("none", "normal"), normal["bubbleSkin"])
        self.shot(window, "01-modo-normal.png")

        # --- Modo Persona: lista estilo juego y burbujas con picos ---
        yield ("js", page, "window.__zapzapP5R.setTheme(true)")
        yield ("wait", 650)
        phase = yield ("js", page, "document.querySelector('.p5r-transition')?.dataset.phase || null")
        self.check("al entrar al modo Persona arranca la transición de agua", phase == "in", phase)
        self.shot(window, "08-transicion.png")
        # La página se recarga por debajo del rojo; esperar a que vuelva.
        reloaded = None
        for _ in range(60):
            yield ("wait", 1000)
            reloaded = yield ("js", page, "window.__zapzapP5R && !document.getElementById('fake-messages') ? JSON.stringify(window.__zapzapP5R.debug()) : null")
            if reloaded:
                break
        reloaded = json.loads(reloaded) if reloaded else {}
        self.check("WhatsApp se recargó con el tema y la transición en pausa",
                   reloaded.get("theme") is True and reloaded.get("lastTransition") in ("hold", "out"), reloaded)
        for _ in range(40):
            yield ("wait", 500)
            gone = yield ("js", page, "!document.querySelector('.p5r-transition')")
            if gone:
                break
        self.check("al terminar de cargar, el rojo se retira", gone is True)
        yield ("wait", 2000)
        self.check("encender desde la página llega a Python (aunque se recargue)", controller.state.theme_enabled is True)
        self.check("el botón nativo refleja el encendido", button.isChecked())
        yield ("js", page, FAKE_CHAT_JS)
        yield ("wait", 2000)
        marks = json.loads((yield ("js", page, """JSON.stringify((() => {
            const count = (sel) => document.querySelectorAll('#pane-side ' + sel).length;
            return { rows: count('[data-p5r-row]'), names: count('[data-p5r-name]'), times: count('[data-p5r-time]'),
                     previews: count('[data-p5r-preview]'), avatars: count('[data-p5r-avatar]'),
                     bubblesIn: document.querySelectorAll('#main [data-p5r-bubble="in"]').length,
                     bubblesOut: document.querySelectorAll('#main [data-p5r-bubble="out"]').length,
                     media: document.querySelectorAll('#main [data-p5r-media]').length,
                     marked: [...document.querySelectorAll('#main [data-p5r-bubble]')].map((n) => {
                       const r = n.getBoundingClientRect();
                       return `${n.tagName}:${n.getAttribute('data-p5r-bubble')}:${Math.round(r.width)}x${Math.round(r.height)}${n.hasAttribute('data-p5r-media') ? ':m' : ''}`; }),
                     msgAvatars: document.querySelectorAll('#main [data-p5r-msg-avatar]').length,
                     listPhotoFilter: getComputedStyle(document.querySelector('#pane-side [data-p5r-avatar] img')).filter,
                     msgPhotoFilter: getComputedStyle(document.querySelector('#main [data-p5r-msg-avatar] img')).filter,
                     outTailRight: (() => { const b = document.querySelector('#main [data-p5r-bubble="out"]');
                                            return getComputedStyle(b, '::before').right; })(),
                     tailHidden: getComputedStyle(document.querySelector('#main [data-icon^="tail"]')).display === 'none' };
        })())""")))
        self.check("lista de chats: foto, nombre, hora y último mensaje reconocidos",
                   marks["rows"] == 4 and marks["names"] == 4 and marks["times"] == 4
                   and marks["previews"] == 4 and marks["avatars"] == 4, marks)
        self.check("burbujas reconocidas aun sin clases message-in/out (6 recibidas con archivo, 1 enviada)",
                   marks["bubblesIn"] == 6 and marks["bubblesOut"] == 1 and marks["tailHidden"], marks)
        self.check("la imagen y el sticker (sin burbuja) van en marco; fotos de quien escribe reconocidas",
                   marks["media"] == 2 and marks["msgAvatars"] == 5, marks)
        loose = yield ("js", page, "document.getElementById('loose-avatar').hasAttribute('data-p5r-msg-avatar')")
        self.check("foto suelta fuera de la fila del mensaje (como WhatsApp 2026) también en cuadro", loose is True)
        # Qué hay encima de la foto en 3 puntos, contando rayos y recortes (que
        # normalmente no responden a clics: por eso la prueba anterior no los veía).
        hit_js = """(() => {
            const frame = document.getElementById('group-avatar');
            document.documentElement.classList.add('p5r-hit');
            const box = frame.getBoundingClientRect();
            const ok = [[0.5, 0.5], [0.8, 0.8], [0.85, 0.35]].every(([fx, fy]) => {
              const hit = document.elementFromPoint(box.left + box.width * fx, box.top + box.height * fy);
              return !!hit && frame.contains(hit); });
            document.documentElement.classList.remove('p5r-hit');
            return ok; })()"""
        # Sensibilidad: algo puesto encima de la foto a propósito sí se detecta.
        covered = yield ("js", page, """(() => {
            const frame = document.getElementById('group-avatar');
            const box = frame.getBoundingClientRect();
            const cover = document.createElement('div');
            cover.id = 'p5r-test-cover';
            cover.style.cssText = `position:fixed;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;z-index:2147483647`;
            document.body.append(cover);
            return true; })()""")
        covered = yield ("js", page, hit_js)
        yield ("js", page, "document.getElementById('p5r-test-cover').remove(); true")
        self.check("la prueba sí detecta una foto tapada", covered is False, covered)
        on_top = yield ("js", page, hit_js)
        self.check("nada tapa la foto (sin rayo y con la foto arriba)", on_top is True)
        frame = yield ("js", page, "getComputedStyle(document.querySelector('#main [data-p5r-msg-avatar]')).outlineStyle")
        self.check("fotos de quien escribe en cuadro con borde (como la lista)", frame == "solid", frame)
        chip = yield ("js", page, "document.getElementById('sticker-author').hasAttribute('data-p5r-bubble')")
        self.check("en stickers, la etiqueta del nombre no se toma como burbuja", chip is False)
        self.check("fotos a color por defecto (lista y mensajes)",
                   marks["listPhotoFilter"] == "none" and marks["msgPhotoFilter"] == "none", marks)
        self.check("sin rayo: el rectángulo blanco solo asoma 14 px al lado", marks["outTailRight"] == "-14px", marks["outTailRight"])
        tag = json.loads((yield ("js", page, """JSON.stringify((() => {
            const author = document.querySelector('#group-first-bubble [data-testid="author"]');
            const chip = document.getElementById('sticker-author');
            const sticker = chip.querySelector('[data-testid="author"]');
            return { bg: getComputedStyle(author).backgroundColor, color: getComputedStyle(author).color,
                     chipBg: getComputedStyle(chip).backgroundColor, stickerTag: getComputedStyle(sticker).backgroundColor };
        })())""")))
        self.check("nombre de quien escribe en etiqueta blanca con letras negras",
                   tag["bg"] == "rgb(246, 244, 239)" and tag["color"] == "rgb(11, 11, 11)", tag)
        self.check("en stickers, la pastilla del nombre pierde su fondo y queda solo la etiqueta",
                   tag["chipBg"] == "rgba(0, 0, 0, 0)" and tag["stickerTag"] == "rgb(246, 244, 239)", tag)
        banner = yield ("js", page, """(() => { const b = document.querySelector('[data-p5r="banner"]');
                                                 return b.classList.contains('p5r-hidden') ? '' : b.textContent; })()""")
        self.check("modo Persona: banner con la cuenta regresiva", "FALTAN 05 DÍAS" in (banner or ""), banner)
        self.shot(window, "02-modo-persona.png")

        yield ("js", page, "document.querySelector('.p5r-banner-min').click(); true")
        yield ("wait", 400)
        mini = yield ("js", page, """(() => { const b = document.querySelector('[data-p5r="banner"]');
            return JSON.stringify({ min: b.hasAttribute('data-min'), text: b.textContent,
                                    hidden: b.classList.contains('p5r-hidden') }); })()""")
        mini = json.loads(mini)
        self.check("el aviso se minimiza a una etiqueta pequeña", mini["min"] and mini["text"] == "5D" and not mini["hidden"], mini)
        self.shot(window, "02b-aviso-minimizado.png")
        yield ("js", page, "document.querySelector('.p5r-banner-mini').click(); true")
        yield ("wait", 400)
        back = yield ("js", page, "document.querySelector('[data-p5r=\"banner\"]').textContent")
        self.check("y vuelve a mostrarse completo con un clic", "FALTAN 05 DÍAS" in back, back)

        report = yield ("js", page, "window.__zapzapP5R.diagnose()")
        data = json.loads(report)
        leaked = [word for word in ("escondite", "Ann", "Ryuji", "Los Ladrones", "casero") if word in report]
        self.check("diagnóstico de estilo: describe la estructura",
                   data["counts"]["dataIdFalse"] == 3 and len(data["messages"]) >= 2 and data["listRow"], data["counts"])
        self.check("diagnóstico de estilo: sin textos ni nombres", not leaked, leaked)

        # --- Crear y enviar una tarjeta al grupo ---
        yield ("js", page, "window.__zapzapP5R.openEditorForActiveChat()")
        yield ("wait", 500)
        yield ("js", page, f"""
            (() => {{
              const modal = document.querySelector('.p5r-modal');
              const [title, date] = modal.querySelectorAll('input.p5r-input');
              title.value = 'Golpe al Palacio «final»';
              date.value = '{in_days(3)}';
              date.dispatchEvent(new Event('input', {{bubbles: true}}));
              modal.querySelector('textarea').value = 'Nos vemos en el escondite. p5r://falso';
              return true;
            }})()
        """)
        yield ("wait", 300)
        preview = yield ("js", page, "document.querySelector('.p5r-modal .p5r-hint:nth-of-type(2)')?.textContent || ''")
        self.check("vista previa de la cuenta regresiva", "Faltan 3 días" in preview, preview)
        self.shot(window, "03-editor.png")
        yield ("js", page, "[...document.querySelectorAll('.p5r-modal button')].find(b => b.textContent === 'Enviar al grupo').click(); true")
        yield ("wait", 2500)
        sent = json.loads((yield ("js", page, """JSON.stringify({
            box: document.querySelector('#main footer [contenteditable]').innerText,
            last: [...document.querySelectorAll('#fake-messages [data-id^="true_"]')].pop().innerText })""")))
        self.check("«Enviar al grupo» envía el mensaje y deja la caja vacía",
                   sent["box"].strip() == "" and "p5r://aviso/" + in_days(3) in sent["last"], sent["last"][-60:])
        self.check("el texto del usuario no rompe el formato",
                   "«Golpe al Palacio  final »" not in sent["last"] and "p5r://falso" not in sent["last"]
                   and sent["last"].count("p5r://") == 1, sent["last"])
        self.shot(window, "04-enviada.png")
        cards = json.loads((yield js_cards()))
        mine = [c for c in cards if c["origin"] == "me"]
        self.check("la tarjeta propia queda marcada como compartida", len(mine) == 1 and mine[0]["shared"], mine)

        # --- Tarjeta leída del chat abierto (respaldo sin módulos internos) ---
        dom_text = card_message("dom0000001", "Fiesta sorpresa de Morgana", in_days(2))
        yield ("js", page, ADD_INCOMING_JS % {"author": json.dumps("Ryuji"), "text": json.dumps(dom_text)})
        yield ("wait", 2000)
        cards = json.loads((yield js_cards()))
        from_dom = [c for c in cards if c["id"] == "dom0000001"]
        self.check("una tarjeta que aparece en el chat abierto se importa",
                   len(from_dom) == 1 and from_dom[0]["author"] == "Ryuji" and from_dom[0]["chatTitle"] == "Los Ladrones", from_dom)

        # --- Cancelar para todos, caducadas y reaparecidas ---
        cancel = yield ("js", page, "window.__zapzapP5R.debugIngest('❌ Aviso cancelado\\np5r://cancelar/dom0000001', {})")
        revived = yield ("js", page, f"window.__zapzapP5R.debugIngest({json.dumps(dom_text)}, {{msgTime: 9e12}})")
        expired = yield ("js", page, f"window.__zapzapP5R.debugIngest({json.dumps(card_message('old0000001', 'Ya pasó', in_days(-1)))}, {{msgTime: 9e12}})")
        cards = json.loads((yield js_cards()))
        self.check("una cancelación la borra y no revive con el mensaje viejo",
                   cancel is True and revived is False and not any(c["id"] == "dom0000001" for c in cards), cards)
        self.check("una tarjeta con fecha pasada no se guarda", expired is False)

        yield ("wait", 3500)
        saved = controller.state.cards_for(account)
        self.check("Python guarda tarjetas y cancelaciones",
                   len(saved["cards"]) == 2 and "dom0000001" in saved["tombstones"],
                   {"cards": len(saved["cards"]), "tombstones": list(saved["tombstones"])})

        card_id = mine[0]["id"] if mine else ""
        yield ("js", page, f"window.__zapzapP5R.debugRenderCard({json.dumps(card_id)})")
        data_url = None
        for _ in range(20):
            yield ("wait", 500)
            data_url = yield ("js", page, "window.__p5rLastRender || null")
            if data_url:
                break
        if data_url:
            with open(os.path.join(self.out, "05-tarjeta-imagen.png"), "wb") as handle:
                handle.write(base64.b64decode(data_url.split(",", 1)[1]))
        self.check("imagen de la tarjeta generada", bool(data_url))

        yield ("js", page, "document.querySelector('.p5r-list-badge').click(); true")
        yield ("wait", 600)
        viewer = yield ("js", page, "document.querySelector('.p5r-modal')?.innerText || ''")
        # La etiqueta muestra la tarjeta más próxima del chat: la que envié (3 días).
        self.check("clic en la etiqueta de días abre la tarjeta", "TARJETA DE AVISO" in viewer and "03" in viewer, viewer[:80])
        self.shot(window, "06-tarjeta.png")
        yield ("js", page, "document.querySelector('.p5r-close')?.click(); true")

        controller.open_cards_panel()
        yield ("wait", 800)
        items = yield ("js", page, "document.querySelectorAll('.p5r-panel .p5r-item').length")
        self.check("panel de tarjetas lista las 2 tarjetas", items == 2, items)
        stray = yield ("js", page, "/\\bnull\\b|undefined/i.test(document.getElementById('p5r-layer').innerText)")
        self.check("sin textos «null»/«undefined» sobrantes", stray is False)
        self.shot(window, "07-panel.png")
        close_visible = yield ("js", page, """(() => { const b = document.querySelector('.p5r-panel > .p5r-close');
            const r = b.getBoundingClientRect();
            return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === b; })()""")
        self.check("la ✕ del panel se ve (no la tapa el encabezado)", close_visible is True)
        yield ("js", page, "document.getElementById('fake-messages').dispatchEvent(new MouseEvent('mousedown', {bubbles: true})); true")
        yield ("wait", 300)
        closed = yield ("js", page, "!document.querySelector('.p5r-panel')")
        self.check("el panel se cierra solo al hacer clic fuera", closed is True)

        page.triggerAction(page.WebAction.Reload)
        restored = None
        for _ in range(60):
            yield ("wait", 1000)
            restored = yield ("js", page, "window.__zapzapP5R ? JSON.stringify(window.__zapzapP5R.debug()) : null")
            if restored:
                break
        restored = json.loads(restored) if restored else {}
        self.check("tras recargar siguen el tema y las tarjetas", restored.get("theme") is True and restored.get("cards") == 2, restored)

        self.finish()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--zapzap-src", default=DEFAULT_SRC)
    parser.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "p5r-smoke"))
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    zapzap_src = os.path.realpath(args.zapzap_src)
    prepare_environment(tempfile.mkdtemp(prefix="p5r-smoke-"))
    # Como lo pone el lanzador: el comando completo, ya entre comillas.
    os.environ["ZAPZAP_P5R_LAUNCHER"] = '"%s"' % os.path.join(ROOT, "zapzap-p5r")
    sys.path[0:0] = [ROOT, zapzap_src]
    print(f"ZapZap bajo prueba: {zapzap_src}", flush=True)
    sys.argv = [os.path.join(ROOT, "zapzap_p5r.py")]

    from p5r_mod import bootstrap

    bootstrap._configure_logging()
    bootstrap.apply_compat_patches()
    if not bootstrap.install_mod():
        print("No se pudo instalar el mod")
        return 1

    from PyQt6.QtCore import QTimer
    from PyQt6.QtWidgets import QApplication

    exec_with_mod = QApplication.exec

    def exec_with_driver(*_args):
        app = QApplication.instance()
        driver = Driver(app, args.out)
        app._p5r_test_driver = driver
        QTimer.singleShot(1500, driver.start)
        QTimer.singleShot(240000, lambda: (print("Tiempo agotado"), app.exit(2)))
        return exec_with_mod()

    QApplication.exec = staticmethod(exec_with_driver)

    from zapzap.__main__ import main as zapzap_main

    return zapzap_main()


if __name__ == "__main__":
    sys.exit(main())
