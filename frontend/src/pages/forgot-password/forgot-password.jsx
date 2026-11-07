// the forgot password page: the person types their email and we send a link to choose a new password.
// the link opens the reset page (/reset-password?token=...). same look as the login page (it uses login.css).
// the picture on the side is a gif (assets/sprout/awkward.gif) that just keeps playing. no sprout here, so nothing reacts.
//
//   route:  in App.jsx: if (path.startsWith("/forgot-password")) return <ForgotPassword />;
import { useRef, useState } from "react";
import "../login/login.css";
import logo from "../../assets/sidebar-logo.png";
import awkward from "../../assets/sprout/awkward.gif";
import { forgotPassword } from "../../services/farmeApi"; // the call to the server (todo(backend) notes are there)
import PageFade from "../../components/page-fade"; // fades between the register / login / forgot / reset pages

const LOGIN_HREF = "/login";

// the server must check again: this only helps people early
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const checkEmail = (v) => {
  const t = v.trim();
  if (!t) return "Enter your email.";
  if (!EMAIL_RE.test(t)) return "That email doesn't look right. It should look like name@example.com.";
  return "";
};

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | done
  const inputRef = useRef(null);

  const error = submitted ? checkEmail(email) : "";

  const submit = async (e) => {
    e.preventDefault();
    if (status === "saving") return;
    setSubmitted(true);
    setFormError("");
    if (checkEmail(email)) {
      inputRef.current?.focus();
      return;
    }
    setStatus("saving");
    try {
      await forgotPassword({ email: email.trim().toLowerCase() });
      setStatus("done"); // the same message shows whether or not the email has an account (see farmeApi.js)
    } catch (err) {
      setStatus("idle");
      setFormError(err?.message || "We couldn't send the link. Check your connection and try again.");
    }
  };

  return (
    <PageFade className="fm-login">
      <div className="fm-card fm-login__card">
        {/* the picture side: a gif that keeps playing (the image is decoration, so it has an empty alt) */}
        <section className="fm-login__mascot">
          <img src={awkward} alt="" className="fm-login__gif" draggable={false} />
        </section>

        <div className="fm-login__formside">
          <img src={logo} alt="FarMe" className="fm-login__logo" />

          {status === "done" ? (
            <div className="fm-login__done" role="status">
              <h1 className="font-display text-3xl font-bold leading-tight">Check your email</h1>
              <p>
                If <strong className="break-all">{email.trim()}</strong> has a FarMe account, we sent a link to choose a new password. It can take a few
                minutes, so look in your spam folder too.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setSubmitted(false);
                }}
                className="fm-btn fm-btn--light fm-login__cta"
              >
                Use a different email
              </button>
              <p className="text-center">
                <a href={LOGIN_HREF} className="fm-login-link">
                  Back to log in
                </a>
              </p>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <div>
                <h1 className="font-display text-3xl font-bold leading-tight">Forgot your password?</h1>
                <p className="mt-1">Type your email and we'll send you a link to choose a new one.</p>
              </div>

              <div>
                <label htmlFor="forgot-email" className="block font-bold mb-1">
                  Email
                </label>
                <input
                  ref={inputRef}
                  id="forgot-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (formError) setFormError("");
                  }}
                  aria-invalid={error ? "true" : "false"}
                  aria-describedby="forgot-email-msg"
                  className={`fm-input${error ? " fm-login-bad" : ""}`}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={254}
                />
                <p id="forgot-email-msg" role={error ? "alert" : undefined} className={`text-sm${error ? " mt-1 fm-error" : ""}`}>
                  {error}
                </p>
              </div>

              {formError && (
                <p role="alert" className="fm-login-formerror fm-error">
                  {formError}
                </p>
              )}

              <button type="submit" disabled={status === "saving"} aria-busy={status === "saving"} className="fm-btn fm-btn--primary fm-login__cta">
                {status === "saving" ? "Sending…" : "Send me the link"}
              </button>

              <p className="text-center">
                Remembered it?{" "}
                <a href={LOGIN_HREF} className="fm-login-link">
                  Log in
                </a>
              </p>
            </form>
          )}
        </div>
      </div>
    </PageFade>
  );
}