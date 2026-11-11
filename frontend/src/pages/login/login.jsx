// the login page: username or email + password. the sprout on the side reacts to what you do:
// it follows the pointer while the pointer is on its side, looks down while you type, covers its eyes
// for the password, smiles at the Login button and gets a shock when the login fails
// (the sprout itself is components/sprout, its pictures are in assets/sprout).
//
//   route:  <Route path="/login" element={<Login />} />   (in App.jsx: if (path.startsWith("/login")) return <Login />;)
//   needs:  npm i lucide-react
import { useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./login.css";
import logo from "../../assets/sidebar-logo.png";
import Sprout from "../../components/sprout";
import { login } from "../../services/farmeApi"; // the call to the server (todo(backend) notes are there)
import PageFade from "../../components/page-fade"; // fades between the register / login / forgot / reset pages

const AFTER_LOGIN_HREF = "/home";
const REGISTER_HREF = "/register";
const FORGOT_HREF = "/forgot-password"; // change to our reset-password route

const SHOCK_MS = 2600; // how long the sprout stays shocked

// the server must check again: this only helps people early.
// we only check that something was typed. the password rules belong to register, and an old account may not follow them.
const CHECKS = {
  identifier: (v) => (v.trim() ? "" : "Enter your username or email."),
  password: (v) => (v ? "" : "Enter your password."),
};
const FIELDS = Object.keys(CHECKS);

// the line under a field for the mistake (it takes no room while there is none)
function Message({ id, error }) {
  return (
    <p id={id} role={error ? "alert" : undefined} className={`text-sm${error ? " mt-1 fm-error" : ""}`}>
      {error}
    </p>
  );
}

export default function Login() {
  const [values, setValues] = useState({ identifier: "", password: "", remember: false });
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving
  const [showPw, setShowPw] = useState(false);
  const [focused, setFocused] = useState(null); // "id" | "pw" | "btn" | null
  const [hovered, setHovered] = useState(null); // same, for the mouse
  const [shock, setShock] = useState(0); // counts up on every failure so the shake can run again
  const formRef = useRef(null);
  const shockTimer = useRef(0);

  const errors = Object.fromEntries(FIELDS.map((f) => [f, CHECKS[f](values[f])]));
  const shown = (f) => (submitted ? serverErrors[f] || errors[f] : serverErrors[f] || "");

  const change = (f) => (e) => {
    setValues((v) => ({ ...v, [f]: e.target.value }));
    if (serverErrors[f]) setServerErrors((s) => ({ ...s, [f]: "" }));
    if (formError) setFormError("");
  };

  // the sprout gets a shock for a moment. every failure counts up so it shakes again even if it was already shocked.
  const fail = () => {
    setShock((n) => n + 1);
    window.clearTimeout(shockTimer.current);
    shockTimer.current = window.setTimeout(() => setShock(0), SHOCK_MS);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (status === "saving") return;
    setSubmitted(true);
    setFormError("");
    const firstBad = FIELDS.find((f) => errors[f]);
    if (firstBad) {
      fail();
      formRef.current?.querySelector(`#login-${firstBad}`)?.focus();
      return;
    }
    setStatus("saving");
    try {
      await login({
        identifier: values.identifier.trim(),
        password: values.password, // never trimmed: spaces can be part of a password
        remember: values.remember,
      });
      window.location.assign(AFTER_LOGIN_HREF);
    } catch (err) {
      setStatus("idle");
      fail();
      if (err?.fields) {
        setServerErrors(err.fields);
        const bad = FIELDS.find((f) => err.fields[f]);
        if (bad) formRef.current?.querySelector(`#login-${bad}`)?.focus();
      } else {
        setFormError(err?.message || "We couldn't log you in. Check your connection and try again.");
      }
    }
  };

  // what the sprout does. the first one that fits wins.
  const active = (k) => focused === k || hovered === k;
  const mood = shock
    ? "shocked"
    : focused === "pw"
      ? showPw
        ? "peek"
        : "cover"
      : hovered === "pw"
        ? "peek"
        : active("id")
          ? "typing"
          : active("btn")
            ? "happy"
            : "auto";

  // hover for the mouse only (a tap on a phone would leave the sprout stuck). focus works for everyone.
  const spot = (k) => ({
    onPointerEnter: (e) => e.pointerType === "mouse" && setHovered(k),
    onPointerLeave: () => setHovered((h) => (h === k ? null : h)),
    onFocus: () => setFocused(k),
    onBlur: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setFocused((f) => (f === k ? null : f));
    },
  });

  const idErr = shown("identifier");
  const pwErr = shown("password");

  return (
    <PageFade className="fm-login">
      <div className="fm-card fm-login__card">
        {/* the sprout side: the sprout follows the pointer while it is anywhere on this side */}
        <section className="fm-login__mascot" aria-label="Your FarMe sprout">
          <Sprout mood={mood} />
        </section>

        {/* the form side. the three spot(...) wrappers tell the sprout where the pointer or the focus is */}
        <div className="fm-login__formside">
          <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
            <div className="fm-login__head">
              <div>
                <h1 className="font-display text-3xl font-bold leading-tight">Welcome back</h1>
                <p className="mt-1">Log in to see your fields.</p>
              </div>
              <img src={logo} alt="FarMe" className="fm-login__logo" />
            </div>

            <div {...spot("id")}>
              <label htmlFor="login-identifier" className="block font-bold mb-1">
                Username or email
              </label>
              <input
                id="login-identifier"
                name="identifier"
                value={values.identifier}
                onChange={change("identifier")}
                aria-invalid={idErr ? "true" : "false"}
                aria-describedby="login-identifier-msg"
                className={`fm-input${idErr ? " fm-login-bad" : ""}`}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
              />
              <Message id="login-identifier-msg" error={idErr} />
            </div>

            <div {...spot("pw")}>
              <label htmlFor="login-password" className="block font-bold mb-1">
                Password
              </label>
              <div className="fm-login-pw">
                <input
                  id="login-password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  value={values.password}
                  onChange={change("password")}
                  aria-invalid={pwErr ? "true" : "false"}
                  aria-describedby="login-password-msg"
                  className={`fm-input${pwErr ? " fm-login-bad" : ""}`}
                  autoComplete="current-password"
                  maxLength={72}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  aria-pressed={showPw}
                  className="fm-login-eye"
                >
                  {showPw ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                </button>
              </div>
              <Message id="login-password-msg" error={pwErr} />
            </div>

            <div className="fm-login__row">
              <label className="fm-login-toggle">
                <input type="checkbox" checked={values.remember} onChange={(e) => setValues((v) => ({ ...v, remember: e.target.checked }))} />
                Remember me
              </label>
              <a href={FORGOT_HREF} className="fm-login-link">
                Forgot password?
              </a>
            </div>

            {formError && (
              <p role="alert" className="fm-login-formerror fm-error">
                {formError}
              </p>
            )}

            <span className="block" {...spot("btn")}>
              <button type="submit" disabled={status === "saving"} aria-busy={status === "saving"} className="fm-btn fm-btn--primary fm-login__cta">
                {status === "saving" ? "Logging in…" : "Log in"}
              </button>
            </span>

            <p className="text-center">
              Don't have an account?{" "}
              <a href={REGISTER_HREF} className="fm-login-link">
                Sign up
              </a>
            </p>
          </form>
        </div>
      </div>
    </PageFade>
  );
}