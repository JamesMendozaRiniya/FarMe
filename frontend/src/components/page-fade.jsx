import { useEffect, useState } from "react";
import "./page-fade.css";

const PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];
const LEAVE_MS = 220; 

export default function PageFade({ className = "", children }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const show = (e) => e.persisted && setLeaving(false);
    window.addEventListener("pageshow", show);
    return () => window.removeEventListener("pageshow", show);
  }, []);

  
  const onClick = (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== "_self") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const url = new URL(a.href, window.location.href);
    if (url.origin !== window.location.origin || !PAGES.some((p) => url.pathname.startsWith(p))) return;
    e.preventDefault();
    setLeaving(true);
    window.setTimeout(() => window.location.assign(url.href), LEAVE_MS);
  };

  return (
    <main className={`${className} fm-page${leaving ? " is-leaving" : ""}`} onClick={onClick}>
      {children}
    </main>
  );
}