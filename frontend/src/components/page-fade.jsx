// smooth changes between the register, login, forgot password and reset password pages.
// use it in place of <main> on those pages:
//   <PageFade className="fm-login"> ... </PageFade>
// what it does:
//   - every time the page opens, what is inside fades in and rises a little (see page-fade.css)
//   - when a link goes to one of the other pages, the page fades out first (about 0.22 s), then the browser goes there.
//     the links stay normal <a href>, so right click, "open in new tab" and ctrl+click still work.
// people who turned on "reduce motion" get no animation and no waiting.
import { useEffect, useState } from "react";
import "./page-fade.css";

const PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];
const LEAVE_MS = 220; // keep the same as the fm-page-out time in page-fade.css

export default function PageFade({ className = "", children }) {
  const [leaving, setLeaving] = useState(false);

  // the back button can bring this page back from the browser's memory still faded out: show it again
  useEffect(() => {
    const show = (e) => e.persisted && setLeaving(false);
    window.addEventListener("pageshow", show);
    return () => window.removeEventListener("pageshow", show);
  }, []);

  // one listener for every link inside the page (the click bubbles up to here)
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