import FarMeDashboard from "./pages/dashboard/dashboard";
import FarMeLibrary from "./pages/library/library";
import Register from "./pages/register/register";
import Login from "./pages/login/login";

export default function App() {
  const path = window.location.pathname;
  if (path.startsWith("/library")) return <FarMeLibrary />;
  if (path.startsWith("/register")) return <Register />;
  if (path.startsWith("/login")) return <Login />;
  return <FarMeDashboard />; // "/" and "/dashboard"
}