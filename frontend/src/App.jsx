import FarMeDashboard from "./pages/dashboard/dashboard";
import FarMeLibrary from "./pages/library/library";

export default function App() {
  const path = window.location.pathname;
  if (path.startsWith("/library")) return <FarMeLibrary />;
  return <FarMeDashboard />; // "/" and "/dashboard"
}