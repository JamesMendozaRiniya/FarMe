// the register page: first name, last name, username, email, password + confirmation,
// and an optional avatar made with DiceBear. the card on the side shows who you will be in FarMe, live.
//
//   route:  <Route path="/register" element={<Register />} />   (in App.jsx: if (path.startsWith("/register")) return <Register />;)
//   needs:  npm i @dicebear/core @dicebear/styles
import { useRef, useState } from "react";
import { Check, Circle, Sparkles } from "lucide-react";
import "./register.css";
import logo from "../../assets/sidebar-logo.png";
import AvatarStudio from "../../components/avatar-studio";
import { startAvatar, useAvatarUri } from "../../components/avatar";
import { register } from "../../services/farmeApi"; // the call to the server (todo(backend) notes are there)

const LOGIN_HREF = "/login"; // our login page (App.jsx). change it if the route changes

// ---------- checks (the server must check again: these only help people early) ----------
const NAME_RE = /^[\p{L}][\p{L}\p{M}'’ .-]*$/u; // letters, plus spaces . - ' inside names
const USERNAME_RE = /^[a-z0-9_]+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_RULES = [
  { key: "len", label: "8 or more characters", test: (p) => p.length >= 8 },
  { key: "letter", label: "A letter", test: (p) => /\p{L}/u.test(p) },
  { key: "number", label: "A number", test: (p) => /\d/.test(p) },
];

const nameCheck = (label) => (v) => {
  const t = v.trim();
  if (!t) return `Enter your ${label}.`;
  if (t.length > 40) return `Your ${label} can have at most 40 characters.`;
  if (!NAME_RE.test(t)) return "Use letters only. Spaces, hyphens and apostrophes are fine.";
  return "";
};
const CHECKS = {
  firstName: nameCheck("first name"),
  lastName: nameCheck("last name"),
  username: (v) => {
    const t = v.trim();
    if (!t) return "Choose a username.";
    if (t.length < 3 || t.length > 20) return "Use 3 to 20 characters.";
    if (!USERNAME_RE.test(t)) return "Use only letters, numbers and underscores.";
    return "";
  },
  email: (v) => {
    const t = v.trim();
    if (!t) return "Enter your email.";
    if (!EMAIL_RE.test(t)) return "That email doesn't look right. It should look like name@example.com.";
    return "";
  },
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
const FIELDS = Object.keys(CHECKS); // also the order of the form, used to jump to the first mistake

const EMPTY = { firstName: "", lastName: "", username: "", email: "", password: "", confirm: "" };
const initialsOf = (first, last) => `${first.trim()[0] || ""}${last.trim()[0] || ""}`.toUpperCase();

// ---------- small pieces ----------
// label + input + one line under it that shows the mistake, or the hint when there is none
function TextField({ id, label, error, hint, ...input }) {
  const msg = `${id}-msg`;
  return (
    <div>
      <label htmlFor={id} className="block font-bold mb-1">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={msg}
        className={`fm-input${error ? " fm-reg-bad" : ""}`}
        {...input}
      />
      <p id={msg} role={error ? "alert" : undefined} className={`text-sm min-h-[20px] mt-1${error ? " fm-error" : ""}`}>
        {error || hint}
      </p>
    </div>
  );
}

// the card that updates while you type: it is what the sidebar will show once you are in
function FarmerCard({ first, last, username, avatarUri }) {
  const name = `${first.trim()} ${last.trim()}`.trim();
  const initials = initialsOf(first, last);
  const joined = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <aside className="fm-reg-id" aria-label="Preview of your FarMe card">
      <span className="fm-reg-id__slot" aria-hidden="true" />
      <div className="fm-reg-id__body">
        <div className="fm-reg-id__avatar">
          {avatarUri ? (
            <img key={avatarUri} src={avatarUri} alt="Your avatar" draggable={false} />
          ) : initials ? (
            <span className="font-display">{initials}</span>
          ) : (
            <Sparkles size={34} aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0">
          <p className={`fm-reg-id__name font-display${name ? "" : " is-empty"}`}>{name || "Your name"}</p>
          <p className={`fm-reg-id__user${username.trim() ? "" : " is-empty"}`}>@{username.trim() || "username"}</p>
          <p className="fm-reg-id__date">Joined {joined}</p>
        </div>
      </div>
    </aside>
  );
}

export default function Register() {
  const [values, setValues] = useState(EMPTY);
  const [touched, setTouched] = useState({}); // fields the person has left at least once
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({}); // from register()
  const [formError, setFormError] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | done
  const [showPw, setShowPw] = useState(false);
  const [avatar, setAvatar] = useState(null); // null = no avatar (initials are shown instead)
  const formRef = useRef(null);
  const avatarUri = useAvatarUri(avatar);

  const errors = Object.fromEntries(FIELDS.map((f) => [f, CHECKS[f](values[f], values)]));
  // a mistake only shows after the person left the field (or pressed Create account), never while they are still typing the first time
  const shown = (f) => (touched[f] || submitted ? serverErrors[f] || errors[f] : "");

  const change = (f) => (e) => {
    setValues((v) => ({ ...v, [f]: e.target.value }));
    if (serverErrors[f]) setServerErrors((s) => ({ ...s, [f]: "" }));
  };
  const blur = (f) => () => setTouched((t) => ({ ...t, [f]: true }));
  const field = (f) => ({
    id: `reg-${f}`,
    name: f,
    value: values[f],
    onChange: change(f),
    onBlur: blur(f),
    error: shown(f),
  });

  const submit = async (e) => {
    e.preventDefault();
    if (status === "saving") return;
    setSubmitted(true);
    setFormError("");
    const firstBad = FIELDS.find((f) => errors[f]);
    if (firstBad) {
      formRef.current?.querySelector(`#reg-${firstBad}`)?.focus();
      return;
    }
    setStatus("saving");
    try {
      await register({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        username: values.username.trim().toLowerCase(), // lowercase, so "Juan" and "juan" are the same username
        email: values.email.trim().toLowerCase(),
        password: values.password, // never trimmed: spaces can be part of a password
        avatar,
      });
      setStatus("done");
    } catch (err) {
      setStatus("idle");
      if (err?.fields) {
        setServerErrors(err.fields);
        const bad = FIELDS.find((f) => err.fields[f]);
        if (bad) formRef.current?.querySelector(`#reg-${bad}`)?.focus();
      } else {
        setFormError(err?.message || "We couldn't create your account. Check your connection and try again.");
      }
    }
  };

  const pwMatches = values.confirm !== "" && values.confirm === values.password;

  return (
    <main className="fm-reg">
      <div className="fm-reg__inner">
        <div className="fm-card fm-reg__card">
          <img src={logo} alt="FarMe" className="fm-reg__logo" />

          {status === "done" ? (
            // the account is made but nobody is logged in yet: the person goes to the login page
            <div className="fm-reg__done" role="status">
              <h1 className="font-display text-3xl font-bold">Welcome to FarMe, {values.firstName.trim()}.</h1>
              <p>Your account is ready. Log in to set up your first field.</p>
              <a href={LOGIN_HREF} className="fm-btn fm-btn--primary fm-reg__cta">
                Log in
              </a>
            </div>
          ) : (
            <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
              <div>
                <h1 className="font-display text-3xl font-bold leading-tight">Create your account</h1>
                <p className="mt-1">Keep your fields, harvests and notes in one place.</p>
              </div>

              <div className="fm-reg__pair">
                <TextField {...field("firstName")} label="First name" autoComplete="given-name" maxLength={40} />
                <TextField {...field("lastName")} label="Last name" autoComplete="family-name" maxLength={40} />
              </div>
              <TextField
                {...field("username")}
                label="Username"
                autoComplete="username"
                maxLength={20}
                autoCapitalize="none"
                spellCheck={false}
                hint="3 to 20 letters, numbers or underscores."
              />
              <TextField
                {...field("email")}
                label="Email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
              />

              <div>
                <TextField
                  {...field("password")}
                  label="Password"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  maxLength={72}
                  hint=" "
                />
                <ul className="fm-reg-rules" aria-label="Password rules">
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
              <TextField
                {...field("confirm")}
                label="Confirm password"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                maxLength={72}
                hint={pwMatches ? "The passwords match." : " "}
              />
              <label className="fm-reg-toggle">
                <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
                Show passwords
              </label>

              <section aria-labelledby="reg-avatar-title" className="fm-reg-avatar">
                <h2 id="reg-avatar-title" className="font-display text-xl font-bold">
                  Your avatar <span className="font-sans text-base font-normal">(optional)</span>
                </h2>
                <p className="text-sm mb-3">Make a face for your card with DiceBear. You can skip this and add one later.</p>
                {avatar ? (
                  <AvatarStudio avatar={avatar} onChange={setAvatar} onRemove={() => setAvatar(null)} />
                ) : (
                  <button type="button" onClick={() => setAvatar(startAvatar())} className="fm-btn fm-btn--light flex items-center gap-2">
                    <Sparkles size={16} aria-hidden="true" /> Create my avatar
                  </button>
                )}
              </section>

              {formError && (
                <p role="alert" className="fm-reg-formerror fm-error">
                  {formError}
                </p>
              )}
              <button type="submit" disabled={status === "saving"} aria-busy={status === "saving"} className="fm-btn fm-btn--primary fm-reg__cta">
                {status === "saving" ? "Creating your account…" : "Create account"}
              </button>
              <p className="text-center">
                Already have an account?{" "}
                <a href={LOGIN_HREF} className="fm-reg-link">
                  Log in
                </a>
              </p>
            </form>
          )}
        </div>

        <FarmerCard first={values.firstName} last={values.lastName} username={values.username} avatarUri={avatarUri} />
      </div>
    </main>
  );
}