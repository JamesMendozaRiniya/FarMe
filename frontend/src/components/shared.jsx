// the pieces every page can call: Img, Sidebar (collapsible nav) and ChatHead (floating chat bubble).
// how to use them on any page:
//   <Sidebar active="library" user={user} />
//   <ChatHead context={{ page: "library" }} />
import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import "./shared.css";
import { logout, sendChat } from "../services/farmeApi";

// nav images. heads up: vite needs the file extension (.png) in these imports
import sidebarLogo from "../assets/sidebar-logo.png";
import sidebarDashboard from "../assets/sidebar-dashboard.png";
import sidebarLibrary from "../assets/sidebar-library.png";
import sidebarSettings from "../assets/sidebar-settings.png";
import chatbot from "../assets/chatbot.png";

// nav links. library and settings are their own pages, so these are real links.
// change the hrefs to match our routes. with react-router, swap the <a href> for <NavLink to=...>.
const NAV_LINKS = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", img: sidebarDashboard },
  { key: "library", label: "Library", href: "/library", img: sidebarLibrary },
  { key: "settings", label: "Settings", href: "/settings", img: sidebarSettings },
];

// the nav, dropdown and dialogs need the newest shared.css (the one with --fm-css-version: 5).
// if the css is old or missing, i show a warning on screen so you know to replace it.
const CSS_VERSION = "5";
// size of the right-side nav image. i set the same variable in shared.css (:root), and fall back to 20px if it isn't found.
const MARK = { width: "var(--fm-mark-size, 20px)", height: "var(--fm-mark-size, 20px)" };

const NAV_KEY = "farme.nav.collapsed";
const CHAT_KEY = "farme.chat.v1";
const BUBBLE = 56; // chat bubble size in px
const isWide = () => window.matchMedia("(min-width: 768px)").matches; // tablet and up

// image with a fixed size. give it w + h in px, or w + ratio (like "2 / 1"), or a className that sets the size in css (the logo does this).
// if the file is missing it shows a dashed box of the same size, so the layout doesn't jump.
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

