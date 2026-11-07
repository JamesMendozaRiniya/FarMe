// the reset password page: opened from the link in the email (/reset-password?token=...).
// the person chooses a new password, then goes to the login page. same look as the login page (it uses login.css).
// the sprout covers its eyes while you type a password (and peeks if you show it).
// pressing "Change password" first asks "are you sure?" (ConfirmModal), and only then saves.
//
//   route:  in App.jsx: if (path.startsWith("/reset-password")) return <ResetPassword />;
import { useRef, useState } from "react";
import { Check, Circle } from "lucide-react";
import "../login/login.css";
import logo from "../../assets/sidebar-logo.png";
import Sprout from "../../components/sprout";
import { ConfirmModal } from "../../components/shared"; // the "are you sure?" dialog used on the other pages
import { resetPassword } from "../../services/farmeApi"; // the call to the server (todo(backend) notes are there)
import PageFade from "../../components/page-fade"; // fades between the register / login / forgot / reset pages

const LOGIN_HREF = "/login";
const FORGOT_HREF = "/forgot-password";
const SHOCK_MS = 2600; // how long the sprout stays shocked

// same rules as the register page (the server must check again: these only help people early)
const PASSWORD_RULES = [
  { key: "len", label: "8 or more characters", test: (p) => p.length >= 8 },
  { key: "letter", label: "A letter", test: (p) => /\p{L}/u.test(p) },
  { key: "number", label: "A number", test: (p) => /\d/.test(p) },
];
const CHECKS = {
  password: (v) => {
    if (!v) return "Create a password.";
    if (v.length > 72) return "Use at most 72 characters.";
    const missing = PASSWORD_RULES.filter((r) => !r.test(v));
    return missing.length ? `Your password still needs: ${missing.map((r) => r.label.toLowerCase()).join(", ")}.` : "";
  },
  confirm: (v, all) => {
    if (!v) return "Type your password again.";
    if (v !== all.password) return "The passwords don't match.";
    return "";
  },
};
const FIELDS = Object.keys(CHECKS);

