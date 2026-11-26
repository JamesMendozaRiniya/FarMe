import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import {
  Menu,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar,
  Check,
  LogOut,
  X,
  Maximize2,
  Minimize2,
} from "lucide-react";
import "./shared.css";
import { logout, sendChat } from "../services/farmeApi";
import { useAvatarUri, clearAvatarCache } from "./avatar";

import sidebarLogo from "../assets/sidebar-logo.png";
import sidebarHome from "../assets/sidebar-home.png";
import sidebarDashboard from "../assets/sidebar-dashboard.png";
import sidebarLibrary from "../assets/sidebar-library.png";
import sidebarSettings from "../assets/sidebar-settings.png";
import chatbot from "../assets/chatbot.png";

const NAV_LINKS = [
  { key: "home", label: "Dashboard", href: "/home", img: sidebarHome },
  { key: "dashboard", label: "Farm", href: "/dashboard", img: sidebarDashboard },
  { key: "library", label: "Library", href: "/library", img: sidebarLibrary },
  { key: "settings", label: "Settings", href: "/settings", img: sidebarSettings },
];

const CSS_VERSION = "5";
const MARK = { width: "var(--fm-mark-size, 20px)", height: "var(--fm-mark-size, 20px)" };

const NAV_KEY = "farme.nav.collapsed";
const CHAT_KEY = "farme.chat.v1";
const BUBBLE = 56; 
const isWide = () => window.matchMedia("(min-width: 768px)").matches; 

