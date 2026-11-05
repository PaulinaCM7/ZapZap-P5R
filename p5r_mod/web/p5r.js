/*
 * ZapZap P5R — runtime inyectado en WhatsApp Web.
 *
 * 1. Tema Persona 5: clase `p5r` en <html> + variables de color sobrescritas.
 * 2. Tarjetas de aviso: avisos con fecha por chat/grupo y cuenta regresiva.
 *
 * Python reemplaza el marcador de BOOT por la configuración inicial. Todo lo que se
 * dibuja va en una capa propia (#p5r-layer) fuera del árbol de React de
 * WhatsApp, para no romper su interfaz. El texto del usuario siempre se
 * inserta con textContent, nunca como HTML.
 */
(() => {
  "use strict";

  if (location.hostname !== "web.whatsapp.com") {
    return;
  }

  const BOOT = __P5R_BOOT__;
  const NS = "__zapzapP5R";

  if (window[NS]) {
    window[NS].reconfigure(BOOT);
    return;
  }

  const FONTS_URL =
    "https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Anton" +
    "&family=Bangers&family=Bebas+Neue&family=Permanent+Marker" +
    "&family=Special+Elite&display=swap";
  const STORE_KEY = `zapzap-p5r:cards:${BOOT.accountId}`;
  const DAY_MS = 86400000;
  const REMINDER_DAYS = [7, 3, 1, 0];
  const SIGNATURE = "— Los Ladrones Fantasma";
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Las tarjetas viajan como un mensaje normal de WhatsApp: legible para
  // todos y, para quien tenga el fork, con una última línea que lo identifica:
  //   p5r://aviso/<AAAA-MM-DD>/<id>     crea o actualiza la tarjeta <id>
  //   p5r://cancelar/<id>               la cancela para todos
  const TOKEN_RE = /p5r:\/\/aviso\/(\d{4}-\d{2}-\d{2})\/([a-z0-9]{6,16})/i;
  const CANCEL_RE = /p5r:\/\/cancelar\/([a-z0-9]{6,16})/i;
  const ID_RE = /^[a-z0-9]{6,16}$/;
  const SHARED_MESSAGE_MAX = 400;
  const TOMBSTONE_TTL_MS = 400 * DAY_MS;
  const BUBBLE_IN_RGB = "rgb(20, 20, 21)";
  const BUBBLE_OUT_RGB = "rgb(196, 0, 27)";
  const TIME_RE = /^(\d{1,2}:\d{2}(\s?[ap]\.?\s?m\.?)?|ayer|hoy|yesterday|today|lunes|martes|miércoles|jueves|viernes|sábado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2}\/\d{2,4})$/i;

  // Variables de WhatsApp → paleta P5. Las RGB se usan dentro de rgba().
  const VAR_OVERRIDES = {
    "--WDS-surface-default": "#0d0d0d",
    "--WDS-surface-emphasized": "#1a1a1a",
    "--WDS-surface-elevated-default": "#141414",
    "--WDS-surface-elevated-emphasized": "#202020",
    "--WDS-surface-highlight": "rgba(230, 0, 18, 0.22)",
    "--WDS-surface-pressed": "rgba(230, 0, 18, 0.40)",
    "--WDS-surface-inverse": "#f6f4ef",
    "--WDS-background-wash-plain": "#0d0d0d",
    "--WDS-background-wash-inset": "#121212",
    "--WDS-background-elevated-wash-plain": "#161616",
    "--WDS-background-elevated-wash-inset": "#1b1b1b",
    "--WDS-background-dimmer": "rgba(0, 0, 0, 0.78)",
    "--WDS-content-default": "#f6f4ef",
    "--WDS-content-deemphasized": "#b8b8b8",
    "--WDS-content-disabled": "#6b6b6b",
    "--WDS-content-inverse": "#0b0b0b",
    "--WDS-content-on-accent": "#ffffff",
    "--WDS-content-action-default": "#ff3049",
    "--WDS-content-action-emphasized": "#ff3049",
    "--WDS-content-external-link": "#ff6b7d",
    "--WDS-content-read": "#ffcf3f",
    "--WDS-accent": "#e60012",
    "--WDS-accent-emphasized": "#ff1f3d",
    "--WDS-accent-deemphasized": "rgba(230, 0, 18, 0.28)",
    // Valores "raros" a propósito: así se reconocen las burbujas por su color.
    "--WDS-systems-bubble-surface-incoming": "#141415",
    "--WDS-systems-bubble-surface-outgoing": "#c4001b",
    "--WDS-systems-bubble-surface-system": "#000000",
    "--WDS-systems-bubble-surface-e2e": "#1f1f1f",
    "--WDS-systems-bubble-surface-business": "#1f1f1f",
    "--WDS-systems-bubble-surface-overlay": "rgba(0, 0, 0, 0.35)",
    "--WDS-systems-bubble-content-deemphasized": "rgba(255, 255, 255, 0.72)",
    "--WDS-systems-bubble-content-e2e": "#ffcf3f",
    "--WDS-systems-bubble-content-business": "#f6f4ef",
    "--WDS-systems-chat-background-wallpaper": "transparent",
    "--WDS-systems-chat-foreground-wallpaper": "rgba(230, 0, 18, 0.10)",
    "--WDS-systems-chat-surface-composer": "#1a1a1a",
    "--WDS-systems-chat-surface-tray": "#0d0d0d",
    "--WDS-systems-status-seen": "#e60012",
    "--WDS-green-75": "#ffe3e6",
    "--WDS-green-100": "#ffd6db",
    "--WDS-green-100-RGB": "255, 214, 219",
    "--WDS-green-200": "#ff9aa6",
    "--WDS-green-300": "#ff5c70",
    "--WDS-green-400": "#e60012",
    "--WDS-green-450": "#d40011",
    "--WDS-green-450-RGB": "212, 0, 17",
    "--WDS-green-500": "#c4001a",
    "--WDS-green-500-RGB": "196, 0, 26",
    "--WDS-green-600": "#a30014",
    "--WDS-green-700": "#7a000f",
    "--WDS-green-750": "#5c000b",
    "--WDS-green-750-RGB": "92, 0, 11",
    "--WDS-green-800": "#3d0008",
    "--WDS-emerald-100": "#ffd6db",
    "--WDS-emerald-400": "#ff1f3d",
    "--WDS-teal-200": "#ff9aa6",
    "--WDS-teal-300": "#ff5c70",
    "--WDS-teal-400": "#e60012",
    "--green-deep": "#c4001a",
    "--green-deep-rgb": "196, 0, 26",
    "--green-rgb": "230, 0, 18",
    "--teal-rgb": "196, 0, 26",
    "--app-background": "#000000",
    "--app-background-deeper": "#000000",
    "--app-background-stripe": "#e60012",
    "--panel-background": "#0d0d0d",
    "--panel-background-deep": "#000000",
    "--panel-input-background": "#1a1a1a",
    "--search-input-background": "#1a1a1a",
    "--dropdown-background": "#111111",
    "--popover-background": "#111111",
    "--incoming-background": "#141415",
    "--outgoing-background": "#c4001b",
    "--primary": "#f6f4ef",
    "--secondary": "#b8b8b8",
    "--primary-text": "#f6f4ef",
    "--secondary-text": "#b8b8b8",
    "--message-primary": "#ffffff",
    "--bubble-meta": "rgba(255, 255, 255, 0.72)",
    "--bubble-meta-icon": "rgba(255, 255, 255, 0.8)",
    "--icon": "#f6f4ef",
    "--icon-high-emphasis": "#ffffff",
    "--icon-primary": "#ffffff",
    "--primary-icon": "#ffffff",
    "--secondary-icon": "#c9c9c9",
    "--icon-ack": "#ffcf3f",
    "--link-alt": "#ff6b7d",
    "--blue-link": "#ff6b7d",
    "--accent": "#e60012",
    "--intro-secondary": "#c9c9c9",
    "--modal-backdrop-solid": "rgba(0, 0, 0, 0.85)",
    "--notification-badge": "#e60012",
    "--primary-button-background": "#e60012",
    "--primary-button-text": "#ffffff",
    "--secondary-button-text": "#ff3049",
    "--switch-active-accent": "#e60012",
    "--nav-bar-background": "#000000",
    "--nav-list-selected-accent": "#e60012",
    "--nav-list-selected-accent-text": "#ffffff",
    "--text-input-focus-accent": "#e60012",
    "--border-focused": "#e60012",
    "--progress-bar-foreground": "#e60012",
    "--text-highlight": "rgba(255, 207, 63, 0.45)",
    "--message-selection-highlight": "rgba(230, 0, 18, 0.35)",
    "--chip-background-selected": "#e60012",
    "--input-border-color": "#3a3a3a",
    "--status-ring-unread": "#e60012",
    "--date-picker-accent": "#e60012",
  };

  const RANSOM_FONTS = [
    '"Anton", Impact, sans-serif',
    '"Abril Fatface", Georgia, serif',
    '"Bangers", Impact, sans-serif',
    '"Permanent Marker", "Comic Sans MS", cursive',
    '"Special Elite", "Courier New", monospace',
    '"Bebas Neue", "Arial Narrow", sans-serif',
    'Georgia, "Times New Roman", serif',
  ];
  // [fondo, texto]
  const RANSOM_SKINS = [
    ["#0b0b0b", "#f6f4ef"],
    ["#f6f4ef", "#0b0b0b"],
    ["#e60012", "#ffffff"],
    ["#f6f4ef", "#e60012"],
    ["transparent", "#f6f4ef"],
    ["#0b0b0b", "#ff1f3d"],
  ];
  const RANSOM_SKINS_ON_RED = [
    ["#0b0b0b", "#f6f4ef"],
    ["#f6f4ef", "#0b0b0b"],
    ["#f6f4ef", "#e60012"],
    ["transparent", "#0b0b0b"],
    ["#0b0b0b", "#ffcf3f"],
    ["transparent", "#ffffff"],
  ];

  const state = {
    theme: !!BOOT.theme,
    dirty: false,
    requests: [],
    layer: null,
    modal: null,
    panel: null,
    panelFilter: null,
    chat: null,
    chatSignature: "",
    dayKey: "",
    varSignature: "",
    internalChatModule: undefined,
    lastReminderCheck: 0,
    badgeNodes: new Map(),
    msgWatcher: false,
    lastWatcherTry: 0,
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // ------------------------------------------------------------ utilidades
  const pad2 = (n) => String(n).padStart(2, "0");

  function todayKey(date = new Date()) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function parseKey(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || "");
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  }

  function daysUntil(key) {
    const parts = parseKey(key);
    if (!parts) {
      return null;
    }
    const now = new Date();
    const target = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - today) / DAY_MS);
  }

  function countdown(key) {
    const days = daysUntil(key);
    if (days === null) {
      return { state: "future", days: 0, big: "??", label: "", short: "?", text: "" };
    }
    if (days > 1) {
      return { state: "future", days, big: pad2(days), label: "DÍAS", short: `${days}D`, text: `Faltan ${days} días` };
    }
    if (days === 1) {
      return { state: "future", days, big: "01", label: "DÍA", short: "1D", text: "¡Es mañana!" };
    }
    if (days === 0) {
      return { state: "today", days, big: "HOY", label: "ES EL DÍA", short: "HOY", text: "¡Hoy es el día!" };
    }
    const ago = -days;
    return {
      state: "past",
      days,
      big: pad2(ago),
      label: ago === 1 ? "DÍA ATRÁS" : "DÍAS ATRÁS",
      short: `-${ago}D`,
      text: ago === 1 ? "Fue ayer" : `Fue hace ${ago} días`,
    };
  }

  function formatDate(key) {
    const parts = parseKey(key);
    if (!parts) {
      return key || "";
    }
    try {
      return new Intl.DateTimeFormat("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(parts[0], parts[1] - 1, parts[2]));
    } catch (_error) {
      return key;
    }
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) {
        continue;
      }
      if (name === "class") {
        node.className = value;
      } else if (name === "text") {
        node.textContent = value;
      } else if (name.startsWith("on") && typeof value === "function") {
        node.addEventListener(name.slice(2), value);
      } else if (name === "dataset") {
        Object.assign(node.dataset, value);
      } else {
        node.setAttribute(name, value === true ? "" : String(value));
      }
    }
    for (const child of children.flat()) {
      if (child !== null && child !== undefined && child !== false) {
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
      }
    }
    return node;
  }

  function cardIcon() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const body = document.createElementNS(SVG_NS, "path");
    body.setAttribute("d", "M3 6.5 19.5 3l1.5 13.5L4.5 20z");
    body.setAttribute("fill", "currentColor");
    const star = document.createElementNS(SVG_NS, "path");
    star.setAttribute(
      "d",
      "m12.2 7.2 1.1 2.6 2.8.1-2.2 1.8.8 2.7-2.4-1.6-2.3 1.7.7-2.7-2.2-1.7 2.8-.2z"
    );
    star.setAttribute("fill", "#e60012");
    svg.append(body, star);
    return svg;
  }

  function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let value = seed || 1;
    return () => {
      value = (value + 0x6d2b79f5) | 0;
      let t = Math.imul(value ^ (value >>> 15), 1 | value);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Estilo de cada letra recortada: estable para el mismo texto.
  function ransomGlyphs(text, onRed = false) {
    const random = seededRandom(hashString(text));
    const skins = onRed ? RANSOM_SKINS_ON_RED : RANSOM_SKINS;
    return Array.from(text).map((char) => {
      if (/\s/.test(char)) {
        return { char, space: true };
      }
      const skin = skins[Math.floor(random() * skins.length)];
      return {
        char: random() < 0.55 ? char.toLocaleUpperCase("es-MX") : char,
        font: RANSOM_FONTS[Math.floor(random() * RANSOM_FONTS.length)],
        bg: skin[0],
        fg: skin[1],
        rotate: (random() - 0.5) * 16,
        scale: 0.86 + random() * 0.34,
        lift: (random() - 0.5) * 0.18,
      };
    });
  }

  function ransom(text, { onRed = false } = {}) {
    const wrap = el("span", { class: "p5r-ransom", "aria-label": text, role: "text" });
    for (const glyph of ransomGlyphs(text, onRed)) {
      if (glyph.space) {
        wrap.append(el("span", { style: "width:.32em", "aria-hidden": "true" }, " "));
        continue;
      }
      const letter = el("span", { "aria-hidden": "true", text: glyph.char });
      letter.style.fontFamily = glyph.font;
      letter.style.background = glyph.bg;
      letter.style.color = glyph.fg;
      letter.style.transform =
        `translateY(${glyph.lift}em) rotate(${glyph.rotate.toFixed(1)}deg) scale(${glyph.scale.toFixed(2)})`;
      wrap.append(letter);
    }
    return wrap;
  }

  // ----------------------------------------------------------------- estilos
  function ensureStyles() {
    const head = document.head || document.documentElement;
    if (!document.getElementById("p5r-style")) {
      head.append(el("style", { id: "p5r-style" }, BOOT.css || ""));
    }
    if (!document.getElementById("p5r-vars")) {
      head.append(el("style", { id: "p5r-vars" }));
    }
    if (!document.getElementById("p5r-fonts")) {
      head.append(el("link", { id: "p5r-fonts", rel: "stylesheet", href: FONTS_URL }));
    }
  }

  // Busca en qué selectores define WhatsApp las variables que cambiamos: sus
  // temas usan clases generadas que cambian con cada versión.
  function themeSelectors() {
    const wanted = new Set(Object.keys(VAR_OVERRIDES));
    const selectors = new Set();
    let ruleCount = 0;
    const walk = (rules) => {
      for (const rule of rules) {
        ruleCount += 1;
        if (!rule.style) {
          if (rule.cssRules) {
            walk(rule.cssRules);
          }
          continue;
        }
        if (!rule.selectorText) {
          continue;
        }
        for (let i = 0; i < rule.style.length; i += 1) {
          if (wanted.has(rule.style[i])) {
            for (const part of rule.selectorText.split(",")) {
              const selector = part.trim();
              if (selector && !/:root\b|^html\b|^body\b/.test(selector) && !selector.includes("::")) {
                selectors.add(selector);
              }
            }
            break;
          }
        }
      }
    };
    for (const sheet of document.styleSheets) {
      const owner = sheet.ownerNode;
      if (owner && owner.id && owner.id.startsWith("p5r-")) {
        continue;
      }
      try {
        walk(sheet.cssRules);
      } catch (_error) {
        // Hoja de otro origen sin CORS: no podemos leerla.
      }
    }
    return { selectors: [...selectors].sort(), ruleCount };
  }

  function refreshVarOverrides(force = false) {
    const node = document.getElementById("p5r-vars");
    if (!node) {
      return;
    }
    let sheetSignature = String(document.styleSheets.length);
    for (const sheet of document.styleSheets) {
      try {
        sheetSignature += `:${sheet.cssRules.length}`;
      } catch (_error) {
        sheetSignature += ":x";
      }
    }
    if (!force && sheetSignature === state.varSignature) {
      return;
    }
    state.varSignature = sheetSignature;
    const { selectors } = themeSelectors();
    const declarations = Object.entries(VAR_OVERRIDES)
      .map(([name, value]) => `${name}: ${value} !important;`)
      .join("\n  ");
    // :is() perdona selectores inválidos, así uno raro no anula toda la regla.
    const targets = [":root.p5r", "html.p5r body", "html.p5r #app"];
    if (selectors.length) {
      targets.push(`html.p5r :is(${selectors.join(", ")})`);
    }
    node.textContent = `${targets.join(",\n")} {\n  ${declarations}\n}`;
  }

  function applyTheme() {
    document.documentElement.classList.toggle("p5r", state.theme);
    if (state.panel) {
      const toggle = state.panel.querySelector("[data-p5r-theme-switch]");
      if (toggle) {
        toggle.checked = state.theme;
      }
    }
  }

  // ------------------------------------------------------------- tarjetas
  function sanitizeCards(cards) {
    if (!Array.isArray(cards)) {
      return [];
    }
    return cards
      .filter((card) => card && typeof card === "object" && card.id && parseKey(card.target))
      .map((card) => ({
        // Las tarjetas de la versión anterior tenían IDs largos: se acortan
        // para que quepan en el mensaje compartido.
        id: ID_RE.test(String(card.id)) ? String(card.id) : newId(),
        chatKey: String(card.chatKey || "").slice(0, 256),
        chatTitle: String(card.chatTitle || "").slice(0, 256),
        isGroup: typeof card.isGroup === "boolean" ? card.isGroup : null,
        title: String(card.title || "").slice(0, 140),
        message: String(card.message || "").slice(0, 1000),
        target: card.target,
        reminders: card.reminders !== false,
        lastNotified: String(card.lastNotified || "").slice(0, 10),
        author: String(card.author || "").slice(0, 80),
        origin: card.origin === "them" ? "them" : "me",
        shared: Boolean(card.shared),
        msgTime: Number(card.msgTime) || 0,
        createdAt: Number(card.createdAt) || 0,
        updatedAt: Number(card.updatedAt) || 0,
      }));
  }

  function sanitizeTombstones(tombstones) {
    const clean = {};
    if (tombstones && typeof tombstones === "object") {
      for (const [id, expiry] of Object.entries(tombstones).slice(0, 500)) {
        if (ID_RE.test(id) && Number(expiry) > Date.now()) {
          clean[id] = Number(expiry);
        }
      }
    }
    return clean;
  }

  const store = {
    rev: 0,
    cards: [],
    // IDs cancelados o borrados: evitan que un mensaje viejo los reviva.
    tombstones: {},

    load(boot) {
      let local = null;
      try {
        local = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      } catch (_error) {
        local = null;
      }
      const fromBoot = {
        rev: Number(boot.cardsRev) || 0,
        cards: boot.cards || [],
        tombstones: boot.tombstones || {},
      };
      const localIsNewer = local && Number(local.rev) > fromBoot.rev;
      const chosen = localIsNewer ? local : fromBoot;
      this.rev = Number(chosen.rev) || 0;
      this.cards = sanitizeCards(chosen.cards);
      this.tombstones = sanitizeTombstones(chosen.tombstones);
      if (localIsNewer) {
        state.dirty = true;
      }
      this.saveLocal();
    },

    adopt(boot) {
      if ((Number(boot.cardsRev) || 0) > this.rev) {
        this.rev = Number(boot.cardsRev);
        this.cards = sanitizeCards(boot.cards);
        this.tombstones = sanitizeTombstones(boot.tombstones);
        this.saveLocal();
        renderAll(true);
      }
    },

    saveLocal() {
      try {
        localStorage.setItem(
          STORE_KEY,
          JSON.stringify({ rev: this.rev, cards: this.cards, tombstones: this.tombstones })
        );
      } catch (_error) {
        // Sin localStorage seguimos con la copia que guarda ZapZap P5R.
      }
    },

    // Pasada la fecha, la tarjeta se borra sola (en cada copia del fork).
    purgeExpired() {
      const before = this.cards.length;
      this.cards = this.cards.filter((card) => daysUntil(card.target) >= 0);
      const tombstones = sanitizeTombstones(this.tombstones);
      const tombstonesChanged = Object.keys(tombstones).length !== Object.keys(this.tombstones).length;
      this.tombstones = tombstones;
      if (this.cards.length !== before || tombstonesChanged) {
        this.commit();
      }
    },

    bury(id) {
      this.tombstones[id] = Date.now() + TOMBSTONE_TTL_MS;
      this.cards = this.cards.filter((card) => card.id !== id);
    },

    commit() {
      this.rev = Math.max(Date.now(), this.rev + 1);
      this.saveLocal();
      state.dirty = true;
      renderAll(true);
    },

    upsert(card) {
      const now = Date.now();
      const index = this.cards.findIndex((item) => item.id === card.id);
      if (index >= 0) {
        this.cards[index] = { ...this.cards[index], ...card, updatedAt: now };
      } else {
        this.cards.push({ ...card, createdAt: now, updatedAt: now });
      }
      this.commit();
    },

    remove(id) {
      this.bury(id);
      this.commit();
    },

    get(id) {
      return this.cards.find((card) => card.id === id) || null;
    },

    forChat(chat) {
      if (!chat) {
        return [];
      }
      return sortCards(
        this.cards.filter(
          (card) => card.chatKey === chat.key || (chat.title && card.chatTitle === chat.title)
        )
      );
    },
  };

  function sortCards(cards) {
    return [...cards].sort((a, b) => {
      const da = daysUntil(a.target);
      const db = daysUntil(b.target);
      const pa = da < 0 ? 1 : 0;
      const pb = db < 0 ? 1 : 0;
      if (pa !== pb) {
        return pa - pb;
      }
      return pa ? db - da : da - db;
    });
  }

  // ID corto (10 caracteres a-z0-9) para que quepa en el mensaje compartido.
  function newId() {
    const bytes = new Uint8Array(10);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => (byte % 36).toString(36)).join("");
  }

  // ------------------------------------------------------ chat abierto
  function domChatTitle() {
    const header = document.querySelector("#main header");
    if (!header) {
      return "";
    }
    const span = header.querySelector('span[dir="auto"][title]') || header.querySelector('span[dir="auto"]');
    return ((span && (span.getAttribute("title") || span.textContent)) || "").trim();
  }

  // Los módulos internos dan el ID real del grupo (sobrevive a renombres).
  // Si WhatsApp los cambia, caemos al título visible del encabezado.
  function internalActiveChat() {
    if (state.internalChatModule === null || typeof window.require !== "function") {
      return null;
    }
    const names = state.internalChatModule ? [state.internalChatModule] : ["WAWebChatCollection", "WAWebCollections"];
    for (const name of names) {
      let collection = null;
      try {
        const mod = window.require(name);
        collection = mod && (mod.ChatCollection || mod.Chat);
      } catch (_error) {
        collection = null;
      }
      if (!collection) {
        continue;
      }
      state.internalChatModule = name;
      let chat = null;
      try {
        if (typeof collection.getActive === "function") {
          chat = collection.getActive();
        }
        if (!chat) {
          const models = typeof collection.getModelsArray === "function"
            ? collection.getModelsArray()
            : collection.models || collection._models || [];
          chat = models.find((item) => item && item.active) || null;
        }
      } catch (_error) {
        chat = null;
      }
      if (chat && chat.id) {
        const key = chat.id._serialized || String(chat.id);
        const contact = chat.contact || {};
        return {
          key,
          title: chat.formattedTitle || chat.name || contact.name || contact.pushname || "",
          isGroup: Boolean(chat.isGroup || chat.id.server === "g.us" || /@g\.us$/.test(key)),
        };
      }
      return null;
    }
    state.internalChatModule = null;
    return null;
  }

  function activeChat() {
    if (!document.querySelector("#main header")) {
      return null;
    }
    const title = domChatTitle();
    const internal = internalActiveChat();
    if (internal) {
      return { ...internal, title: internal.title || title };
    }
    return title ? { key: `title:${title}`, title, isGroup: null } : null;
  }

  // ------------------------------------------------------------- capa
  function ensureLayer() {
    if (state.layer && state.layer.isConnected) {
      return state.layer;
    }
    const layer = el("div", { id: "p5r-layer", class: "p5r-layer" });
    layer.append(
      el("button", {
        class: "p5r-chat-btn p5r-hidden",
        type: "button",
        "data-p5r": "chat-btn",
        title: "Tarjetas de aviso de este chat",
        "aria-label": "Tarjetas de aviso de este chat",
        onclick: () => onChatButton(),
      }, cardIcon()),
      el("div", { class: "p5r-banner p5r-hidden", "data-p5r": "banner" })
    );
    // Lo que se teclea o pega en nuestros formularios no debe llegar a los
    // atajos de WhatsApp (se corta al subir, así nuestros campos sí lo reciben).
    for (const type of ["keydown", "keyup", "keypress", "paste", "copy", "cut", "input"]) {
      layer.addEventListener(type, (event) => event.stopPropagation());
    }
    document.body.append(layer);
    state.layer = layer;
    return layer;
  }

  function layerPart(name) {
    return ensureLayer().querySelector(`[data-p5r="${name}"]`);
  }

  // Comprueba que el punto no esté tapado por un visor o menú de WhatsApp.
  function pointInside(x, y, container) {
    const hit = document.elementsFromPoint(x, y).find((node) => !node.closest("#p5r-layer"));
    return Boolean(hit && container.contains(hit));
  }

  function hide(node) {
    if (node) {
      node.classList.add("p5r-hidden");
    }
  }

  function show(node) {
    if (node) {
      node.classList.remove("p5r-hidden");
    }
  }

  function placeChatButton(chat) {
    const button = layerPart("chat-btn");
    const header = document.querySelector("#main header");
    if (!chat || !header) {
      hide(button);
      return;
    }
    const box = header.getBoundingClientRect();
    if (!box.width || !box.height) {
      hide(button);
      return;
    }
    let actionsLeft = box.right - 16;
    for (const action of header.querySelectorAll('button, [role="button"]')) {
      const rect = action.getBoundingClientRect();
      if (rect.width && rect.left > box.left + box.width * 0.45) {
        actionsLeft = Math.min(actionsLeft, rect.left);
      }
    }
    const left = actionsLeft - 34 - 16;
    const top = box.top + (box.height - 34) / 2;
    if (!pointInside(left + 17, top + 17, header)) {
      hide(button);
      return;
    }
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
    const count = store.forChat(chat).filter((card) => daysUntil(card.target) >= 0).length;
    if (count) {
      button.dataset.count = String(count);
    } else {
      delete button.dataset.count;
    }
    show(button);
  }

  function bannerCard(chat) {
    return store.forChat(chat).find((card) => daysUntil(card.target) >= -3) || null;
  }

  // Avisos minimizados, por chat y tarjeta: una tarjeta nueva se vuelve a
  // mostrar completa. Es una preferencia de esta computadora.
  const BANNER_MIN_KEY = "zapzap-p5r:banner-min";
  let minimizedBanners = [];
  try {
    minimizedBanners = JSON.parse(localStorage.getItem(BANNER_MIN_KEY) || "[]");
  } catch (_error) {
    minimizedBanners = [];
  }

  function bannerKey(chat, card) {
    return `${chat.key}|${card.id}`;
  }

  function setBannerMinimized(chat, card, minimized) {
    if (!chat || !card) {
      return;
    }
    const key = bannerKey(chat, card);
    minimizedBanners = minimizedBanners.filter((item) => item !== key);
    if (minimized) {
      minimizedBanners = [...minimizedBanners, key].slice(-200);
    }
    try {
      localStorage.setItem(BANNER_MIN_KEY, JSON.stringify(minimizedBanners));
    } catch (_error) {
      // Sin localStorage solo dura esta sesión.
    }
    renderBanner(chat);
    placeBanner(chat);
  }

  function renderBanner(chat) {
    const banner = layerPart("banner");
    const card = bannerCard(chat);
    if (!card) {
      banner.dataset.cardId = "";
      return;
    }
    const info = countdown(card.target);
    const minimized = minimizedBanners.includes(bannerKey(chat, card));
    banner.dataset.cardId = card.id;
    banner.dataset.state = info.state;
    banner.toggleAttribute("data-min", minimized);
    if (minimized) {
      banner.replaceChildren(el("button", {
        class: "p5r-banner-mini",
        type: "button",
        title: `${card.title} — ${info.text}. Clic para mostrar el aviso`,
        onclick: () => setBannerMinimized(chat, card, false),
      }, cardIcon(), info.state === "today" ? "HOY" : `${info.days}D`));
      return;
    }
    const extra = store.forChat(chat).filter((item) => item.id !== card.id && daysUntil(item.target) >= 0).length;
    const parts = [
      el("span", { class: "p5r-banner-tag" }, cardIcon(), "AVISO"),
      el("span", { class: "p5r-banner-title", text: card.title || "Sin título" }),
      el("span", { class: "p5r-banner-count", text: info.state === "future" ? `FALTAN ${info.big} ${info.label}` : info.text.toUpperCase() }),
    ];
    if (extra) {
      parts.push(el("span", { class: "p5r-banner-more", text: `+${extra}` }));
    }
    banner.replaceChildren(
      el("button", {
        class: "p5r-banner-main",
        type: "button",
        title: `${card.title} — ${formatDate(card.target)} (${info.text})`,
        onclick: () => onBanner(),
      }, ...parts),
      el("button", {
        class: "p5r-banner-min",
        type: "button",
        title: "Minimizar el aviso",
        "aria-label": "Minimizar el aviso",
        onclick: () => setBannerMinimized(chat, card, true),
      }, "–")
    );
  }

  function placeBanner(chat) {
    const banner = layerPart("banner");
    const main = document.getElementById("main");
    const header = document.querySelector("#main header");
    if (!chat || !main || !header || !banner.dataset.cardId) {
      hide(banner);
      return;
    }
    const mainBox = main.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();
    const minimized = banner.hasAttribute("data-min");
    // Completo: centrado bajo el encabezado. Minimizado: esquina derecha.
    const x = minimized ? mainBox.right - 18 : mainBox.left + mainBox.width / 2;
    const top = headerBox.bottom + 12;
    if (!mainBox.width || !pointInside(minimized ? x - 24 : x, top + 14, main)) {
      hide(banner);
      return;
    }
    banner.style.left = `${x}px`;
    banner.style.top = `${top}px`;
    show(banner);
  }

  // Insignias en la lista de chats (también fuera del árbol de React).
  function placeListBadges() {
    const pane = document.getElementById("pane-side");
    const layer = ensureLayer();
    const wanted = new Map();
    if (pane) {
      const paneBox = pane.getBoundingClientRect();
      const byTitle = new Map();
      for (const card of sortCards(store.cards)) {
        if (card.chatTitle && daysUntil(card.target) >= 0 && !byTitle.has(card.chatTitle)) {
          byTitle.set(card.chatTitle, card);
        }
      }
      if (byTitle.size) {
        for (const span of pane.querySelectorAll("span[title]")) {
          const card = byTitle.get(span.getAttribute("title"));
          if (!card || wanted.has(card.chatTitle)) {
            continue;
          }
          const row = span.closest('[role="listitem"], [role="row"]');
          const avatar = row && row.querySelector("[data-p5r-avatar]");
          const box = (avatar || row || span).getBoundingClientRect();
          if (!box.height || box.top < paneBox.top || box.bottom > paneBox.bottom + 2) {
            continue;
          }
          // Como una etiqueta pegada a la esquina de la foto.
          const x = avatar ? box.right - 18 : box.left + 40;
          const y = avatar ? box.bottom - 14 : box.bottom - 24;
          if (!pointInside(x + 8, y + 6, pane)) {
            continue;
          }
          wanted.set(card.chatTitle, { card, x, y });
        }
      }
    }
    for (const [title, node] of state.badgeNodes) {
      if (!wanted.has(title)) {
        node.remove();
        state.badgeNodes.delete(title);
      }
    }
    for (const [title, { card, x, y }] of wanted) {
      let node = state.badgeNodes.get(title);
      if (!node) {
        node = el("button", {
          class: "p5r-list-badge",
          type: "button",
          onclick: (event) => {
            event.stopPropagation();
            openViewer(store.get(event.currentTarget.dataset.cardId));
          },
        });
        layer.append(node);
        state.badgeNodes.set(title, node);
      }
      const info = countdown(card.target);
      node.textContent = info.state === "today" ? "HOY" : `${info.days}d`;
      node.dataset.state = info.state;
      node.dataset.cardId = card.id;
      node.title = `${card.title} — ${info.text} (${formatDate(card.target)})`;
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
    }
  }

  // Marca las partes de cada fila de la lista de chats (foto, nombre, hora,
  // último mensaje) por su geometría, no por las clases de WhatsApp, que
  // cambian con cada versión. Los atributos data-p5r-* no los toca React.
  function markChatList() {
    const pane = document.getElementById("pane-side");
    if (!pane) {
      return;
    }
    const rows = new Set();
    for (const span of pane.querySelectorAll("span[title]")) {
      const row = span.closest('[role="listitem"], [role="row"]');
      if (row && pane.contains(row)) {
        rows.add(row);
      }
    }
    for (const row of rows) {
      if (row.querySelector("[data-p5r-name]") && row.querySelector("[data-p5r-avatar]")
          && row.querySelector("[data-p5r-preview]")) {
        continue;
      }
      if (!row.getBoundingClientRect().height) {
        continue;
      }
      for (const old of row.querySelectorAll("[data-p5r-name], [data-p5r-time], [data-p5r-preview], [data-p5r-avatar]")) {
        for (const name of ["data-p5r-name", "data-p5r-time", "data-p5r-preview", "data-p5r-avatar"]) {
          old.removeAttribute(name);
        }
      }
      row.setAttribute("data-p5r-row", "");
      if (getComputedStyle(row).position === "static") {
        row.setAttribute("data-p5r-static", "");
      }
      const titled = [...row.querySelectorAll("span[title]")];
      const name = titled[0];
      const nameBox = name.getBoundingClientRect();
      name.setAttribute("data-p5r-name", "");
      const preview = titled.slice(1).find((span) => span.getBoundingClientRect().top >= nameBox.bottom - 3);
      if (preview) {
        preview.setAttribute("data-p5r-preview", "");
      }
      let time = null;
      let avatar = null;
      let avatarSize = 0;
      for (const node of row.querySelectorAll("div, span")) {
        if (node === name || node.contains(name) || name.contains(node)) {
          continue;
        }
        const box = node.getBoundingClientRect();
        if (!node.children.length) {
          const text = node.textContent.trim();
          if (text && text.length <= 12 && TIME_RE.test(text)
              && Math.abs(box.top - nameBox.top) < 12 && box.left >= nameBox.left) {
            time = node;
          }
        }
        if (box.width >= 30 && box.width <= 70 && Math.abs(box.width - box.height) <= 3
            && box.right <= nameBox.left + 2 && box.width > avatarSize) {
          avatar = node;
          avatarSize = box.width;
        }
      }
      if (time) {
        time.setAttribute("data-p5r-time", "");
      }
      if (avatar) {
        avatar.setAttribute("data-p5r-avatar", "");
      }
    }
  }

  // Filas de mensaje del chat abierto. WhatsApp cambia sus clases seguido, así
  // que se combinan varias pistas: las clases clásicas, el atributo data-id
  // ("true_…" = enviado por mí, "false_…" = recibido) y el contenedor del texto.
  function messageRows(main) {
    const rows = new Set(main.querySelectorAll(".message-in, .message-out"));
    for (const node of main.querySelectorAll('[data-id^="true_"], [data-id^="false_"], [data-testid^="conv-msg-"]')) {
      rows.add(node);
    }
    // Stickers, fotos sin texto y archivos no tienen texto: se encuentran por
    // su contenedor de mensaje (data-testid="msg-container" en WhatsApp 2026).
    for (const box of main.querySelectorAll('[data-testid="msg-container"]')) {
      const row = box.closest('[data-testid^="conv-msg-"], [data-id], [role="row"]');
      if (row && main.contains(row)) {
        rows.add(row);
      }
    }
    for (const text of main.querySelectorAll("[data-pre-plain-text]")) {
      const row = text.closest('[data-id], .message-in, .message-out, [role="row"]');
      if (row && main.contains(row)) {
        rows.add(row);
      }
    }
    // Si dos candidatas son del mismo mensaje (p. ej. data-id y message-in
    // anidados), queda solo la externa: si no, el espaciado se aplicaría doble.
    return new Set([...rows].filter((row) => {
      for (let up = row.parentElement; up && up !== main; up = up.parentElement) {
        if (rows.has(up)) {
          return false;
        }
      }
      return true;
    }));
  }

  function messageDirection(row, bubble) {
    const holder = row.closest("[data-id]") || row.querySelector("[data-id]");
    const id = holder ? holder.getAttribute("data-id") || "" : "";
    if (id.startsWith("true_")) {
      return "out";
    }
    if (id.startsWith("false_")) {
      return "in";
    }
    if (row.matches(".message-out") || row.querySelector('.message-out, [data-testid="tail-out"], [data-icon="tail-out"]')) {
      return "out";
    }
    if (row.querySelector('[data-testid="tail-in"], [data-icon="tail-in"]')) {
      return "in";
    }
    if (row.matches(".message-in") || row.querySelector(".message-in")) {
      return "in";
    }
    const main = document.getElementById("main").getBoundingClientRect();
    const box = (bubble || row.querySelector('[data-testid="msg-container"]') || row).getBoundingClientRect();
    return box.left + box.width / 2 > main.left + main.width / 2 ? "out" : "in";
  }

  function painted(node) {
    const color = getComputedStyle(node).backgroundColor;
    return Boolean(color) && color !== "transparent" && !/,\s*0\)$/.test(color);
  }

  // La burbuja: el elemento con el color de burbuja del tema o, si no, el
  // primer contenedor con fondo alrededor del texto.
  function findBubble(row) {
    for (const node of row.querySelectorAll("div")) {
      const color = getComputedStyle(node).backgroundColor;
      if (color === BUBBLE_IN_RGB || color === BUBBLE_OUT_RGB) {
        return node;
      }
    }
    let node = row.querySelector("[data-pre-plain-text], .copyable-text, .selectable-text");
    while (node && row.contains(node)) {
      if (painted(node) && node.getBoundingClientRect().width > 30) {
        return node;
      }
      node = node.parentElement;
    }
    // Archivos y otros mensajes con contenedor pintado (los stickers no lo
    // tienen: esos se enmarcan por su imagen).
    const container = row.querySelector('[data-testid="msg-container"]');
    if (container) {
      for (const inner of [container, ...container.querySelectorAll(":scope > div, :scope > div > div")]) {
        if (painted(inner) && inner.getBoundingClientRect().width > 30) {
          return inner;
        }
      }
    }
    return null;
  }

  // Imagen o video dentro de la burbuja (los emojis miden menos de 40 px).
  function markMedia(bubble) {
    for (const media of bubble.querySelectorAll("img, video, canvas")) {
      const box = media.getBoundingClientRect();
      if (box.width >= 100 && box.height >= 60) {
        bubble.setAttribute("data-p5r-media", "");
        return;
      }
    }
  }

  // Imagen grande del mensaje (stickers, fotos); las fotos de perfil miden < 50 px.
  function bigMedia(row) {
    for (const media of row.querySelectorAll("img, video, canvas")) {
      const box = media.getBoundingClientRect();
      if (box.width >= 90 && box.height >= 60) {
        return media;
      }
    }
    return null;
  }

  // Los stickers no tienen burbuja: se enmarca el contenedor de la imagen.
  function mediaFrame(media, row) {
    const box = media.getBoundingClientRect();
    let frame = media;
    while (frame.parentElement && row.contains(frame.parentElement) && frame.parentElement !== row) {
      const parent = frame.parentElement.getBoundingClientRect();
      if (Math.abs(parent.width - box.width) > 8 || Math.abs(parent.height - box.height) > 8) {
        break;
      }
      frame = frame.parentElement;
    }
    return frame === media && media.tagName === "IMG" ? media.parentElement : frame;
  }

  // Foto de quien escribe (grupos): cuadrada de 20 a 48 px, a la izquierda de
  // la burbuja. Carga tarde, por eso se reintenta en cada vuelta.
  function markSenderAvatar(row, bubble, direction) {
    if (direction !== "in" || row.querySelector("[data-p5r-msg-avatar]")) {
      return;
    }
    const bubbleBox = bubble.getBoundingClientRect();
    for (const pic of row.querySelectorAll("img, svg")) {
      const box = pic.getBoundingClientRect();
      if (box.width >= 20 && box.width <= 48 && Math.abs(box.width - box.height) <= 3
          && box.right <= bubbleBox.left + 2 && !bubble.contains(pic)) {
        let frame = pic;
        while (frame.parentElement && row.contains(frame.parentElement)
               && Math.abs(frame.parentElement.getBoundingClientRect().width - box.width) <= 2
               && Math.abs(frame.parentElement.getBoundingClientRect().height - box.height) <= 2) {
          frame = frame.parentElement;
        }
        frame.setAttribute("data-p5r-msg-avatar", "");
        return;
      }
    }
  }

  // En WhatsApp 2026 la foto de quien escribe no siempre está dentro de la fila
  // del mensaje. Se busca en todo el chat: imagen cuadrada de 24 a 48 px que no
  // esté dentro de una burbuja, del texto (emojis), de las reacciones ni del
  // encabezado.
  function markLooseAvatars(main) {
    for (const pic of main.querySelectorAll("img")) {
      if (pic.closest('[data-p5r-msg-avatar], header, [data-testid="msg-container"], .selectable-text, '
                      + '[data-testid="addon-bubble-container"], [data-testid="quoted-message"], #p5r-layer')) {
        continue;
      }
      const box = pic.getBoundingClientRect();
      if (box.width < 24 || box.width > 48 || Math.abs(box.width - box.height) > 3) {
        continue;
      }
      let frame = pic;
      while (frame.parentElement && main.contains(frame.parentElement)
             && Math.abs(frame.parentElement.getBoundingClientRect().width - box.width) <= 2
             && Math.abs(frame.parentElement.getBoundingClientRect().height - box.height) <= 2) {
        frame = frame.parentElement;
      }
      frame.setAttribute("data-p5r-msg-avatar", "");
    }
  }

  // Las fotos de quien escribe nunca deben quedar tapadas: se sube su capa
  // (z-index) hasta el contenedor que comparten con los mensajes, a cualquier
  // profundidad (el HTML de WhatsApp cambia).
  function raiseAvatars(main) {
    for (const frame of main.querySelectorAll("[data-p5r-msg-avatar]")) {
      for (let node = frame; node && node !== main; node = node.parentElement) {
        if (node.querySelector('[data-testid="msg-container"], [data-p5r-bubble], [role="row"]')) {
          break;
        }
        if (getComputedStyle(node).position !== "static"
            && node.style.getPropertyValue("z-index") !== "1000") {
          node.style.setProperty("z-index", "1000", "important");
        }
      }
    }
  }

  function markBubbles() {
    const main = document.getElementById("main");
    if (!state.theme || !main) {
      return;
    }
    for (const row of main.querySelectorAll('[data-p5r-msg="in"]')) {
      const bubble = row.querySelector("[data-p5r-bubble]");
      if (bubble) {
        markSenderAvatar(row, bubble, "in");
      }
    }
    markLooseAvatars(main);
    // Las imágenes cargan después del mensaje: se revisan en cada vuelta.
    for (const bubble of main.querySelectorAll("[data-p5r-bubble]:not([data-p5r-media])")) {
      markMedia(bubble);
    }
    for (const row of messageRows(main)) {
      const marked = row.matches("[data-p5r-bubble]") ? row : row.querySelector("[data-p5r-bubble]");
      if (row.getAttribute("data-p5r-b") === "1" && !marked) {
        // WhatsApp volvió a dibujar el mensaje (reacción, estado…): buscarlo de nuevo.
        row.removeAttribute("data-p5r-b");
      }
      if (row.hasAttribute("data-p5r-b")) {
        continue;
      }
      // Ya marcada (p. ej. al volver a encender el tema): su fondo ya es
      // transparente por el tema y no se reconocería otra vez.
      let bubble = marked || findBubble(row);
      // Sticker: la imagen grande queda fuera de lo que parecía burbuja (que
      // es solo la etiqueta del nombre): se enmarca la imagen.
      const media = bigMedia(row);
      if (media && (!bubble || !bubble.contains(media))) {
        if (marked) {
          marked.removeAttribute("data-p5r-bubble");
          marked.removeAttribute("data-p5r-media");
        }
        bubble = mediaFrame(media, row);
      }
      if (!bubble) {
        // Puede que el contenido (p. ej. un sticker) aún no se haya dibujado.
        const tries = Number(row.getAttribute("data-p5r-try") || 0) + 1;
        row.setAttribute("data-p5r-try", String(tries));
        if (tries >= 20) {
          row.setAttribute("data-p5r-b", "0");
        }
        continue;
      }
      const direction = messageDirection(row, bubble);
      row.setAttribute("data-p5r-b", "1");
      row.setAttribute("data-p5r-msg", direction);
      bubble.setAttribute("data-p5r-bubble", direction);
      markMedia(bubble);
      markSenderAvatar(row, bubble, direction);
    }
  }

  function renderAll(force = false) {
    const chat = activeChat();
    const signature = chat ? `${chat.key}|${store.rev}|${todayKey()}` : `none|${store.rev}`;
    if (force || signature !== state.chatSignature) {
      state.chatSignature = signature;
      state.chat = chat;
      renderBanner(chat);
      if (state.panel) {
        renderPanel();
      }
    }
    markChatList();
    markBubbles();
    protectAvatars();
    scanOpenChat();
    placeOverlays();
  }

  function protectAvatars() {
    const main = document.getElementById("main");
    if (state.theme && main) {
      raiseAvatars(main);
    }
  }

  // En modo normal solo quedan las etiquetas de días en la lista de chats.
  function placeOverlays() {
    placeChatButton(state.theme ? state.chat : null);
    placeBanner(state.theme ? state.chat : null);
    placeListBadges();
  }

  let positionQueued = false;
  function queuePositions() {
    if (positionQueued) {
      return;
    }
    positionQueued = true;
    requestAnimationFrame(() => {
      positionQueued = false;
      markChatList();
      // La foto es «sticky»: al desplazarse se mueve sobre otros mensajes.
      protectAvatars();
      placeOverlays();
    });
  }

  // ----------------------------------------------------------- modales
  function toast(text, ms = 3200) {
    const node = el("div", { class: "p5r-toast", role: "status", text });
    ensureLayer().append(node);
    setTimeout(() => node.remove(), ms);
  }

  function closeModal() {
    if (state.modal) {
      state.modal.remove();
      state.modal = null;
    }
  }

  function openModal(tag, ...content) {
    closeModal();
    const modal = el("div", { class: "p5r-modal", role: "dialog", "aria-modal": "true", "aria-label": tag },
      el("button", { class: "p5r-close", type: "button", "aria-label": "Cerrar", onclick: closeModal }, "✕"),
      el("div", { class: "p5r-modal-tag", text: tag }),
      ...content
    );
    const backdrop = el("div", {
      class: "p5r-backdrop",
      onmousedown: (event) => {
        if (event.target === backdrop) {
          closeModal();
        }
      },
    }, modal);
    ensureLayer().append(backdrop);
    state.modal = backdrop;
    const focusTarget = modal.querySelector("input, textarea, .p5r-primary") || modal.querySelector("button");
    if (focusTarget) {
      setTimeout(() => focusTarget.focus(), 30);
    }
    return modal;
  }

  function chatLabel(card) {
    if (!card.chatTitle) {
      return "Chat sin nombre";
    }
    return card.isGroup ? `Grupo: ${card.chatTitle}` : card.chatTitle;
  }

  function openEditor({ card = null, chat = null } = {}) {
    const editing = Boolean(card);
    const target = chat || (card && { key: card.chatKey, title: card.chatTitle, isGroup: card.isGroup });
    if (!target) {
      toast("Abre primero el grupo donde quieres dejar la tarjeta");
      return;
    }
    const titleInput = el("input", {
      class: "p5r-input",
      type: "text",
      maxlength: 140,
      required: true,
      placeholder: "¿Qué corazón vamos a robar?",
      value: card ? card.title : "",
    });
    const dateInput = el("input", {
      class: "p5r-input",
      type: "date",
      required: true,
      value: card ? card.target : "",
      min: editing ? null : todayKey(),
    });
    const messageInput = el("textarea", {
      class: "p5r-input",
      maxlength: SHARED_MESSAGE_MAX,
      placeholder: "Opcional: el mensaje de la tarjeta (¡que tiemble el destinatario!)",
    });
    messageInput.value = card ? card.message : "";
    const remindersInput = el("input", { type: "checkbox" });
    remindersInput.checked = card ? card.reminders : true;
    const preview = el("p", { class: "p5r-hint" });
    const updatePreview = () => {
      const info = countdown(dateInput.value);
      preview.textContent = dateInput.value
        ? `${formatDate(dateInput.value)} · ${info.text}`
        : "Elige la fecha del golpe para ver la cuenta regresiva.";
    };
    dateInput.addEventListener("input", updatePreview);
    updatePreview();

    const chatOpen = isCardChatOpen({ chatKey: target.key, chatTitle: target.title });
    let sendToGroup = true;
    const form = el("form", {
      onsubmit: async (event) => {
        event.preventDefault();
        const title = cleanTitle(titleInput.value);
        if (!title || !parseKey(dateInput.value)) {
          toast("Falta el título o la fecha");
          return;
        }
        if (daysUntil(dateInput.value) < 0) {
          toast("Esa fecha ya pasó: la tarjeta se borraría al instante");
          return;
        }
        const saved = {
          id: card ? card.id : newId(),
          chatKey: target.key,
          chatTitle: target.title,
          isGroup: target.isGroup,
          title,
          message: cleanMessage(messageInput.value),
          target: dateInput.value,
          reminders: remindersInput.checked,
          lastNotified: card && card.target === dateInput.value ? card.lastNotified : "",
          author: card ? card.author : "",
          origin: card ? card.origin : "me",
          shared: card ? card.shared : false,
          msgTime: card ? card.msgTime : 0,
        };
        closeModal();
        if (sendToGroup && chatOpen) {
          store.upsert({ ...saved, shared: true, msgTime: Date.now() });
          toastSendResult(await sendToChat(buildShareMessage(saved)));
        } else {
          store.upsert(saved);
          toast(editing ? "Tarjeta actualizada (solo en esta computadora)" : "Tarjeta guardada solo para ti");
        }
      },
    },
      el("p", { class: "p5r-hint", text: `Para: ${chatLabel({ chatTitle: target.title, isGroup: target.isGroup })}` }),
      el("label", { class: "p5r-field" }, el("span", { text: "Objetivo" }), titleInput),
      el("label", { class: "p5r-field" }, el("span", { text: "Fecha" }), dateInput),
      preview,
      el("label", { class: "p5r-field" }, el("span", { text: "Mensaje" }), messageInput),
      el("label", { class: "p5r-check" }, remindersInput, "Recordarme a 7, 3 y 1 día, y el mismo día"),
      el("p", {
        class: "p5r-hint",
        text: chatOpen
          ? "Se envía como mensaje al chat: quien tenga ZapZap P5R la verá con su cuenta regresiva; el resto, como texto normal. Pasada la fecha se borra sola."
          : `Abre «${target.title}» para enviarla al grupo; desde aquí solo puedes guardarla para ti.`,
      }),
      el("div", { class: "p5r-actions" },
        el("button", {
          class: "p5r-btn p5r-primary",
          type: "submit",
          text: editing ? "Guardar y reenviar" : "Enviar al grupo",
          disabled: !chatOpen,
          onclick: () => { sendToGroup = true; },
        }),
        el("button", {
          class: "p5r-btn",
          type: "submit",
          text: "Solo para mí",
          onclick: () => { sendToGroup = false; },
        }),
        el("button", { class: "p5r-btn", type: "button", text: "Cancelar", onclick: closeModal }),
        editing ? deleteButtons(card) : null
      )
    );
    openModal(editing ? "Editar tarjeta" : "Nueva tarjeta de aviso", form);
  }

  // «Eliminar» se convierte en dos opciones: solo aquí o para todo el grupo.
  function deleteButtons(card) {
    const wrap = el("span", { class: "p5r-actions-inline" });
    const start = el("button", {
      class: "p5r-btn p5r-danger",
      type: "button",
      text: "Eliminar…",
      onclick: () => {
        const forAll = isCardChatOpen(card);
        wrap.replaceChildren(...[
          el("button", {
            class: "p5r-btn p5r-danger",
            type: "button",
            text: "Solo para mí",
            onclick: () => {
              store.remove(card.id);
              closeModal();
              toast("Tarjeta eliminada de esta computadora");
            },
          }),
          forAll
            ? el("button", {
                class: "p5r-btn p5r-danger",
                type: "button",
                text: "Cancelar para todos",
                onclick: async () => {
                  closeModal();
                  const result = await sendToChat(buildCancelMessage(card));
                  if (result === "sent" || result === "typed") {
                    store.remove(card.id);
                  }
                  toastSendResult(result, "Aviso cancelado para todo el grupo");
                },
              })
            : null,
        ].filter(Boolean));
      },
    });
    wrap.append(start);
    return wrap;
  }

  function isCardChatOpen(card) {
    const chat = activeChat();
    return Boolean(chat && (card.chatKey === chat.key || (chat.title && card.chatTitle === chat.title)));
  }

  function cardElement(card) {
    const info = countdown(card.target);
    return el("div", { class: "p5r-card", dataset: { state: info.state } },
      el("span", { class: "p5r-card-kicker", text: "TARJETA DE AVISO" }),
      el("div", { class: "p5r-card-title" }, ransom(card.title || "Sin título", { onRed: true })),
      card.message ? el("p", { class: "p5r-card-message", text: card.message }) : null,
      el("div", { class: "p5r-card-footer" },
        el("span", { class: "p5r-card-date", text: formatDate(card.target) }),
        el("span", { class: "p5r-card-count" }, el("b", { text: info.big }), el("small", { text: info.label }))
      ),
      el("div", { class: "p5r-card-sign", text: card.origin === "them" && card.author ? `— ${card.author}` : SIGNATURE })
    );
  }

  function openViewer(card) {
    if (!card) {
      return;
    }
    const open = isCardChatOpen(card);
    const sharedNote = card.shared
      ? card.origin === "them"
        ? `Llegó por el chat${card.author ? ` de parte de ${card.author}` : ""}.`
        : "Enviada al chat: la ve todo el que tenga ZapZap P5R."
      : "Solo está en esta computadora.";
    const actions = el("div", { class: "p5r-actions" },
      el("button", {
        class: "p5r-btn p5r-primary",
        type: "button",
        text: card.shared ? "Reenviar al grupo" : "Enviar al grupo",
        disabled: !open,
        onclick: async () => {
          closeModal();
          store.upsert({ ...card, shared: true, msgTime: Date.now() });
          toastSendResult(await sendToChat(buildShareMessage(card)));
        },
      }),
      el("button", {
        class: "p5r-btn",
        type: "button",
        text: "Enviar imagen",
        disabled: !open,
        onclick: () => shareImage(card),
      }),
      el("button", { class: "p5r-btn", type: "button", text: "Descargar imagen", onclick: () => downloadImage(card) }),
      el("button", { class: "p5r-btn", type: "button", text: "Editar", onclick: () => openEditor({ card }) }),
      open ? null : el("button", { class: "p5r-btn", type: "button", text: "Ir al chat", onclick: () => goToChat(card) }),
      deleteButtons(card)
    );
    openModal(
      chatLabel(card),
      cardElement(card),
      el("p", { class: "p5r-hint", text: open ? sharedNote : `${sharedNote} Abre «${card.chatTitle}» para enviarla.` }),
      actions
    );
  }

  function onChatButton() {
    const chat = activeChat();
    if (!chat) {
      return;
    }
    if (store.forChat(chat).length) {
      openPanel(chat);
    } else {
      openEditor({ chat });
    }
  }

  function onBanner() {
    const card = store.get(layerPart("banner").dataset.cardId);
    if (card) {
      openViewer(card);
    }
  }

  // ------------------------------------------------------------ panel
  function closePanel() {
    if (state.panel) {
      state.panel.remove();
      state.panel = null;
      state.panelFilter = null;
    }
  }

  function openPanel(filterChat = null) {
    closeModal();
    if (!state.panel) {
      state.panel = el("aside", { class: "p5r-panel", role: "dialog", "aria-label": "Tarjetas de aviso" });
      ensureLayer().append(state.panel);
    }
    state.panelFilter = filterChat;
    renderPanel();
  }

  function itemElement(card) {
    const info = countdown(card.target);
    return el("button", {
      class: "p5r-item",
      type: "button",
      dataset: { state: info.state },
      onclick: () => openViewer(card),
    },
      el("span", { class: "p5r-item-title", text: card.title || "Sin título" }),
      el("span", { class: "p5r-item-count" }, info.state === "today" ? "HOY" : info.big, el("small", { text: info.state === "today" ? "¡YA!" : info.label })),
      el("span", {
        class: "p5r-item-chat",
        text: `${chatLabel(card)} · ${formatDate(card.target)}${card.origin === "them" && card.author ? ` · de ${card.author}` : ""}`,
      })
    );
  }

  function renderPanel() {
    const panel = state.panel;
    if (!panel) {
      return;
    }
    const filter = state.panelFilter;
    const chat = activeChat();
    const cards = (filter ? store.forChat(filter) : sortCards(store.cards))
      .filter((card) => daysUntil(card.target) >= 0);

    const themeSwitch = el("input", {
      type: "checkbox",
      "data-p5r-theme-switch": "",
      onchange: (event) => setTheme(event.target.checked, false),
    });
    themeSwitch.checked = state.theme;

    const list = el("div", { class: "p5r-panel-list" });
    if (!cards.length) {
      list.append(el("div", { class: "p5r-empty" },
        el("strong", { text: "SIN OBJETIVOS" }),
        filter ? "Este chat no tiene tarjetas todavía." : "Abre un grupo y pulsa el botón de la tarjeta en su encabezado para crear un aviso con cuenta regresiva."
      ));
    }
    if (cards.length) {
      list.append(el("div", { class: "p5r-section-title", text: "PRÓXIMOS GOLPES" }), ...cards.map(itemElement));
    }

    // replaceChildren() convertiría un null en el texto "null".
    panel.replaceChildren(...[
      el("button", { class: "p5r-close", type: "button", "aria-label": "Cerrar", onclick: closePanel }, "✕"),
      el("div", { class: "p5r-panel-head" },
        el("h2", { text: "Tarjetas de aviso" }),
        el("p", { text: filter ? chatLabel({ chatTitle: filter.title, isGroup: filter.isGroup }) : "Todos los chats de esta cuenta" })
      ),
      el("div", { class: "p5r-panel-tools" },
        el("label", { class: "p5r-switch" }, themeSwitch, "ESTÉTICA P5R"),
        el("button", {
          class: "p5r-btn p5r-primary",
          type: "button",
          text: "Nueva",
          disabled: !chat,
          title: chat ? `Nueva tarjeta para ${chat.title}` : "Abre un chat primero",
          onclick: () => openEditor({ chat: activeChat() }),
        })
      ),
      filter
        ? el("div", { class: "p5r-panel-tools" },
            el("button", { class: "p5r-btn", type: "button", text: "Ver todas", onclick: () => openPanel(null) }))
        : null,
      list,
    ].filter(Boolean));
  }

  // -------------------------------------------------------- compartir
  // Los textos del usuario no pueden romper el formato del mensaje compartido.
  function cleanTitle(text) {
    return String(text || "").replace(/[«»\n\r]/g, " ").replace(/p5r:\/\//gi, "").replace(/\s+/g, " ").trim().slice(0, 140);
  }

  function cleanMessage(text) {
    return String(text || "").replace(/p5r:\/\//gi, "").replace(/^\s*📅?\s*Fecha:/gim, "Fecha -").trim().slice(0, SHARED_MESSAGE_MAX);
  }

  // Sin "faltan N días": el mensaje queda en el chat y eso caducaría; el fork
  // de cada quien calcula la cuenta regresiva en vivo.
  function buildShareMessage(card) {
    const lines = ["🎭 *TARJETA DE AVISO* 🎭", `«${cleanTitle(card.title)}»`];
    const message = cleanMessage(card.message);
    if (message) {
      lines.push("", message);
    }
    lines.push("", `📅 Fecha: ${formatDate(card.target)}`, SIGNATURE, `p5r://aviso/${card.target}/${card.id}`);
    return lines.join("\n");
  }

  function buildCancelMessage(card) {
    return `❌ *Aviso cancelado:* «${cleanTitle(card.title)}»\np5r://cancelar/${card.id}`;
  }

  function parseCardText(text) {
    if (typeof text !== "string" || !text.includes("p5r://")) {
      return null;
    }
    const cancel = CANCEL_RE.exec(text);
    if (cancel) {
      return { kind: "cancel", id: cancel[1].toLowerCase() };
    }
    const token = TOKEN_RE.exec(text);
    if (!token || !parseKey(token[1])) {
      return null;
    }
    const lines = text.replace(/\r/g, "").split("\n");
    const titleIndex = lines.findIndex((line) => /«[^»]+»/.test(line));
    const title = titleIndex >= 0 ? /«([^»]+)»/.exec(lines[titleIndex])[1] : "Tarjeta de aviso";
    let end = lines.findIndex((line) => line.includes("p5r://"));
    for (let i = end - 1; i > titleIndex; i -= 1) {
      if (/Fecha:/i.test(lines[i])) {
        end = i;
        break;
      }
    }
    const message = titleIndex >= 0 ? lines.slice(titleIndex + 1, end).join("\n") : "";
    return {
      kind: "card",
      id: token[2].toLowerCase(),
      target: token[1],
      title: cleanTitle(title) || "Tarjeta de aviso",
      message: cleanMessage(message),
    };
  }

  // Aplica un mensaje con tarjeta (o cancelación). meta.msgTime > 0 solo cuando
  // viene de WhatsApp (hora real del mensaje): lo leído del DOM nunca pisa una
  // versión que ya tenemos. Devuelve true si cambió algo (falta commit()).
  function ingestText(text, meta = {}) {
    const parsed = parseCardText(text);
    if (!parsed) {
      return false;
    }
    const existing = store.get(parsed.id);
    if (parsed.kind === "cancel") {
      const known = Boolean(store.tombstones[parsed.id]);
      store.bury(parsed.id);
      if (existing && !meta.fromMe && meta.live) {
        toast(`Aviso cancelado: ${existing.title}`, 5000);
      }
      return Boolean(existing) || !known;
    }
    if (store.tombstones[parsed.id] || daysUntil(parsed.target) < 0) {
      return false;
    }
    const msgTime = Number(meta.msgTime) || 0;
    if (existing && (!msgTime || (existing.msgTime || 0) >= msgTime)) {
      return false;
    }
    const now = Date.now();
    const card = {
      id: parsed.id,
      chatKey: meta.chatKey || (existing && existing.chatKey) || "",
      chatTitle: meta.chatTitle || (existing && existing.chatTitle) || "",
      isGroup: typeof meta.isGroup === "boolean" ? meta.isGroup : existing ? existing.isGroup : null,
      title: parsed.title,
      message: parsed.message,
      target: parsed.target,
      reminders: existing ? existing.reminders : true,
      lastNotified: existing && existing.target === parsed.target ? existing.lastNotified : "",
      author: meta.fromMe ? "" : String(meta.author || "").slice(0, 80),
      origin: meta.fromMe ? "me" : "them",
      shared: true,
      msgTime,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    if (existing) {
      store.cards[store.cards.indexOf(existing)] = card;
    } else {
      store.cards.push(card);
      if (!meta.fromMe) {
        announceReceived(card);
      }
    }
    return true;
  }

  function announceReceived(card) {
    const info = countdown(card.target);
    const where = card.chatTitle ? ` en ${card.chatTitle}` : "";
    toast(`Nueva tarjeta de aviso${where}: ${card.title} — ${info.text}`, 6000);
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(`Tarjeta de aviso${where}`, { body: `${card.title} — ${info.text}`, tag: `p5r-${card.id}` });
      }
    } catch (_error) {
      // Opcional: el aviso en pantalla ya se mostró.
    }
  }

  // Escucha los mensajes que WhatsApp carga o recibe (aunque el chat no esté
  // abierto). Si sus módulos internos cambian, queda el respaldo del DOM.
  function attachMessageWatcher() {
    if (state.msgWatcher || typeof window.require !== "function") {
      return;
    }
    let collections = null;
    try {
      collections = window.require("WAWebCollections");
    } catch (_error) {
      return;
    }
    const messages = collections && collections.Msg;
    if (!messages || typeof messages.on !== "function") {
      return;
    }
    const chats = collections.Chat;
    const metaOf = (msg) => {
      const remote = msg.id && msg.id.remote;
      const key = remote ? remote._serialized || String(remote) : "";
      let chat = null;
      try {
        chat = chats && key ? chats.get(key) : null;
      } catch (_error) {
        chat = null;
      }
      const sender = msg.senderObj || {};
      return {
        chatKey: key,
        chatTitle: (chat && (chat.formattedTitle || chat.name)) || "",
        isGroup: /@g\.us$/.test(key),
        fromMe: Boolean(msg.id && msg.id.fromMe),
        author: msg.notifyName || sender.pushname || sender.formattedName || "",
        msgTime: (Number(msg.t) || 0) * 1000,
      };
    };
    const handle = (msg, live) => {
      try {
        if (msg && typeof msg.body === "string" && msg.body.includes("p5r://")) {
          return ingestText(msg.body, { ...metaOf(msg), live });
        }
      } catch (error) {
        console.warn("[ZapZap P5R]", error);
      }
      return false;
    };
    messages.on("add", (msg) => {
      if (handle(msg, true)) {
        store.commit();
      }
    });
    state.msgWatcher = true;
    let changed = false;
    try {
      const loaded = typeof messages.getModelsArray === "function" ? messages.getModelsArray() : messages.models || [];
      for (const msg of loaded) {
        changed = handle(msg, false) || changed;
      }
    } catch (_error) {
      // Sin historial cargado: llegará con los eventos "add".
    }
    if (changed) {
      store.commit();
    }
  }

  // Respaldo: lee las tarjetas de los mensajes visibles del chat abierto.
  function scanOpenChat() {
    const main = document.getElementById("main");
    if (!main) {
      return;
    }
    const rows = [...messageRows(main)].filter((row) => !row.hasAttribute("data-p5r-scan"));
    if (!rows.length) {
      return;
    }
    const chat = activeChat();
    let changed = false;
    for (const row of rows) {
      row.setAttribute("data-p5r-scan", "");
      const textNode = row.querySelector("[data-pre-plain-text]") || row;
      const text = textNode.innerText || "";
      if (!text.includes("p5r://")) {
        continue;
      }
      const header = textNode.getAttribute ? textNode.getAttribute("data-pre-plain-text") || "" : "";
      changed = ingestText(text, {
        chatKey: chat && chat.key,
        chatTitle: chat && chat.title,
        isGroup: chat ? chat.isGroup : null,
        fromMe: messageDirection(row, null) === "out",
        author: (/\]\s*([^:]+):\s*$/.exec(header) || [])[1] || "",
        msgTime: 0,
        live: false,
      }) || changed;
    }
    if (changed) {
      store.commit();
    }
  }

  function composer() {
    return (
      document.querySelector('#main footer [contenteditable="true"][data-lexical-editor="true"]') ||
      document.querySelector('#main footer [contenteditable="true"]')
    );
  }

  function placeCaretAtEnd(editor) {
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // El editor de WhatsApp (Lexical) acepta un "pegado" sintético.
  function pasteInto(editor, dataTransfer) {
    const event = new ClipboardEvent("paste", { clipboardData: dataTransfer, bubbles: true, cancelable: true });
    editor.dispatchEvent(event);
    return event.defaultPrevented;
  }

  function composerText() {
    const editor = composer();
    return editor ? editor.innerText.replace(/[​﻿]/g, "").trim() : "";
  }

  function insertText(editor, text) {
    placeCaretAtEnd(editor);
    try {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      if (pasteInto(editor, data)) {
        return;
      }
    } catch (_error) {
      // Sigue con execCommand.
    }
    document.execCommand("insertText", false, text);
  }

  function findSendButton() {
    const footer = document.querySelector("#main footer");
    if (!footer) {
      return null;
    }
    const icon = footer.querySelector('[data-icon="send"], [data-icon="wds-ic-send-filled"], [data-icon*="send"]');
    if (icon) {
      return icon.closest('button, [role="button"]') || icon;
    }
    return [...footer.querySelectorAll('button, [role="button"]')]
      .find((button) => /^(enviar|send)$/i.test((button.getAttribute("aria-label") || "").trim())) || null;
  }

  // Escribe el texto en el chat abierto y pulsa «enviar» (solo cuando el
  // usuario lo pidió con un botón). No pisa un borrador que ya esté escrito.
  async function sendToChat(text) {
    const editor = composer();
    if (!editor) {
      return "no-composer";
    }
    if (composerText()) {
      return "busy";
    }
    insertText(editor, text);
    await sleep(250);
    if (!composerText()) {
      return "failed";
    }
    const button = findSendButton();
    if (button) {
      button.click();
    } else {
      editor.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true,
      }));
    }
    await sleep(500);
    return composerText() ? "typed" : "sent";
  }

  function toastSendResult(result, sentText = "¡Tarjeta enviada al grupo!") {
    const messages = {
      sent: sentText,
      typed: "La tarjeta quedó escrita en el chat: presiona Enter para enviarla",
      busy: "Tienes un texto sin enviar en el chat: envíalo o bórralo y vuelve a intentarlo",
      "no-composer": "Abre el chat para enviarla",
      failed: "No pude escribir en el chat",
    };
    toast(messages[result] || messages.failed, 4500);
  }

  async function shareImage(card) {
    const editor = composer();
    if (!editor) {
      toast("No encontré la caja de texto del chat");
      return;
    }
    toast("Preparando la tarjeta…", 1500);
    const blob = await renderCardImage(card);
    if (!blob) {
      toast("No pude dibujar la tarjeta");
      return;
    }
    closeModal();
    let done = false;
    try {
      const file = new File([blob], "tarjeta-de-aviso.png", { type: "image/png" });
      const data = new DataTransfer();
      data.items.add(file);
      placeCaretAtEnd(editor);
      done = pasteInto(editor, data);
    } catch (_error) {
      done = false;
    }
    if (done) {
      toast("Revisa la vista previa de WhatsApp y envíala");
    } else {
      saveBlob(blob, "tarjeta-de-aviso.png");
      toast("No pude adjuntarla: la descargué para que la envíes tú");
    }
  }

  async function downloadImage(card) {
    toast("Preparando la tarjeta…", 1500);
    const blob = await renderCardImage(card);
    if (blob) {
      saveBlob(blob, `tarjeta-${card.target}.png`);
    } else {
      toast("No pude dibujar la tarjeta");
    }
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function goToChat(card) {
    const pane = document.getElementById("pane-side");
    const span = pane && [...pane.querySelectorAll("span[title]")].find((node) => node.getAttribute("title") === card.chatTitle);
    const row = span && (span.closest('[role="listitem"], [role="row"]') || span);
    if (!row) {
      toast(`No veo «${card.chatTitle}» en la lista: búscalo arriba`);
      return;
    }
    closeModal();
    closePanel();
    for (const type of ["mousedown", "mouseup", "click"]) {
      row.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  }

  // ------------------------------------------------- imagen de la tarjeta
  async function waitForFonts() {
    if (!document.fonts || !document.fonts.load) {
      return;
    }
    const loads = ["Anton", "Bebas Neue", "Special Elite", "Abril Fatface", "Bangers", "Permanent Marker"]
      .map((family) => document.fonts.load(`64px "${family}"`).catch(() => null));
    await Promise.race([Promise.all(loads), new Promise((resolve) => setTimeout(resolve, 2500))]);
  }

  function jaggedPath(ctx, x, y, w, h, random, jitter = 14) {
    ctx.beginPath();
    ctx.moveTo(x + random() * jitter, y + random() * jitter);
    ctx.lineTo(x + w * 0.55, y + random() * jitter);
    ctx.lineTo(x + w - random() * jitter, y + random() * jitter * 1.5);
    ctx.lineTo(x + w - random() * jitter * 1.6, y + h * 0.5);
    ctx.lineTo(x + w - random() * jitter, y + h - random() * jitter);
    ctx.lineTo(x + w * 0.4, y + h - random() * jitter * 1.4);
    ctx.lineTo(x + random() * jitter, y + h - random() * jitter);
    ctx.lineTo(x + random() * jitter * 1.4, y + h * 0.45);
    ctx.closePath();
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    const lines = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const attempt = line ? `${line} ${word}` : word;
        if (ctx.measureText(attempt).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = attempt;
        }
      }
      lines.push(line);
    }
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, "")}…`;
    }
    return lines;
  }

  function drawMask(ctx, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.18);
    ctx.scale(size / 100, size / 100);
    ctx.fillStyle = "#0b0b0b";
    ctx.beginPath();
    ctx.moveTo(-50, -8);
    ctx.quadraticCurveTo(-30, -26, 0, -12);
    ctx.quadraticCurveTo(30, -26, 50, -8);
    ctx.quadraticCurveTo(46, 16, 22, 18);
    ctx.quadraticCurveTo(6, 18, 0, 6);
    ctx.quadraticCurveTo(-6, 18, -22, 18);
    ctx.quadraticCurveTo(-46, 16, -50, -8);
    ctx.fill();
    ctx.fillStyle = "#e60012";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 22, 0, 12, 7, side * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  async function renderCardImage(card) {
    await waitForFonts();
    const width = 1080;
    const height = 1350;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const random = seededRandom(hashString(card.id + card.title));
    const info = countdown(card.target);

    // Fondo: rojo, franjas y semitono.
    ctx.fillStyle = info.state === "past" ? "#6d6d6d" : "#e60012";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-0.85);
    ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
    for (let x = -1400; x < 1400; x += 92) {
      ctx.fillRect(x, -1400, 34, 2800);
    }
    ctx.restore();
    ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
    for (let y = 0; y < height; y += 22) {
      for (let x = 0; x < width; x += 22) {
        const reach = Math.max(0, 1 - Math.hypot(x - width, y - height) / 900) +
          Math.max(0, 1 - Math.hypot(x, y) / 620);
        const radius = Math.min(9, reach * 9);
        if (radius > 0.6) {
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Etiqueta superior.
    ctx.save();
    ctx.translate(70, 120);
    ctx.rotate(-0.06);
    ctx.fillStyle = "#0b0b0b";
    ctx.beginPath();
    ctx.moveTo(-20, -70);
    ctx.lineTo(640, -86);
    ctx.lineTo(600, 34);
    ctx.lineTo(-10, 46);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f6f4ef";
    ctx.font = '78px "Bebas Neue", "Anton", Impact, sans-serif';
    ctx.fillText("TARJETA DE AVISO", 12, 20);
    ctx.restore();
    drawMask(ctx, 900, 130, 230);

    // Título en letras recortadas.
    const glyphs = ransomGlyphs((card.title || "Sin título").slice(0, 70), true);
    const baseSize = glyphs.length > 32 ? 70 : glyphs.length > 18 ? 86 : 104;
    let x = 80;
    let y = 330;
    const maxX = width - 80;
    const lineHeight = baseSize * 1.32;
    const words = [];
    let current = [];
    for (const glyph of glyphs) {
      if (glyph.space) {
        if (current.length) {
          words.push(current);
        }
        current = [];
      } else {
        current.push(glyph);
      }
    }
    if (current.length) {
      words.push(current);
    }
    const glyphWidth = (glyph) => {
      ctx.font = `${Math.round(baseSize * glyph.scale)}px ${glyph.font}`;
      return ctx.measureText(glyph.char).width + baseSize * 0.24;
    };
    for (const word of words) {
      const wordWidth = word.reduce((sum, glyph) => sum + glyphWidth(glyph), 0);
      if (x + wordWidth > maxX && x > 80) {
        x = 80;
        y += lineHeight;
      }
      if (y > 720) {
        break;
      }
      for (const glyph of word) {
        const size = Math.round(baseSize * glyph.scale);
        ctx.font = `${size}px ${glyph.font}`;
        const w = ctx.measureText(glyph.char).width + baseSize * 0.2;
        ctx.save();
        ctx.translate(x + w / 2, y + glyph.lift * size);
        ctx.rotate((glyph.rotate * Math.PI) / 180);
        if (glyph.bg !== "transparent") {
          ctx.fillStyle = glyph.bg;
          ctx.fillRect(-w / 2, -size * 0.86, w, size * 1.08);
        }
        ctx.fillStyle = glyph.fg;
        ctx.textAlign = "center";
        ctx.fillText(glyph.char, 0, 0);
        ctx.restore();
        x += w + baseSize * 0.06;
      }
      x += baseSize * 0.36;
    }

    // Mensaje en papel recortado.
    let cursorY = Math.max(y + 70, 520);
    if (card.message) {
      ctx.font = '38px "Special Elite", "Courier New", monospace';
      const lines = wrapLines(ctx, card.message, 820, 6);
      const boxHeight = lines.length * 50 + 60;
      ctx.save();
      ctx.translate(0, cursorY);
      ctx.rotate(-0.015);
      ctx.fillStyle = "#f6f4ef";
      jaggedPath(ctx, 80, 0, 920, boxHeight, random);
      ctx.fill();
      ctx.fillStyle = "#111";
      lines.forEach((line, index) => ctx.fillText(line, 120, 70 + index * 50));
      ctx.restore();
      cursorY += boxHeight + 50;
    }

    // Fecha.
    const dateText = formatDate(card.target).toUpperCase();
    ctx.save();
    ctx.translate(80, Math.min(cursorY + 40, 1010));
    ctx.rotate(-0.03);
    ctx.font = '50px "Bebas Neue", "Anton", Impact, sans-serif';
    const dateWidth = ctx.measureText(dateText).width;
    ctx.fillStyle = "#0b0b0b";
    ctx.beginPath();
    ctx.moveTo(-10, -52);
    ctx.lineTo(dateWidth + 50, -58);
    ctx.lineTo(dateWidth + 30, 18);
    ctx.lineTo(-24, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f6f4ef";
    ctx.fillText(dateText, 12, 0);
    ctx.restore();

    // Cuenta regresiva gigante.
    ctx.save();
    ctx.textAlign = "right";
    ctx.font = `${info.big.length > 2 ? 230 : 300}px "Anton", Impact, sans-serif`;
    ctx.fillStyle = "#0b0b0b";
    ctx.fillText(info.big, width - 62, 1222);
    ctx.fillStyle = info.state === "today" ? "#ffcf3f" : "#f6f4ef";
    ctx.fillText(info.big, width - 74, 1210);
    ctx.font = '64px "Bebas Neue", "Anton", Impact, sans-serif';
    ctx.fillStyle = "#0b0b0b";
    ctx.fillText(info.label, width - 74, 1290);
    ctx.restore();

    // Firma y destinatario.
    ctx.fillStyle = "#0b0b0b";
    ctx.font = '36px "Special Elite", "Courier New", monospace';
    ctx.fillText(SIGNATURE, 80, 1290);
    if (card.chatTitle) {
      ctx.font = '30px "Bebas Neue", Impact, sans-serif';
      ctx.fillText(`PARA: ${card.chatTitle.toUpperCase()}`.slice(0, 48), 80, 1225);
    }

    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  // ---------------------------------------------------- recordatorios
  function checkReminders() {
    const now = Date.now();
    if (now - state.lastReminderCheck < 60000) {
      return;
    }
    state.lastReminderCheck = now;
    const today = todayKey();
    let changed = false;
    for (const card of store.cards) {
      const days = daysUntil(card.target);
      if (!card.reminders || card.lastNotified === today || !REMINDER_DAYS.includes(days)) {
        continue;
      }
      card.lastNotified = today;
      changed = true;
      const info = countdown(card.target);
      const body = `${card.title} — ${info.text}`;
      toast(`AVISO · ${body}`, 6000);
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`Tarjeta de aviso · ${card.chatTitle || "WhatsApp"}`, { body, tag: `p5r-${card.id}` });
        }
      } catch (_error) {
        // La notificación es opcional; el aviso en pantalla ya se mostró.
      }
    }
    if (changed) {
      store.commit();
    }
  }

  // ------------------------------------------------------------ eventos
  // Esc cierra lo nuestro antes de que WhatsApp lo use para cerrar el chat.
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (state.modal || state.panel)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (state.modal) {
        closeModal();
      } else {
        closePanel();
      }
    }
  }, true);

  // El panel de tarjetas se cierra solo al hacer clic fuera de él (no cuando el
  // clic es en una tarjeta abierta encima del panel).
  document.addEventListener("mousedown", (event) => {
    const target = event.target;
    if (state.panel && !state.modal && target instanceof Element
        && !target.closest(".p5r-panel, .p5r-backdrop, .p5r-modal")) {
      closePanel();
    }
  }, true);

  document.addEventListener("scroll", queuePositions, { capture: true, passive: true });
  window.addEventListener("resize", queuePositions, { passive: true });

  // WhatsApp a veces reescribe la clase de <html>; recuperamos la nuestra.
  new MutationObserver(() => {
    if (state.theme !== document.documentElement.classList.contains("p5r")) {
      applyTheme();
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  // ---------------------------------------------------------------- API
  // ---------------------------------------------------- transición
  // Al entrar al modo Persona: ondas como de agua que tiñen todo de rojo y,
  // ya cubierta la pantalla, WhatsApp se recarga para que todo (lista,
  // mensajes, espaciado) se dibuje de cero con la estética. Al terminar de
  // cargar, el rojo se retira.
  const TRANSITION_KEY = "zapzap-p5r:transition";
  const WATER_FILTER =
    '<svg class="p5r-water-defs" aria-hidden="true" focusable="false"><filter id="p5r-water">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.011 0.028" numOctaves="2" seed="7" result="noise">' +
    '<animate attributeName="baseFrequency" dur="2.4s" repeatCount="indefinite" ' +
    'values="0.011 0.028;0.018 0.045;0.011 0.028"/></feTurbulence>' +
    '<feDisplacementMap in="SourceGraphic" in2="noise" scale="42" xChannelSelector="R" yChannelSelector="G"/>' +
    "</filter></svg>";

  function transitionOverlay(phase) {
    document.querySelector(".p5r-transition")?.remove();
    const water = el("div", { class: "p5r-transition-water" },
      el("div", { class: "p5r-transition-flood" }),
      el("div", { class: "p5r-ring" }),
      el("div", { class: "p5r-ring" }),
      el("div", { class: "p5r-ring" }));
    const overlay = el("div", { class: "p5r-transition", "aria-hidden": "true", dataset: { phase } },
      water,
      el("div", { class: "p5r-transition-title" }, ransom("¡Cambio de escena!", { onRed: true })),
      el("div", { class: "p5r-transition-hint", text: "Preparando el escondite…" }));
    overlay.insertAdjacentHTML("afterbegin", WATER_FILTER);
    ensureLayer().append(overlay);
    state.lastTransition = phase;
    return overlay;
  }

  function enterPersonaWithReload() {
    try {
      sessionStorage.setItem(TRANSITION_KEY, String(Date.now()));
    } catch (_error) {
      // Sin sessionStorage la recarga igual aplica el tema (lo guarda ZapZap P5R).
    }
    closeModal();
    closePanel();
    transitionOverlay("in");
    setTimeout(() => location.reload(), 1300);
  }

  // Tras la recarga: mantener el rojo hasta que WhatsApp termine de cargar.
  function finishTransitionAfterReload() {
    let flag = null;
    try {
      flag = sessionStorage.getItem(TRANSITION_KEY);
      sessionStorage.removeItem(TRANSITION_KEY);
    } catch (_error) {
      flag = null;
    }
    if (!flag || Date.now() - Number(flag) > 60000) {
      return;
    }
    // Si el cambio vino de la página, el aviso a ZapZap P5R se perdió con la recarga.
    state.theme = true;
    applyTheme();
    state.requests.push({ type: "setTheme", value: true });
    const overlay = transitionOverlay("hold");
    const started = Date.now();
    const timer = setInterval(() => {
      const loaded = document.getElementById("pane-side") || document.querySelector("#app canvas");
      const waited = Date.now() - started;
      if ((loaded && waited > 900) || waited > 15000) {
        clearInterval(timer);
        overlay.dataset.phase = "out";
        state.lastTransition = "out";
        setTimeout(() => overlay.remove(), 1100);
      }
    }, 200);
  }

  function setTheme(enabled, fromNative) {
    const turnedOn = Boolean(enabled) && !state.theme;
    state.theme = Boolean(enabled);
    applyTheme();
    if (turnedOn) {
      // Las burbujas se reconocen por los colores del tema: volver a buscarlas.
      for (const row of document.querySelectorAll("[data-p5r-b], [data-p5r-try]")) {
        row.removeAttribute("data-p5r-b");
        row.removeAttribute("data-p5r-try");
      }
    }
    placeOverlays();
    if (!fromNative) {
      state.requests.push({ type: "setTheme", value: state.theme });
    }
    if (turnedOn && state.booted) {
      enterPersonaWithReload();
    }
  }

  const api = {
    version: BOOT.version,
    reconfigure(boot) {
      setTheme(boot.theme, true);
      store.adopt(boot);
    },
    setTheme,
    openPanel: () => openPanel(null),
    openEditorForActiveChat() {
      const chat = activeChat();
      if (chat) {
        openEditor({ chat });
      } else {
        toast("Abre primero el grupo donde quieres dejar la tarjeta");
      }
    },
    drain() {
      if (!state.dirty && !state.requests.length) {
        return null;
      }
      const payload = { requests: state.requests.splice(0) };
      if (state.dirty) {
        payload.cardsRev = store.rev;
        payload.cards = store.cards;
        payload.tombstones = store.tombstones;
        state.dirty = false;
      }
      return JSON.stringify(payload);
    },
    // Diagnóstico: window.__zapzapP5R.debug() desde las DevTools de ZapZap.
    debug: () => ({
      theme: state.theme,
      chat: activeChat(),
      cards: store.cards.length,
      rev: store.rev,
      internalChatModule: state.internalChatModule,
      messageWatcher: state.msgWatcher,
      lastTransition: state.lastTransition || null,
      overrideSelectors: themeSelectors().selectors.length,
    }),
    debugCards: () => JSON.stringify(store.cards),
    // Estructura de la página SIN textos, nombres, fotos ni etiquetas: sirve
    // para ajustar el mod cuando WhatsApp cambia su HTML.
    diagnose() {
      const keepData = /^(data-icon|data-tab|data-testid|data-animate.*|data-p5r.*)$/;
      const describe = (node, depth) => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        const info = { depth, tag: node.tagName.toLowerCase() };
        if (node.id) {
          info.id = node.id;
        }
        for (const attr of node.attributes) {
          if (attr.name === "data-testid" && attr.value.startsWith("conv-msg-")) {
            info[attr.name] = "conv-msg-…";
          } else if (attr.name === "role" || keepData.test(attr.name)) {
            info[attr.name] = attr.value.slice(0, 40);
          } else if (attr.name === "data-id") {
            info["data-id"] = `${attr.value.split("_")[0]}_…`;
          } else if (attr.name === "class") {
            info.classes = node.classList.length;
            const hints = [...node.classList].filter((name) => /message|bubble|copyable|selectable|focusable|tail|row|msg/i.test(name));
            if (hints.length) {
              info.classHints = hints;
            }
          } else if (attr.name.startsWith("data-") || attr.name.startsWith("aria-")) {
            info[attr.name] = "…";
          }
        }
        const optional = {
          z: style.zIndex !== "auto" ? style.zIndex : undefined,
          transform: style.transform !== "none" ? "sí" : undefined,
          isolation: style.isolation !== "auto" ? style.isolation : undefined,
          contain: style.contain !== "none" ? style.contain : undefined,
          contentVisibility: style.contentVisibility !== "visible" ? style.contentVisibility : undefined,
          willChange: style.willChange !== "auto" ? style.willChange : undefined,
          opacity: style.opacity !== "1" ? style.opacity : undefined,
          filter: style.filter !== "none" ? "sí" : undefined,
        };
        Object.assign(info, optional, {
          bg: style.backgroundColor,
          radius: style.borderRadius,
          position: style.position,
          overflow: style.overflow,
          display: style.display,
          w: Math.round(box.width),
          h: Math.round(box.height),
          children: node.children.length,
          text: node.children.length ? undefined : (node.textContent || "").length,
        });
        return info;
      };
      const outline = (root, maxNodes = 80) => {
        const out = [];
        const walk = (node, depth) => {
          if (out.length >= maxNodes || depth > 14) {
            return;
          }
          out.push(describe(node, depth));
          for (const child of node.children) {
            walk(child, depth + 1);
          }
        };
        walk(root, 0);
        return out;
      };
      const ancestors = (node, stop) => {
        const out = [];
        for (let current = node; current && current !== stop && out.length < 18; current = current.parentElement) {
          out.push(describe(current, out.length));
        }
        return out;
      };
      const main = document.getElementById("main");
      const pane = document.getElementById("pane-side");
      const count = (root, selector) => (root ? root.querySelectorAll(selector).length : 0);
      const report = {
        mod: BOOT.version,
        date: new Date().toISOString(),
        theme: state.theme,
        messageWatcher: state.msgWatcher,
        internalChatModule: state.internalChatModule,
        counts: {
          main: Boolean(main),
          paneSide: Boolean(pane),
          messageIn: count(main, ".message-in"),
          messageOut: count(main, ".message-out"),
          dataIdTrue: count(main, '[data-id^="true_"]'),
          dataIdFalse: count(main, '[data-id^="false_"]'),
          rows: count(main, '[role="row"]'),
          prePlainText: count(main, "[data-pre-plain-text]"),
          selectableText: count(main, ".selectable-text"),
          tails: count(main, '[data-icon*="tail"]'),
          markedBubbles: count(main, "[data-p5r-bubble]"),
          markedListRows: count(pane, "[data-p5r-row]"),
          listItems: count(pane, '[role="listitem"]'),
        },
        messages: [],
        listRow: null,
      };
      if (main) {
        const texts = [...main.querySelectorAll("[data-pre-plain-text]")].slice(-3);
        for (const text of texts) {
          const row = text.closest('[role="row"]') || text.parentElement;
          report.messages.push({ ancestors: ancestors(text, main), outline: outline(row) });
        }
      }
      if (main) {
        // Qué hay encima de cada foto de remitente (contando rayos y recortes).
        document.documentElement.classList.add("p5r-hit");
        report.avatarStacks = [...main.querySelectorAll("[data-p5r-msg-avatar]")].slice(0, 3).map((frame) => {
          const box = frame.getBoundingClientRect();
          return [[0.5, 0.5], [0.8, 0.8], [0.85, 0.35]].map(([fx, fy]) => document
            .elementsFromPoint(box.left + box.width * fx, box.top + box.height * fy)
            .slice(0, 5)
            .map((node) => ({ ...describe(node, 0), insideAvatar: frame.contains(node) })));
        });
        document.documentElement.classList.remove("p5r-hit");
        // Fotos pequeñas (posibles fotos de remitente): solo su ubicación.
        report.smallImages = [...main.querySelectorAll("img")].filter((img) => {
          const box = img.getBoundingClientRect();
          return box.width >= 20 && box.width <= 56 && Math.abs(box.width - box.height) <= 3;
        }).slice(0, 4).map((img) => ancestors(img, main));
      }
      if (pane) {
        const span = pane.querySelector("span[title]");
        const row = span && (span.closest('[role="listitem"], [role="row"]') || span.parentElement);
        if (row) {
          report.listRow = { ancestors: ancestors(row, pane), outline: outline(row, 40) };
        }
      }
      return JSON.stringify(report, null, 1);
    },
    // Simula un mensaje recibido (pruebas sin cuenta de WhatsApp).
    debugIngest(text, meta = {}) {
      const changed = ingestText(text, { live: true, ...meta });
      if (changed) {
        store.commit();
      }
      return changed;
    },
    debugShareMessage: (id) => (store.get(id) ? buildShareMessage(store.get(id)) : null),
    debugRenderCard(id) {
      const card = store.get(id);
      if (!card) {
        return false;
      }
      renderCardImage(card).then((blob) => {
        const reader = new FileReader();
        reader.onload = () => {
          window.__p5rLastRender = reader.result;
        };
        reader.readAsDataURL(blob);
      });
      return true;
    },
  };
  window[NS] = api;

  // ----------------------------------------------------------- arranque
  function boot() {
    ensureStyles();
    refreshVarOverrides(true);
    store.load(BOOT);
    applyTheme();
    ensureLayer();
    store.purgeExpired();
    state.dayKey = todayKey();
    finishTransitionAfterReload();
    renderAll(true);
    state.booted = true;
    setInterval(() => {
      try {
        refreshVarOverrides();
        const key = todayKey();
        if (key !== state.dayKey) {
          state.dayKey = key;
          store.purgeExpired();
        }
        if (!state.msgWatcher && Date.now() - state.lastWatcherTry > 3000) {
          state.lastWatcherTry = Date.now();
          attachMessageWatcher();
        }
        renderAll(false);
        checkReminders();
      } catch (error) {
        console.warn("[ZapZap P5R]", error);
      }
    }, 900);
  }

  if (document.body) {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  }
})();