// ---------- modal (every popup uses this; the look is in shared.css: .fm-modal-*) ----------
// the page can't scroll while a popup is open. i count the open popups so this still works when they stack (edit form + "save changes?").
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
// props: title, onClose, wide = a wider dialog (for content like the crop suggestions)
export function Modal({ title, onClose, wide, children }) {
  // onClose changes on every render, so i keep the latest one in a ref and set the listeners up only once
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
    // clicking the dark area outside the dialog closes it too
    <div
      className="fm-modal-backdrop"
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

// "are you sure?" dialog, used instead of the browser's own confirm box.
// props: danger = red confirm button, onConfirm = what happens on yes, onClose = cancel
export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onClose,
}) {
  return (
    <Modal title={title} onClose={onClose}>
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

// ---------- dropdown ----------
// the browser's own <select> list can't be styled, so i built this one by hand (look: .fm-dropdown-* in shared.css).
// props: id (put the <label htmlFor> on it), value, onChange(value), options = ["Clay", ...] or [{ value, label }],
//        placeholder, describedBy = id of an error / hint element
// the list opens below the button and pushes the content down, so a dialog never cuts it off.
// keyboard: arrows move, enter / space picks, escape closes, home / end jump.
export function Select({ id, value, onChange, options, placeholder = "Select…", describedBy }) {
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0); // the highlighted option
  const box = useRef(null);
  const current = items.find((i) => i.value === value);

  // close when clicking or tapping outside
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
      e.stopPropagation(); // closes just the list, not the dialog around it
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

// ---------- date picker ----------
// the browser's own <input type="date"> popup can't be styled, so i built this one by hand (look: .fm-cal-* in shared.css).
// props: id (put the <label htmlFor> on it), value = "YYYY-MM-DD", onChange("YYYY-MM-DD"), min / max (optional, same format)
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

  // close when clicking or tapping outside, or on escape
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

  // always 6 weeks, so the popup stays the same height from month to month
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

// the little image on the right side of a nav link:
//   sidebar-hover.png   shows while hovering
//   sidebar-active.png  shows on the page you're on
// every link shares those two. for one page only, add sidebar-<page>-hover.png / sidebar-<page>-active.png
// (like sidebar-library-hover.png). missing files are skipped, so nothing breaks if one isn't there.
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

// initials for the avatar, like "FL"
const initials = (u) =>
  `${(u?.firstName || "")[0] || ""}${(u?.lastName || "")[0] || ""}`.toUpperCase() || "?";

// the nav: a top bar with a menu button on phones, a sidebar from tablet width up.
// the small toggle floats in front of the logo (see .fm-nav__toggle in shared.css) and collapses the nav:
// phones hide the links, tablets shrink to icons only (i remember it between pages).
// props: active = current page key, user = { firstName, lastName, role?, avatarUrl? } from the backend (no avatarUrl = initials),
//        onHome = optional, runs when the dashboard link is clicked while already on the dashboard
export function Sidebar({ active = "dashboard", user, onHome }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (!isWide()) return true; // phones always start closed
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
      /* storage blocked */
    }
  }, [collapsed]);

  // helper: warns on screen if shared.css is old or missing. safe to delete once everything works.
  const [cssOld, setCssOld] = useState(false);
  useEffect(() => {
    setCssOld(
      getComputedStyle(document.documentElement).getPropertyValue("--fm-css-version").trim() !==
        CSS_VERSION,
    );
  }, []);

  const [askLogout, setAskLogout] = useState(false);
  const name = user ? `${user.firstName} ${user.lastName}`.trim() : "";

  return (
    <>
      <nav aria-label="Main" className={`fm-nav${collapsed ? " fm-nav--collapsed" : ""}`}>
        <div className="fm-nav__top">
          {/* collapse / expand button: menu icon on phones, chevrons on tablet and up */}
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
          {/* page links */}
          <div className="fm-nav__links">
            {NAV_LINKS.map((l) => {
              const hoverImg = markImg(l.key, "hover");
              const activeImg = markImg(l.key, "active") || hoverImg; // no active image? reuse the hover one
              return (
                <a
                  key={l.key}
                  href={l.href}
                  title={l.label}
                  aria-label={l.label}
                  aria-current={active === l.key ? "page" : undefined}
                  onClick={(e) => {
                    if (active === "dashboard" && l.key === "dashboard" && onHome) {
                      e.preventDefault(); // already here: just go back to the slot list, no reload
                      onHome();
                    }
                  }}
                  className={`fm-nav__link${active === l.key ? " fm-nav__link--active" : ""}`}
                >
                  <span className="fm-nav__icon">
                    <Img src={l.img} alt="" w={28} h={28} label="icon" />
                  </span>
                  <span className="fm-nav__label">{l.label}</span>
                  {/* the image on the right side: shows on hover, and stays on the current page */}
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

          {/* bottom: user card (initials + name + role, from the backend) and log out */}
          <div className="fm-nav__footer">
            {name && (
              <div className="fm-user" title={name}>
                <span className="fm-user__avatar" aria-hidden="true">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" draggable={false} />
                  ) : (
                    initials(user)
                  )}
                </span>
                <span className="fm-user__text">
                  <span className="fm-user__name">{name}</span>
                  <span className="fm-user__role">{user.role || "Farmer"}</span>
                </span>
              </div>
            )}
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
      {askLogout && (
        <ConfirmModal
          title="Log out?"
          message="You'll need to log in again to see your farm."
          confirmLabel="Log out"
          onConfirm={() => logout()}
          onClose={() => setAskLogout(false)}
        />
      )}
    </>
  );
}

// keeps the bubble fully inside the window
const clampPos = (p) => ({
  right: Math.min(Math.max(8, p.right), window.innerWidth - BUBBLE - 8),
  bottom: Math.min(Math.max(8, p.bottom), window.innerHeight - BUBBLE - 8),
});

const SUGGESTIONS = ["What should I plant now?", "How often should I water?"];

export function ChatHead({ context }) {
  // restore what i saved on the last page
  const [saved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CHAT_KEY) || "{}");
    } catch {
      return {};
    }
  });
  const [open, setOpen] = useState(!!saved.open);
  const [messages, setMessages] = useState(saved.messages || []);
  const [askClear, setAskClear] = useState(false);
  const [pos, setPos] = useState(saved.pos || { right: 16, bottom: 16 }); // distance from the window's right / bottom edge
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const drag = useRef(null); // info about the drag in progress
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // save the chat whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify({ open, pos, messages: messages.slice(-50) }));
    } catch {
      /* storage blocked */
    }
  }, [open, pos, messages]);

  // keep the bubble inside the window when it gets resized or rotated
  useEffect(() => {
    const fit = () => setPos((p) => clampPos(p));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // escape closes the chat, and the newest message stays in view
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

  // drag handling (pointer events work for mouse, touch and pen)
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
      d.down = false; // the mouse button was released somewhere we didn't hear about: stop dragging
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return; // small wiggles still count as a tap
    d.moved = true;
    setPos(clampPos({ right: d.right - dx, bottom: d.bottom - dy }));
  };
  // pointer up, cancelled (the browser took over, like a native image drag) or capture lost: the drag is over.
  // without this the bubble kept following the mouse on hover.
  const onPointerUp = () => {
    if (drag.current) drag.current.down = false;
  };
  const onClick = () => {
    const wasDrag = drag.current?.moved;
    drag.current = null;
    if (!wasDrag) setOpen((o) => !o);
  };

  // send a message, then add the bot's reply
  const send = async (raw) => {
    const content = raw.trim();
    if (!content || busy) return;
    const next = [...messages, { id: crypto.randomUUID(), role: "user", text: content }];
    setMessages(next);
    setText("");
    setBusy(true);
    let reply;
    try {
      reply = await sendChat({
        messages: next.slice(-20).map((m) => ({ role: m.role, content: m.text })),
        context,
      });
    } catch {
      reply = "Sorry, I couldn't reach the server. Please try again in a bit.";
    }
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: reply }]);
    setBusy(false);
  };

  // desktop window: opens above the bubble, or below it when the bubble is in the top half of the screen
  const upper = pos.bottom > window.innerHeight / 2;
  const panelStyle = {
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
            <strong className="font-display text-lg">FarMe helper</strong>
            <span className="flex gap-2">
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
                <div className="fm-chat-chips">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="fm-chip" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
            {messages.map((m) => (
              <p key={m.id} className={`fm-msg fm-msg--${m.role === "user" ? "user" : "bot"}`}>
                {m.text}
              </p>
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
          onConfirm={() => {
            setMessages([]);
            setAskClear(false);
          }}
          onClose={() => setAskClear(false)}
        />
      )}

      {/* the bubble: just the chatbot image. drag it with the pointer */}
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