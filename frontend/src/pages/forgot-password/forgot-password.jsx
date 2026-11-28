import { useRef, useState } from "react";
import "../login/login.css";
import "./forgot-password.css";
import logo from "../../assets/sidebar-logo.png";
import awkward from "../../assets/sprout/awkward.gif";
import { forgotPassword } from "../../services/farmeApi";
import PageFade from "../../components/page-fade";

const LOGIN_HREF = "/login";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const checkEmail = (v) => {
  const t = v.trim();

  if (!t) return "Enter your email.";

  if (!EMAIL_RE.test(t)) {
    return "That email doesn't look right. It should look like name@example.com.";
  }

  return "";
};

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [status, setStatus] = useState("idle");

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
      await forgotPassword({
        email: email.trim().toLowerCase(),
      });

      setStatus("done");
    } catch (err) {
      setStatus("idle");
      setFormError(
        err?.message ||
          "We couldn't send the link. Check your connection and try again."
      );
    }
  };

  return (
    <PageFade className="fm-login">
      <div className="fm-card fm-login__card">
        <section className="fm-login__mascot">
          <img
            src={awkward}
            alt=""
            className="fm-login__gif"
            draggable={false}
          />
        </section>

        <div className="fm-login__formside">
          <img src={logo} alt="FarMe" className="fm-login__logo" />

          {status === "done" ? (
            <div className="fm-login__done" role="status">
              <h1 className="font-display text-3xl font-bold leading-tight">
                Check your email
              </h1>

              <p>
                If{" "}
                <strong className="break-all">{email.trim()}</strong> has a
                FarMe account, we've sent a link to help you create a new
                password.
              </p>

              <div className="fm-spam-notice" role="note">
                <span aria-hidden="true">⚠️</span>
                <p>
                  <strong>Check your Spam folder</strong> if you don't see our
                  email in your Inbox. If found, click{" "}
                  <strong>"Report not spam"</strong>.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setSubmitted(false);
                  setFormError("");
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
                <h1 className="font-display text-3xl font-bold leading-tight">
                  Forgot your password?
                </h1>

                <p className="mt-1">
                  Type your email and we'll send you a link to choose a new
                  one.
                </p>
              </div>

              <div>
                <label
                  htmlFor="forgot-email"
                  className="block font-bold mb-1"
                >
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

                <p
                  id="forgot-email-msg"
                  role={error ? "alert" : undefined}
                  className={`text-sm${error ? " mt-1 fm-error" : ""}`}
                >
                  {error}
                </p>
              </div>

              {formError && (
                <p role="alert" className="fm-login-formerror fm-error">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "saving"}
                aria-busy={status === "saving"}
                className="fm-btn fm-btn--primary fm-login__cta"
              >
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