export function Img({ src, alt, w, h, ratio, className, label = "img" }) {
  const [failed, setFailed] = useState(false);
  const box = ratio ? { width: w, aspectRatio: ratio } : { width: w, height: h };
  if (failed)
    return (
      <div
        style={box}
        aria-hidden="true"
        className={`shrink-0 border-2 border-dashed border-[#6A784D] rounded-lg flex items-center justify-center text-[10px] leading-none text-center text-[#6A784D] overflow-hidden ${className || ""}`}
      >
        {label}
      </div>
    );
  return (
    <img
      src={src}
      alt={alt}
      style={box}
      className={`shrink-0 ${className || "object-contain"}`}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

let openModals = 0;
let bodyOverflow = "";
const lockScroll = () => {
  if (openModals++ === 0) {
    bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
};
const unlockScroll = () => {
  openModals = Math.max(0, openModals - 1);
  if (openModals === 0) document.body.style.overflow = bodyOverflow;
};

export function Modal({ title, onClose, wide, top, children }) {
  
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, []);
  return (
    
    <div
      className={`fm-modal-backdrop${top ? " fm-modal-backdrop--top" : ""}`}
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`fm-modal${wide ? " fm-modal--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="fm-modal__head">
          <h2 className="fm-modal__title font-display">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="fm-btn fm-btn--light fm-modal__close"
          >
            <X size={18} />
          </button>
        </header>
        <div className="fm-modal__body">{children}</div>
      </div>
    </div>
  );
}


export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  top,
  onConfirm,
  onClose,
}) {
  return (
    <Modal title={title} onClose={onClose} top={top}>
      <p className="mb-4">{message}</p>
      <div className="fm-modal__actions">
        <button type="button" className="fm-btn fm-btn--light" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={`fm-btn ${danger ? "fm-btn--danger" : "fm-btn--primary"}`}
          onClick={onConfirm}
          autoFocus
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}


export function Select({ id, value, onChange, options, placeholder = "Select…", describedBy }) {
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0); 
  const box = useRef(null);
  const current = items.find((i) => i.value === value);

 
  useEffect(() => {
    if (!open) return;
    const away = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const openList = () => {
    setHi(
      Math.max(
        0,
        items.findIndex((i) => i.value === value),
      ),
    );
    setOpen(true);
  };
  const pick = (item) => {
    onChange(item.value);
    setOpen(false);
  };
  const onKeyDown = (e) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); 
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(items.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setHi(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHi(items.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(items[hi]);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="fm-dropdown" ref={box}>
      <button
        type="button"
        id={id}
        role="combobox"
        className="fm-input fm-dropdown__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-opt-${hi}` : undefined}
        aria-describedby={describedBy}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className={current ? "" : "fm-dropdown__placeholder"}>
          {current ? current.label : placeholder}
        </span>
        <ChevronDown size={18} className="fm-dropdown__chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul id={`${id}-list`} role="listbox" className="fm-dropdown__list">
          {items.map((it, i) => (
            <li
              key={it.value}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={it.value === value}
              className={`fm-dropdown__option${i === hi ? " is-highlighted" : ""}${it.value === value ? " is-selected" : ""}`}
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(it)}
            >
              <span>{it.label}</span>
              {it.value === value && <Check size={16} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const pad2 = (n) => String(n).padStart(2, "0");
const toIso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromIso = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const niceDate = (d) => `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;

export function DatePicker({ id, value, onChange, min, max }) {
  const selected = fromIso(value);
  const todayIso = toIso(new Date());
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const b = selected || new Date();
    return { y: b.getFullYear(), m: b.getMonth() };
  });
  const box = useRef(null);

  
  useEffect(() => {
    if (!open) return;
    const away = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openCal = () => {
    const b = selected || new Date();
    setView({ y: b.getFullYear(), m: b.getMonth() });
    setOpen(true);
  };
  const shift = (n) =>
    setView((v) => {
      const d = new Date(v.y, v.m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const pick = (d) => {
    onChange(toIso(d));
    setOpen(false);
  };

  
  const first = new Date(view.y, view.m, 1);
  const cells = Array.from(
    { length: 42 },
    (_, i) => new Date(view.y, view.m, 1 - first.getDay() + i),
  );
  const blocked = (iso) => (min && iso < min) || (max && iso > max);

  return (
    <div className="fm-cal" ref={box}>
      <button
        type="button"
        id={id}
        className="fm-input fm-cal__button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openCal())}
      >
        <Calendar size={18} aria-hidden="true" />
        <span>{selected ? niceDate(selected) : "Pick a date"}</span>
      </button>
      {open && (
        <div className="fm-cal__popup" role="dialog" aria-label="Choose a date">
          <div className="fm-cal__head">
            <button
              type="button"
              className="fm-btn fm-btn--light fm-cal__nav"
              onClick={() => shift(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft size={18} />
            </button>
            <p className="fm-cal__title" aria-live="polite">
              {MONTHS[view.m]} {view.y}
            </p>
            <button
              type="button"
              className="fm-btn fm-btn--light fm-cal__nav"
              onClick={() => shift(1)}
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="fm-cal__grid" role="grid">
            {WEEKDAYS.map((w) => (
              <span key={w} className="fm-cal__dow" aria-hidden="true">
                {w}
              </span>
            ))}
            {cells.map((d) => {
              const iso = toIso(d);
              const cls = [
                "fm-cal__day",
                d.getMonth() !== view.m && "is-outside",
                iso === todayIso && "is-today",
                iso === value && "is-selected",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={iso}
                  type="button"
                  className={cls}
                  disabled={blocked(iso)}
                  aria-pressed={iso === value}
                  aria-label={`${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`}
                  onClick={() => pick(d)}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="fm-cal__foot">
            <button
              type="button"
              className="fm-btn fm-btn--accent fm-cal__today"
              disabled={blocked(todayIso)}
              onClick={() => pick(new Date())}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const SHARED_MARKS = import.meta.glob("../assets/sidebar-{hover,active}.png", {
  eager: true,
  import: "default",
});
const PAGE_MARKS = import.meta.glob("../assets/sidebar-*-{hover,active}.png", {
  eager: true,
  import: "default",
});
const markImg = (key, state) =>
  PAGE_MARKS[`../assets/sidebar-${key}-${state}.png`] ||
  SHARED_MARKS[`../assets/sidebar-${state}.png`];


const initials = (u) =>
  `${(u?.firstName || "")[0] || ""}${(u?.lastName || "")[0] || ""}`.toUpperCase() || "?";


const USER_KEY = "fm-user";
const readCachedUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
};


export function Sidebar({ active = "home", user, onHome }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (!isWide()) return true; 
    try {
      return localStorage.getItem(NAV_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!isWide()) return;
    try {
      localStorage.setItem(NAV_KEY, collapsed ? "1" : "0");
    } catch {
      
    }
  }, [collapsed]);

  
  const [cssOld, setCssOld] = useState(false);
  useEffect(() => {
    setCssOld(
      getComputedStyle(document.documentElement).getPropertyValue("--fm-css-version").trim() !==
        CSS_VERSION,
    );
  }, []);

  const [askLogout, setAskLogout] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false); 
  const [cachedUser] = useState(readCachedUser);
  const hasUser = !!(user && (user.firstName || user.lastName || user.username));
  const shownUser = hasUser ? user : cachedUser;
  useEffect(() => {
    if (!hasUser) return;
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
    
    }
  }, [user, hasUser]);

  useEffect(() => setAvatarFailed(false), [shownUser?.avatarUrl]);
  const avatarUri = useAvatarUri(shownUser?.avatar);
  const name = shownUser ? `${shownUser.firstName} ${shownUser.lastName}`.trim() : "";

  return (
    <>
      <nav aria-label="Main" className={`fm-nav${collapsed ? " fm-nav--collapsed" : ""}`}>
        <div className="fm-nav__top">
          <button
            type="button"
            className="fm-btn fm-btn--light fm-nav__toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          >
            <Menu size={18} className="fm-only-phone" />
            {collapsed ? (
              <ChevronsRight size={18} className="fm-only-wide" />
            ) : (
              <ChevronsLeft size={18} className="fm-only-wide" />
            )}
          </button>
  
          <div className="fm-nav__logo">
            <Img src={sidebarLogo} alt="FarMe" className="fm-logo" label="logo banner" />
          </div>
        </div>

        <div className="fm-nav__body">
          {}
          <div className="fm-nav__links">
            {NAV_LINKS.map((l) => {
              const hoverImg = markImg(l.key, "hover");
              const activeImg = markImg(l.key, "active") || hoverImg; 
              return (
                <a
                  key={l.key}
                  href={l.href}
                  title={l.label}
                  aria-label={l.label}
                  aria-current={active === l.key ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();

                    if (active === "dashboard" && l.key === "dashboard" && onHome) {
                      onHome();
                      return;
                    }

                    if (window.location.pathname !== l.href) {
                      window.history.pushState({}, "", l.href);
                      window.dispatchEvent(new PopStateEvent("popstate"));
                    }
                  }}
                  className={`fm-nav__link${active === l.key ? " fm-nav__link--active" : ""}`}
                >
                  <span className="fm-nav__icon">
                    <Img src={l.img} alt="" w={28} h={28} label="icon" />
                  </span>
                  <span className="fm-nav__label">{l.label}</span>
                  {}
                  <span className="fm-nav__mark" style={MARK} aria-hidden="true">
                    {hoverImg && (
                      <img
                        src={hoverImg}
                        alt=""
                        draggable={false}
                        style={{ ...MARK, objectFit: "contain" }}
                        className="fm-nav__mark-img fm-nav__mark-img--hover"
                      />
                    )}
                    {activeImg && (
                      <img
                        src={activeImg}
                        alt=""
                        draggable={false}
                        style={{ ...MARK, objectFit: "contain" }}
                        className="fm-nav__mark-img fm-nav__mark-img--active"
                      />
                    )}
                  </span>
                </a>
              );
            })}
          </div>

          {}
          <div className="fm-nav__footer">
            <div className="fm-user" title={name}>
              <span className="fm-user__avatar" aria-hidden="true">
                {!shownUser ? null : avatarUri ? (
                  <img src={avatarUri} alt="" draggable={false} />
                ) : shownUser.avatarUrl && !avatarFailed ? (
                  <img src={shownUser.avatarUrl} alt="" draggable={false} onError={() => setAvatarFailed(true)} />
                ) : (
                  initials(shownUser)
                )}
              </span>
              <span className="fm-user__text">
                <span className="fm-user__name">{name || "\u00A0"}</span>
                <span className="fm-user__role">{shownUser ? shownUser.role || "Farmer" : "\u00A0"}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAskLogout(true)}
              className="fm-btn fm-btn--light fm-nav__logout"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={18} />
              <span className="fm-nav__label">Log out</span>
            </button>
          </div>
        </div>
      </nav>

      {cssOld && (
        <p
          role="alert"
          style={{
            position: "fixed",
            left: 8,
            right: 8,
            bottom: 8,
            zIndex: 60,
            margin: 0,
            padding: "8px 12px",
            background: "#fff3cd",
            border: "2px solid #c4866d",
            borderRadius: 8,
            font: "14px sans-serif",
            color: "#202808",
          }}
        >
          shared.css is out of date. Replace src/components/shared.css with the latest version,
          save, and refresh. (This message goes away on its own.)
        </p>
      )}
      {}
      {askLogout && (
        <ConfirmModal
          title="Log out?"
          message="You'll need to log in again to see your farm."
          confirmLabel="Log out"
          onConfirm={() => {
            
            try {
              localStorage.removeItem(USER_KEY);
            } catch {
              
            }
            clearAvatarCache();
            logout();
          }}
          onClose={() => setAskLogout(false)}
        />
      )}
    </>
  );
}


const POS_VERSION = 2;
const DEFAULT_POS = { right: 16, bottom: 80 };

const clampPos = (p) => ({
  right: Math.min(Math.max(8, p.right), window.innerWidth - BUBBLE - 8),
  bottom: Math.min(Math.max(8, p.bottom), window.innerHeight - BUBBLE - 8),
});

const SUGGESTIONS = [
  "What should I plant now?",
  "How often should I water?",
  "What's the 3-day forecast?",
];

export function ChatHead({ context, suggestions, hint }) {
  const [saved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CHAT_KEY) || "{}");
    } catch {
      return {};
    }
  });
  const [open, setOpen] = useState(!!saved.open);
  const [expanded, setExpanded] = useState(false); 
  const [messages, setMessages] = useState(saved.messages || []);
  const [conversationId, setConversationId] = useState(
  saved.conversationId || null
  );
  const [askClear, setAskClear] = useState(false);
  const [pos, setPos] = useState(
    saved.posVersion === POS_VERSION && saved.pos ? saved.pos : DEFAULT_POS,
  );
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const drag = useRef(null); 
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
        localStorage.setItem(
        CHAT_KEY,
        JSON.stringify({
          open,
          pos,
          posVersion: POS_VERSION,
          messages: messages.slice(-50),
          conversationId,
        })
      );
    } catch {
      
    }
  }, [open, pos, messages, conversationId]);

  useEffect(() => {
    const fit = () => setPos((p) => clampPos(p));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    if (isWide()) inputRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, busy, open]);

  const onPointerDown = (e) => {
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      right: pos.right,
      bottom: pos.bottom,
      down: true,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || !d.down) return;
    if (e.pointerType === "mouse" && e.buttons === 0) {
      d.down = false; 
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return; 
    d.moved = true;
    setPos(clampPos({ right: d.right - dx, bottom: d.bottom - dy }));
  };
  const onPointerUp = () => {
    if (drag.current) drag.current.down = false;
  };
  const onClick = () => {
    const wasDrag = drag.current?.moved;
    drag.current = null;
    if (!wasDrag) setOpen((o) => !o);
  };

  
  const send = async (raw) => {
    const content = raw.trim();

    if (!content || busy) return;

    const next = [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: content,
      },
    ];

    setMessages(next);
    setText("");
    setBusy(true);

    try {
      const result = await sendChat({
        message: content,
        conversationId,
        context,
      });

      setConversationId(result.conversationId);

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.response,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: error.message || "Sorry, I couldn't reach the server. Please try again in a bit.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };


  const upper = pos.bottom > window.innerHeight / 2;
  const panelStyle = expanded
    ? {
        top: "2vh",
        right: "2vw",
        bottom: "2vh",
        left: "2vw",
        width: "auto",
        height: "auto",
        maxHeight: "none",
      }
    : {
        right: Math.max(8, Math.min(pos.right, window.innerWidth - 360 - 8)),
        ...(upper
          ? {
              top: window.innerHeight - pos.bottom + 8,
              maxHeight: `calc(100vh - ${window.innerHeight - pos.bottom + 16}px)`,
            }
          : {
              bottom: pos.bottom + BUBBLE + 8,
              maxHeight: `calc(100vh - ${pos.bottom + BUBBLE + 16}px)`,
            }),
      };

  return (
    <>
      {open && (
        <section className="fm-chat-panel" role="dialog" aria-label="FarMe chat" style={panelStyle}>
          <header className="fm-chat-head">
            <strong className="font-display text-lg">Sprout</strong>
            <span className="flex gap-2">
              <button
                type="button"
                className="fm-btn fm-btn--light !px-0 w-11 flex items-center justify-center"
                onClick={() => setExpanded((value) => !value)}
                aria-label={expanded ? "Restore chat size" : "Expand chat"}
                title={expanded ? "Restore" : "Expand"}
              >
                {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              {messages.length > 0 && (
                <button
                  type="button"
                  className="fm-btn fm-btn--light !px-3"
                  onClick={() => setAskClear(true)}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className="fm-btn fm-btn--light !px-0 w-11 flex items-center justify-center"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
              >
                <X size={18} />
              </button>
            </span>
          </header>

          <div className="fm-chat-log" role="log" aria-live="polite">
            {messages.length === 0 && (
              <>
                <p className="fm-msg fm-msg--bot">
                  Hi! Ask me anything about your plants, soil or the weather.
                </p>
                {hint && <p className="fm-msg fm-msg--bot">{hint}</p>}
                <div className="fm-chat-chips">
                  {(suggestions?.length ? suggestions : SUGGESTIONS).map((s) => (
                    <button key={s} type="button" className="fm-chip" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`fm-msg fm-msg--${m.role === "user" ? "user" : "bot"}`}>
                {m.role === "assistant" ? (
                  <ReactMarkdown
                    components={{
                      ul: ({ children }) => <ul className="fm-chat-list">{children}</ul>,
                      ol: ({ children }) => <ol className="fm-chat-list fm-chat-list--ordered">{children}</ol>,
                      li: ({ children }) => <li>{children}</li>,
                    }}
                  >
                    {m.text}
                  </ReactMarkdown>
                ) : (
                  m.text
                )}
              </div>
            ))}
            {busy && <p className="fm-msg fm-msg--bot">Typing…</p>}
            <div ref={endRef} />
          </div>

          <form
            className="fm-chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input
              ref={inputRef}
              className="fm-input"
              aria-label="Message"
              placeholder="Type a message"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="submit"
              className="fm-btn fm-btn--primary"
              disabled={busy || !text.trim()}
            >
              Send
            </button>
          </form>
        </section>
      )}

      {askClear && (
        <ConfirmModal
          title="Clear this chat?"
          message="All the messages in this conversation will be deleted. This can't be undone."
          confirmLabel="Clear chat"
          danger
          top
          onConfirm={() => {
            setMessages([]);
            setConversationId(null);
            setAskClear(false);
          }}
          onClose={() => setAskClear(false)}
        />
      )}

      {}
      <button
        type="button"
        className="fm-chat-bubble"
        style={{ right: pos.right, bottom: pos.bottom }}
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onDragStart={(e) => e.preventDefault()}
        onClick={onClick}
      >
        <Img src={chatbot} alt="" w={56} h={56} label="chat" />
      </button>
    </>
  );
}

export function SproutLoader({ label = "Loading", size = "md" }) {
  const cls = size === "sm" ? " fm-sprout--sm" : size === "fill" ? " fm-sprout--fill" : "";
  return (
    <div className={`fm-sprout${cls}`} role="status" aria-live="polite">
      <svg className="fm-sprout__svg" viewBox="0 0 64 64" aria-hidden="true">
        <path className="fm-sprout__stem" pathLength="1" d="M32 52 V30" />
        <path className="fm-sprout__leaf fm-sprout__leaf--l" d="M32 34 C20 34 13 26 13 17 C24 17 32 24 32 34 Z" />
        <path className="fm-sprout__leaf fm-sprout__leaf--r" d="M32 34 C44 34 51 26 51 17 C40 17 32 24 32 34 Z" />
        <path className="fm-sprout__soil" d="M8 60 C12 48 52 48 56 60 Z" />
      </svg>
      <span className="fm-sprout__label">
        {label}
        <span className="fm-sprout__dots" aria-hidden="true">
          <i>.</i>
          <i>.</i>
          <i>.</i>
        </span>
      </span>
    </div>
  );
}