export default function ResetPassword() {
  // the token comes from the link in the email. the page never shows it or keeps it anywhere else.
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const [values, setValues] = useState({ password: "", confirm: "" });
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | done
  const [showPw, setShowPw] = useState(false);
  const [confirming, setConfirming] = useState(false); // the "are you sure?" dialog is open
  const [focused, setFocused] = useState(null); // "pw" | "btn" | null
  const [hovered, setHovered] = useState(null); // same, for the mouse
  const [shock, setShock] = useState(0); // counts up on every mistake so the shake can run again
  const formRef = useRef(null);
  const shockTimer = useRef(0);

  const errors = Object.fromEntries(FIELDS.map((f) => [f, CHECKS[f](values[f], values)]));
  const shown = (f) => (submitted ? errors[f] : "");

  const change = (f) => (e) => {
    setValues((v) => ({ ...v, [f]: e.target.value }));
    if (formError) setFormError("");
  };

  const fail = () => {
    setShock((n) => n + 1);
    window.clearTimeout(shockTimer.current);
    shockTimer.current = window.setTimeout(() => setShock(0), SHOCK_MS);
  };

  // step 1: check the fields. if they are fine, ask "are you sure?" before saving anything
  const submit = (e) => {
    e.preventDefault();
    if (status === "saving") return;
    setSubmitted(true);
    setFormError("");
    const firstBad = FIELDS.find((f) => errors[f]);
    if (firstBad) {
      fail();
      formRef.current?.querySelector(`#reset-${firstBad}`)?.focus();
      return;
    }
    setConfirming(true);
  };

  // step 2: the person said yes in the dialog
  const save = async () => {
    setConfirming(false);
    setStatus("saving");
    try {
      await resetPassword({ token, password: values.password }); // never trimmed: spaces can be part of a password
      setStatus("done");
    } catch (err) {
      setStatus("idle");
      fail();
      setFormError(err?.message || "We couldn't change your password. Check your connection and try again.");
    }
  };

  // what the sprout does. the first one that fits wins.
  const mood =
    status === "done"
      ? "happy"
      : shock
        ? "shocked"
        : focused === "pw"
          ? showPw
            ? "peek"
            : "cover"
          : hovered === "pw"
            ? "peek"
            : focused === "btn" || hovered === "btn"
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

  const pwType = showPw ? "text" : "password";
  const pwErr = shown("password");
  const confirmErr = shown("confirm");
  const pwMatches = values.confirm !== "" && values.confirm === values.password;

  let body;
  if (status === "done") {
    body = (
      <div className="fm-login__done" role="status">
        <h1 className="font-display text-3xl font-bold leading-tight">Password changed</h1>
        <p>You can log in with your new password now.</p>
        <a href={LOGIN_HREF} className="fm-btn fm-btn--primary fm-login__cta">
          Log in
        </a>
      </div>
    );
  } else if (!token) {
    // somebody opened /reset-password without the link from the email
    body = (
      <div className="fm-login__done" role="alert">
        <h1 className="font-display text-3xl font-bold leading-tight">This link isn't complete</h1>
        <p>Open the link from your email again, or ask us to send a new one.</p>
        <a href={FORGOT_HREF} className="fm-btn fm-btn--primary fm-login__cta">
          Send me a new link
        </a>
      </div>
    );
  } else {
    body = (
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold leading-tight">Choose a new password</h1>
          <p className="mt-1">Pick one you don't use anywhere else.</p>
        </div>

        {/* both password fields count as "the password" for the sprout */}
        <div {...spot("pw")} className="flex flex-col gap-4">
          <div>
            <label htmlFor="reset-password" className="block font-bold mb-1">
              New password
            </label>
            <input
              id="reset-password"
              name="password"
              type={pwType}
              value={values.password}
              onChange={change("password")}
              aria-invalid={pwErr ? "true" : "false"}
              aria-describedby="reset-password-msg"
              className={`fm-input${pwErr ? " fm-login-bad" : ""}`}
              autoComplete="new-password"
              maxLength={72}
            />
            <p id="reset-password-msg" role={pwErr ? "alert" : undefined} className={`text-sm${pwErr ? " mt-1 fm-error" : ""}`}>
              {pwErr}
            </p>
            <ul className="fm-login-rules" aria-label="Password rules">
              {PASSWORD_RULES.map((r) => {
                const ok = r.test(values.password);
                return (
                  <li key={r.key} className={ok ? "is-ok" : undefined}>
                    {ok ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}
                    {r.label}
                    <span className="sr-only">{ok ? " (done)" : " (not yet)"}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <label htmlFor="reset-confirm" className="block font-bold mb-1">
              Confirm new password
            </label>
            <input
              id="reset-confirm"
              name="confirm"
              type={pwType}
              value={values.confirm}
              onChange={change("confirm")}
              aria-invalid={confirmErr ? "true" : "false"}
              aria-describedby="reset-confirm-msg"
              className={`fm-input${confirmErr ? " fm-login-bad" : ""}`}
              autoComplete="new-password"
              maxLength={72}
            />
            <p id="reset-confirm-msg" role={confirmErr ? "alert" : undefined} className={`text-sm${confirmErr ? " mt-1 fm-error" : ""}`}>
              {confirmErr || (pwMatches ? "The passwords match." : "")}
            </p>
          </div>

          <label className="fm-login-toggle">
            <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
            Show passwords
          </label>
        </div>

        {formError && (
          <p role="alert" className="fm-login-formerror fm-error">
            {formError}{" "}
            <a href={FORGOT_HREF} className="fm-login-link">
              Ask for a new link
            </a>
          </p>
        )}

        <span className="block" {...spot("btn")}>
          <button type="submit" disabled={status === "saving"} aria-busy={status === "saving"} className="fm-btn fm-btn--primary fm-login__cta">
            {status === "saving" ? "Saving…" : "Change password"}
          </button>
        </span>
      </form>
    );
  }

  return (
    <PageFade className="fm-login">
      <div className="fm-card fm-login__card">
        {/* the sprout side: the sprout follows the pointer while it is anywhere on this side */}
        <section className="fm-login__mascot" aria-label="Your FarMe sprout">
          <Sprout mood={mood} />
        </section>

        <div className="fm-login__formside">
          <img src={logo} alt="FarMe" className="fm-login__logo" />
          {body}
        </div>
      </div>

      {confirming && (
        <ConfirmModal
          title="Change your password?"
          message="You'll use the new password the next time you log in."
          confirmLabel="Yes, change it"
          onConfirm={save}
          onClose={() => setConfirming(false)}
        />
      )}
    </PageFade>
  );
}