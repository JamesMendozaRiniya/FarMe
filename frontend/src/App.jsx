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

function AppRoutes({ path, onAuth }) {
  const [status, setStatus] = useState("checking");
  const confirmedRef = useRef(false); // the server already confirmed this login

  useEffect(() => {
    if (PUBLIC_PAGES.some((page) => path.startsWith(page))) {
      setStatus("authenticated");
      confirmedRef.current = false; // signed out (or not yet in): check again next time
      onAuth(false);
      return;
    }

    // already checked on an earlier page, so moving between pages needs no new check
    if (confirmedRef.current) {
      onAuth(true);
      return;
    }

    let active = true;

    getUser()
      .then(() => {
        if (!active) return;
        setStatus("authenticated");
        confirmedRef.current = true;
        onAuth(true); // the login check passed: the music is allowed to start
      })
      .catch((error) => {
        if (!active) return;

        if (error.status === 401) {
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
    return <div>Checking your login session...</div>;
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

    window.addEventListener("popstate", handleNavigation);

    return () => {
      window.removeEventListener("popstate", handleNavigation);
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