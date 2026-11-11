import { useEffect, useRef, useState } from "react";
import FarMeHome from "./pages/home/home";
import FarMeDashboard from "./pages/dashboard/dashboard";
import FarMeLibrary from "./pages/library/library";
import Register from "./pages/register/register";
import Login from "./pages/login/login";
import ForgotPassword from "./pages/forgot-password/forgot-password";
import ResetPassword from "./pages/reset-password/reset-password";
import Settings from "./pages/settings/settings";
import BgmPlayer from "./components/BgmPlayer";
import { getUser } from "./services/farmeApi";

const PUBLIC_PAGES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

// shown while the login is being checked, instead of plain text. it uses the shared skeleton (.fm-bone) from shared.css, same as the dashboard
function PageSkeleton() {
  return (
    <div className="min-h-screen bg-[#F1E7D2] p-3 sm:p-5 flex flex-col gap-4" aria-busy="true">
      <span className="sr-only">Loading</span>
      <span className="fm-bone" aria-hidden="true" style={{ height: "2.25rem", width: "12rem" }} />
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="fm-bone" aria-hidden="true" style={{ height: "11rem" }} />
        ))}
      </div>
    </div>
  );
}

// remembered for this tab only: once the server has confirmed the login, moving between pages doesn't show the
// loading screen again (the check still runs quietly in the background)
const AUTH_KEY = "fm-signed-in";
const wasSignedIn = () => {
  try {
    return sessionStorage.getItem(AUTH_KEY) === "1";
  } catch {
    return false;
  }
};
const rememberSignedIn = (on) => {
  try {
    if (on) sessionStorage.setItem(AUTH_KEY, "1");
    else sessionStorage.removeItem(AUTH_KEY);
  } catch {
    /* storage unavailable */
  }
};

function AppRoutes({ path, onAuth }) {
  const [status, setStatus] = useState(wasSignedIn() ? "authenticated" : "checking");
  const confirmedRef = useRef(false); // the server already confirmed this login

  useEffect(() => {
    if (PUBLIC_PAGES.some((page) => path.startsWith(page))) {
      setStatus("authenticated");
      confirmedRef.current = false; // signed out (or not yet in): check again next time
      rememberSignedIn(false);
      onAuth(false);
      return;
    }

    // already checked on an earlier page, so moving between pages needs no new check
    if (confirmedRef.current) {
      onAuth(true);
      return;
    }

    if (wasSignedIn()) onAuth(true); // confirmed earlier in this tab: no waiting

    let active = true;

    getUser()
      .then(() => {
        if (!active) return;
        setStatus("authenticated");
        confirmedRef.current = true;
        rememberSignedIn(true);
        onAuth(true); // the login check passed: the music is allowed to start
      })
      .catch((error) => {
        if (!active) return;

        if (error.status === 401) {
          rememberSignedIn(false);
          window.location.replace("/login");
          return;
        }

        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [path]);

  if (path.startsWith("/register")) return <Register />;
  if (path.startsWith("/login")) return <Login />;
  if (path.startsWith("/forgot-password")) return <ForgotPassword />;
  if (path.startsWith("/reset-password")) return <ResetPassword />;

  if (status === "checking") {
    return <PageSkeleton />;
  }

  if (status === "error") {
    return <div>Unable to verify your login session. Please refresh the page.</div>;
  }

  if (path.startsWith("/home")) return <FarMeHome />;
  if (path.startsWith("/library")) return <FarMeLibrary />;
  if (path.startsWith("/settings")) return <Settings />;

  return <FarMeDashboard />;
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [signedIn, setSignedIn] = useState(false); // true only after the server confirmed the login
  const onPublicPage = PUBLIC_PAGES.some((page) => path.startsWith(page));

  useEffect(() => {
    const handleNavigation = () => {
      setPath(window.location.pathname);
    };

    // links between our own pages (home -> farm, library, settings, mailbox) change the page without reloading the
    // whole app, so there is no loading screen in between and the music keeps playing
    const handleLinkClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      // read the attributes as text: the home page links are SVG <a> elements, where a.href and a.target are
      // objects (not strings), which made this handler skip them and let the browser reload the page
      const href = a?.getAttribute("href");
      if (!a || !href || a.getAttribute("target") || a.hasAttribute("download")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api")) return;
      // same page, only the #part differs: the browser handles it (the notification list listens for it)
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      window.history.pushState({}, "", url.pathname + url.search + url.hash);
      setPath(url.pathname);
      window.scrollTo(0, 0);
    };

    window.addEventListener("popstate", handleNavigation);
    document.addEventListener("click", handleLinkClick);

    return () => {
      window.removeEventListener("popstate", handleNavigation);
      document.removeEventListener("click", handleLinkClick);
    };
  }, []);

  return (
    <>
      <AppRoutes path={path} onAuth={setSignedIn} />
      {/* stays mounted so the music keeps playing between pages, but it only starts once you are
          signed in (never on login / register / password pages); the button only shows on home */}
      <BgmPlayer enabled={signedIn && !onPublicPage} showButton={path.startsWith("/home")} />
    </>
  );
}