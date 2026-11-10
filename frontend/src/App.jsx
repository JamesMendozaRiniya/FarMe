import { useEffect, useState } from "react";
import FarMeHome from "./pages/home/home";
import FarMeDashboard from "./pages/dashboard/dashboard";
import FarMeLibrary from "./pages/library/library";
import Register from "./pages/register/register";
import Login from "./pages/login/login";
import ForgotPassword from "./pages/forgot-password/forgot-password";
import ResetPassword from "./pages/reset-password/reset-password";
import Settings from "./pages/settings/settings";
import { getUser } from "./services/farmeApi";

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    const handleNavigation = () => {
      setPath(window.location.pathname);
    };

    window.addEventListener("popstate", handleNavigation);

    return () => {
      window.removeEventListener("popstate", handleNavigation);
    };
  }, []);

  useEffect(() => {
    const publicPages = [
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
    ];

    if (publicPages.some((page) => path.startsWith(page))) {
      setStatus("authenticated");
      return;
    }

    let active = true;

    getUser()
      .then(() => {
        if (active) setStatus("authenticated");
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
  }, []);

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
