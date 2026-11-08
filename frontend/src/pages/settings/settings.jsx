//   route:  in App.jsx: if (path.startsWith("/settings")) return <Settings />;
//   needs:  npm i lucide-react @dicebear/core @dicebear/styles   (same as the register page)
import { useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon, User, Mail, Lock, Trash2, Check, Circle, Sparkles, ChevronDown } from "lucide-react";
import "./settings.css";
import { Sidebar, ChatHead, ConfirmModal, Modal } from "../../components/shared";
import AvatarStudio from "../../components/avatar-studio";
import { startAvatar, useAvatarUri } from "../../components/avatar";
import happyImg from "../../assets/sprout/happy.png"; // the sprout waves goodbye
import { getUser, updateProfile, changeEmail, changePassword, deleteAccount } from "../../services/farmeApi";

const REGISTER_HREF = "/register"; // where the person goes after the account is deleted
const FORGOT_HREF = "/forgot-password"; // for someone who doesn't remember the current password

// ---------- checks ----------
// these are the same as on the register page (todo: move them to one shared file, like the date helpers).
// the server must check again: these only help people early.
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
const usernameCheck = (v) => {
  const t = v.trim();
  if (!t) return "Choose a username.";
  if (t.length < 3 || t.length > 20) return "Use 3 to 20 characters.";
  if (!USERNAME_RE.test(t)) return "Use only letters, numbers and underscores.";
  return "";
};
const passwordCheck = (v) => {
  if (!v) return "Create a password.";
  if (v.length > 72) return "Use at most 72 characters.";
  const missing = PASSWORD_RULES.filter((r) => !r.test(v));
  return missing.length ? `Your password still needs: ${missing.map((r) => r.label.toLowerCase()).join(", ")}.` : "";
};

const initialsOf = (first, last) => `${first.trim()[0] || ""}${last.trim()[0] || ""}`.toUpperCase();
const SAVE_FAILED = "We couldn't save your changes. Check your connection and try again.";

// ---------- small pieces ----------
// label + input + one line under it that shows the mistake, or the hint when there is none.
// `extra` is something that stays under it whatever happens (we use it for the "forgot your password?" link)
function TextField({ id, label, error, hint, extra, ...input }) {
  const msg = `${id}-msg`;
  return (
    <div>
      <label htmlFor={id} className="block font-bold mb-1">
        {label}
      </label>
      <input id={id} aria-invalid={error ? "true" : "false"} aria-describedby={msg} className={`fm-input${error ? " fm-set__bad" : ""}`} {...input} />
      <p id={msg} role={error ? "alert" : undefined} className={`text-sm min-h-[20px] mt-1${error ? " fm-error" : ""}`}>
        {error || hint}
      </p>
      {extra}
    </div>
  );
}

// for the fields that ask for the CURRENT password: a way out for someone who forgot it.
// it goes to the forgot password page; after choosing a new password the person logs in again.
const ForgotLink = () => (
  <p className="fm-set__forgot">
    Forgot your password?{" "}
    <a href={FORGOT_HREF} className="fm-set__link">
      Reset it by email
    </a>
  </p>
);

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

// one card. on a phone every card starts folded and opens when its title is tapped
function Section({ id, icon: Icon, title, intro, danger, children }) {
  const mobile = useMediaQuery("(max-width: 767px)");
  const [open, setOpen] = useState(false);
  const bodyId = `${id}-body`;
  return (
    <section aria-labelledby={`${id}-title`} className={`fm-card fm-set__card${danger ? " fm-set__card--danger" : ""}`}>
      <div>
        <h2 id={`${id}-title`} className="fm-set__title font-display text-xl font-bold">
          {mobile ? (
            <button type="button" className="fm-set__head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
              <Icon size={22} aria-hidden="true" />
              <span className="flex-1">{title}</span>
              <span className="fm-set__chip" aria-hidden="true">
                <ChevronDown size={20} className="fm-set__chev" />
              </span>
            </button>
          ) : (
            <>
              <Icon size={22} aria-hidden="true" /> {title}
            </>
          )}
        </h2>
        {intro && !mobile && <p className="mt-1">{intro}</p>}
      </div>
      <div id={bodyId} className="fm-set__collapse" data-open={!mobile || open}>
        <div className="fm-set__collapse-inner">
          <div className="fm-set__body">
            {intro && mobile && <p>{intro}</p>}
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

const Saved = ({ children }) => (
  <p role="status" className="fm-set__saved">
    <Check size={18} strokeWidth={3} aria-hidden="true" /> {children}
  </p>
);
const FormError = ({ children }) =>
  children ? (
    <p role="alert" className="fm-set__formerror fm-error">
      {children}
    </p>
  ) : null;

// the checklist under a new password
function PasswordRules({ value }) {
  return (
    <ul className="fm-set__rules" aria-label="Password rules">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.key} className={ok ? "is-ok" : undefined}>
            {ok ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}
            {r.label}
            <span className="sr-only">{ok ? " (done)" : " (not yet)"}</span>
          </li>
        );
      })}
    </ul>
  );
}

// when the server says no: if it names fields they show under those fields, otherwise its message shows above the button
function useServerError(formRef, idPrefix) {
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState("");
  const clear = (field) => {
    if (field) setServerErrors((s) => (s[field] ? { ...s, [field]: "" } : s));
    setFormError("");
  };
  const handle = (err, fieldOrder) => {
    if (err?.fields) {
      setServerErrors(err.fields);
      const bad = fieldOrder.find((f) => err.fields[f]);
      if (bad) formRef.current?.querySelector(`#${idPrefix}-${bad}`)?.focus();
    } else {
      setFormError(err?.message || SAVE_FAILED);
    }
  };
  return { serverErrors, formError, clear, handle, setFormError };
}

// ---------- the card on the left ----------
// it shows the profile as it is being edited, so you see the result before you save (the same idea as the card on the register page)
function SettingsCard({ first, last, username, email, role, avatar, unsaved }) {
  const avatarUri = useAvatarUri(avatar);
  const name = `${first.trim()} ${last.trim()}`.trim();
  const initials = initialsOf(first, last);
  const handle = username.trim();
  return (
    <aside className="fm-set-id" aria-label="Preview of your FarMe card">
      <span className="fm-set-id__slot" aria-hidden="true" />
      <div className="fm-set-id__body">
        <div className="fm-set-id__avatar">
          {avatarUri ? (
            <img key={avatarUri} src={avatarUri} alt="Your avatar" draggable={false} />
          ) : initials ? (
            <span className="font-display">{initials}</span>
          ) : (
            <Sparkles size={34} aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0">
          <p className={`fm-set-id__name font-display${name ? "" : " is-empty"}`}>{name || "Your name"}</p>
          <p className={`fm-set-id__user${handle ? "" : " is-empty"}`}>@{handle || "username"}</p>
          <p className="fm-set-id__mail">{email || "No email yet"}</p>
          <p className="fm-set-id__role">{role || "Farmer"}</p>
          {unsaved && <p className="fm-set-id__unsaved">Not saved yet</p>}
        </div>
      </div>
    </aside>
  );
}

// ---------- Profile: avatar + names + username ----------
function ProfileSection({ user, onSaved, onPreview }) {
  const [values, setValues] = useState({ firstName: user.firstName || "", lastName: user.lastName || "", username: user.username || "" });
  const [avatar, setAvatar] = useState(user.avatar || null); // null = no avatar (initials are shown instead)
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  const [confirming, setConfirming] = useState(false); // the "are you sure?" dialog is open (only for a new username)
  const formRef = useRef(null);
  const { serverErrors, formError, clear, handle } = useServerError(formRef, "set");
  const avatarUri = useAvatarUri(avatar);

  const checks = { firstName: nameCheck("first name"), lastName: nameCheck("last name"), username: usernameCheck };
  const FIELDS = Object.keys(checks);
  const errors = Object.fromEntries(FIELDS.map((f) => [f, checks[f](values[f])]));
  const shown = (f) => serverErrors[f] || (touched[f] || submitted ? errors[f] : "");

  const clean = { firstName: values.firstName.trim(), lastName: values.lastName.trim(), username: values.username.trim().toLowerCase() };
  const usernameChanged = clean.username !== (user.username || "").toLowerCase();
  const dirty =
    clean.firstName !== user.firstName ||
    clean.lastName !== user.lastName ||
    usernameChanged ||
    JSON.stringify(avatar) !== JSON.stringify(user.avatar || null);

  // tell the card on the left what is being edited, saved or not
  useEffect(() => {
    onPreview({ firstName: values.firstName, lastName: values.lastName, username: values.username, avatar, unsaved: dirty });
  }, [values, avatar, dirty, onPreview]);

  const edited = () => status === "saved" && setStatus("idle"); // a new edit hides the "saved" line
  const change = (f) => (e) => {
    setValues((v) => ({ ...v, [f]: e.target.value }));
    clear(f);
    edited();
  };
  const changeAvatar = (next) => {
    setAvatar(next);
    edited();
  };

  // step 1: check the fields. a new username changes how the person logs in, so that one asks "are you sure?" first.
  // names and avatar are easy to change back, so they save right away.
  const submit = (e) => {
    e.preventDefault();
    if (status === "saving" || !dirty) return;
    setSubmitted(true);
    const firstBad = FIELDS.find((f) => errors[f]);
    if (firstBad) {
      formRef.current?.querySelector(`#set-${firstBad}`)?.focus();
      return;
    }
    if (usernameChanged) setConfirming(true);
    else save();
  };

  // step 2: save
  const save = async () => {
    setConfirming(false);
    setStatus("saving");
    try {
      await updateProfile({ ...clean, avatar });
      onSaved({ ...clean, avatar }); // the sidebar uses the same user, so it changes right away
      setStatus("saved");
    } catch (err) {
      setStatus("idle");
      handle(err, FIELDS);
    }
  };

  const initials = initialsOf(values.firstName, values.lastName);
  const field = (f) => ({
    id: `set-${f}`,
    name: f,
    value: values[f],
    onChange: change(f),
    onBlur: () => setTouched((t) => ({ ...t, [f]: true })),
    error: shown(f),
  });

  return (
    <Section id="set-profile" icon={User} title="Profile" intro="How you show up in FarMe.">
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="fm-set__avatar">
          <div className="fm-set__pic">
            {avatarUri ? (
              <img key={avatarUri} src={avatarUri} alt="Your avatar" draggable={false} />
            ) : initials ? (
              <span className="font-display">{initials}</span>
            ) : (
              <Sparkles size={34} aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-bold">Avatar</p>
            <p className="text-sm">{avatar ? "Pick a style, shuffle, or change the background." : "Make a face with DiceBear, or keep your initials."}</p>
          </div>
        </div>
        {avatar ? (
          <AvatarStudio avatar={avatar} onChange={changeAvatar} onRemove={() => changeAvatar(null)} />
        ) : (
          <button type="button" onClick={() => changeAvatar(startAvatar())} className="fm-btn fm-btn--light self-start flex items-center gap-2">
            <Sparkles size={16} aria-hidden="true" /> Create my avatar
          </button>
        )}

        <div className="fm-set__pair">
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
          hint={usernameChanged ? "You'll log in with the new username from now on." : "3 to 20 letters, numbers or underscores. It's also what you log in with."}
        />

        <FormError>{formError}</FormError>
        <div className="fm-set__actions">
          <button type="submit" disabled={!dirty || status === "saving"} aria-busy={status === "saving"} className="fm-btn fm-btn--primary">
            {status === "saving" ? "Saving…" : "Save profile"}
          </button>
          {status === "saved" && <Saved>Profile saved.</Saved>}
        </div>
      </form>

      {confirming && (
        <ConfirmModal
          title="Change your username?"
          message={`You'll log in as "${clean.username}" from now on.`}
          confirmLabel="Yes, change it"
          onConfirm={save}
          onClose={() => setConfirming(false)}
        />
      )}
    </Section>
  );
}

// ---------- Email ----------
function EmailSection({ user, onSaved }) {
  const [values, setValues] = useState({ email: "", currentPassword: "" });
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving
  const [doneText, setDoneText] = useState("");
  const [confirming, setConfirming] = useState(false); // the "are you sure?" dialog is open
  const formRef = useRef(null);
  const { serverErrors, formError, clear, handle } = useServerError(formRef, "set-email");

  const checks = {
    email: (v) => {
      const t = v.trim();
      if (!t) return "Enter your new email.";
      if (!EMAIL_RE.test(t)) return "That email doesn't look right. It should look like name@example.com.";
      if (t.toLowerCase() === (user.email || "").toLowerCase()) return "That's already your email.";
      return "";
    },
    currentPassword: (v) => (v ? "" : "Enter your current password to confirm."),
  };
  const FIELDS = Object.keys(checks);
  const errors = Object.fromEntries(FIELDS.map((f) => [f, checks[f](values[f])]));
  const shown = (f) => serverErrors[f] || (submitted ? errors[f] : "");

  const change = (f) => (e) => {
    setValues((v) => ({ ...v, [f]: e.target.value }));
    clear(f);
    setDoneText("");
  };

  // step 1: check the fields, then ask "are you sure?" (a typo here can lock someone out of password resets)
  const submit = (e) => {
    e.preventDefault();
    if (status === "saving") return;
    setSubmitted(true);
    setDoneText("");
    const firstBad = FIELDS.find((f) => errors[f]);
    if (firstBad) {
      formRef.current?.querySelector(`#set-email-${firstBad}`)?.focus();
      return;
    }
    setConfirming(true);
  };

  // step 2: the person said yes
  const save = async () => {
    setConfirming(false);
    setStatus("saving");
    const email = values.email.trim().toLowerCase();
    try {
      // pending = the server sent a link to the new address and keeps the old one until it is opened (see farmeApi.js)
      const result = await changeEmail({ email, currentPassword: values.currentPassword }); // password never trimmed
      if (!result?.pending) onSaved({ email });
      setDoneText(result?.pending ? `We sent a link to ${email}. Your email changes once you open it.` : "Email changed.");
      setValues({ email: "", currentPassword: "" });
      setSubmitted(false);
    } catch (err) {
      handle(err, FIELDS);
    }
    setStatus("idle");
  };

  return (
    <Section id="set-email-card" icon={Mail} title="Email" intro={<>Your email is <strong className="break-all">{user.email || "not set"}</strong>.</>}>
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          id="set-email-email"
          name="email"
          type="email"
          inputMode="email"
          label="New email"
          value={values.email}
          onChange={change("email")}
          error={shown("email")}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
        />
        <TextField
          id="set-email-currentPassword"
          name="currentPassword"
          type="password"
          label="Current password"
          value={values.currentPassword}
          onChange={change("currentPassword")}
          error={shown("currentPassword")}
          autoComplete="current-password"
          maxLength={72}
          hint="We ask for it to make sure it's you."
          extra={<ForgotLink />}
        />
        <FormError>{formError}</FormError>
        <div className="fm-set__actions">
          <button type="submit" disabled={status === "saving"} aria-busy={status === "saving"} className="fm-btn fm-btn--primary">
            {status === "saving" ? "Saving…" : "Change email"}
          </button>
          {doneText && <Saved>{doneText}</Saved>}
        </div>
      </form>

      {confirming && (
        <ConfirmModal
          title="Change your email?"
          message={`Your new email will be ${values.email.trim().toLowerCase()}. Make sure it's spelled right: it's where we send password reset links.`}
          confirmLabel="Yes, change it"
          onConfirm={save}
          onClose={() => setConfirming(false)}
        />
      )}
    </Section>
  );
}

// ---------- Password ----------
function PasswordSection() {
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving
  const [showPw, setShowPw] = useState(false);
  const [confirming, setConfirming] = useState(false); // the "are you sure?" dialog is open
  const [done, setDone] = useState(false);
  const formRef = useRef(null);
  const { serverErrors, formError, clear, handle } = useServerError(formRef, "set-pw");

  const checks = {
    currentPassword: (v) => (v ? "" : "Enter your current password."),
    newPassword: (v, all) => passwordCheck(v) || (v === all.currentPassword ? "Your new password must be different from the current one." : ""),
    confirm: (v, all) => (!v ? "Type your new password again." : v !== all.newPassword ? "The passwords don't match." : ""),
  };
  const FIELDS = Object.keys(checks);
  const errors = Object.fromEntries(FIELDS.map((f) => [f, checks[f](values[f], values)]));
  const shown = (f) => serverErrors[f] || (submitted ? errors[f] : "");
  const type = showPw ? "text" : "password";

  const change = (f) => (e) => {
    setValues((v) => ({ ...v, [f]: e.target.value }));
    clear(f);
    setDone(false);
  };

  // step 1: check the fields, then ask "are you sure?"
  const submit = (e) => {
    e.preventDefault();
    if (status === "saving") return;
    setSubmitted(true);
    setDone(false);
    const firstBad = FIELDS.find((f) => errors[f]);
    if (firstBad) {
      formRef.current?.querySelector(`#set-pw-${firstBad}`)?.focus();
      return;
    }
    setConfirming(true);
  };

  // step 2: the person said yes
  const save = async () => {
    setConfirming(false);
    setStatus("saving");
    try {
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword }); // never trimmed
      setValues({ currentPassword: "", newPassword: "", confirm: "" });
      setSubmitted(false);
      setDone(true);
    } catch (err) {
      handle(err, FIELDS);
    }
    setStatus("idle");
  };

  return (
    <Section id="set-pw-card" icon={Lock} title="Password" intro="Use one you don't use anywhere else.">
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          id="set-pw-currentPassword"
          name="currentPassword"
          type={type}
          label="Current password"
          value={values.currentPassword}
          onChange={change("currentPassword")}
          error={shown("currentPassword")}
          autoComplete="current-password"
          maxLength={72}
          extra={<ForgotLink />}
        />
        <div>
          <TextField
            id="set-pw-newPassword"
            name="newPassword"
            type={type}
            label="New password"
            value={values.newPassword}
            onChange={change("newPassword")}
            error={shown("newPassword")}
            autoComplete="new-password"
            maxLength={72}
            hint=" "
          />
          <PasswordRules value={values.newPassword} />
        </div>
        <TextField
          id="set-pw-confirm"
          name="confirm"
          type={type}
          label="Confirm new password"
          value={values.confirm}
          onChange={change("confirm")}
          error={shown("confirm")}
          autoComplete="new-password"
          maxLength={72}
          hint={values.confirm !== "" && values.confirm === values.newPassword ? "The passwords match." : " "}
        />
        <label className="fm-set__toggle">
          <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
          Show passwords
        </label>
        <FormError>{formError}</FormError>
        <div className="fm-set__actions">
          <button type="submit" disabled={status === "saving"} aria-busy={status === "saving"} className="fm-btn fm-btn--primary">
            {status === "saving" ? "Saving…" : "Change password"}
          </button>
          {done && <Saved>Password changed.</Saved>}
        </div>
      </form>

      {confirming && (
        <ConfirmModal
          title="Change your password?"
          message="You'll use the new password the next time you log in."
          confirmLabel="Yes, change it"
          onConfirm={save}
          onClose={() => setConfirming(false)}
        />
      )}
    </Section>
  );
}

// ---------- Delete account ----------
// two steps in one dialog: 1) type the password to confirm, 2) after it is deleted, a goodbye. the person leaves from the goodbye
// to the register page (the account is gone, so there is nothing to log in to).
function DeleteDialog({ firstName, onClose, onDeleted }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle"); // idle | deleting | gone
  const [error, setError] = useState("");

  const leave = () => window.location.assign(REGISTER_HREF);

  const submit = async (e) => {
    e.preventDefault();
    if (!password || status === "deleting") return;
    setStatus("deleting");
    setError("");
    try {
      await deleteAccount({ password }); // never trimmed
      onDeleted(); // nothing is left to save: switch the "unsaved changes" warning off
      setStatus("gone"); // the account is deleted: show the goodbye. the person goes to the register page from there.
    } catch (err) {
      setStatus("idle");
      setError(err?.fields?.password || err?.message || "We couldn't delete your account. Check your connection and try again.");
    }
  };

  // the dialog can't be closed while the delete is running, and once it is gone, closing it means leaving
  const close = status === "deleting" ? () => {} : status === "gone" ? leave : onClose;

  if (status === "gone") {
    return (
      <Modal title="Account deleted" onClose={close}>
        <div className="fm-set__bye" role="status">
          <img src={happyImg} alt="" draggable={false} />
          <h3 className="font-display text-2xl font-bold">See you around{firstName ? `, ${firstName}` : ""}.</h3>
          <p>Your account, fields, harvests and notes have been cleared away. Thank you for growing with FarMe.</p>
          <button type="button" onClick={leave} className="fm-btn fm-btn--primary" autoFocus>
            Back to the start
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Delete your account?" onClose={close}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <p>This deletes your account and everything in it: your fields, harvests and notes. It can't be undone.</p>
        <div>
          <label htmlFor="set-del-password" className="block font-bold mb-1">
            Type your password to confirm
          </label>
          <input
            id="set-del-password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            aria-invalid={error ? "true" : "false"}
            aria-describedby="set-del-msg"
            className={`fm-input${error ? " fm-set__bad" : ""}`}
            autoComplete="current-password"
            maxLength={72}
            autoFocus
          />
          <p id="set-del-msg" role={error ? "alert" : undefined} className={`text-sm min-h-[20px] mt-1${error ? " fm-error" : ""}`}>
            {error}
          </p>
          <ForgotLink />
        </div>
        <div className="fm-modal__actions">
          <button type="button" className="fm-btn fm-btn--light" onClick={onClose} disabled={status === "deleting"}>
            Cancel
          </button>
          <button type="submit" className="fm-btn fm-btn--danger" disabled={!password || status === "deleting"} aria-busy={status === "deleting"}>
            {status === "deleting" ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteSection({ firstName, onDeleted }) {
  const [open, setOpen] = useState(false);
  return (
    <Section id="set-delete" icon={Trash2} title="Delete account" danger intro="This removes your account, your fields, your harvests and your notes for good.">
      <button type="button" onClick={() => setOpen(true)} className="fm-btn fm-btn--danger-light self-start">
        Delete my account
      </button>
      {open && <DeleteDialog firstName={firstName} onClose={() => setOpen(false)} onDeleted={onDeleted} />}
    </Section>
  );
}

// ---------- the page ----------
export default function Settings() {
  const [user, setUser] = useState(null); // null until getUser answers, so the forms start with the real values
  const [loadError, setLoadError] = useState(false);
  const [preview, setPreview] = useState(null); // what the profile card is editing right now (the card on the left shows it)

  // todo(backend): getUser() is GET /me (see farmeApi.js)
  useEffect(() => {
    getUser().then(setUser).catch(() => setLoadError(true));
  }, []);

  // a saved profile / email goes into the same user the sidebar shows
  const onSaved = (patch) => setUser((u) => ({ ...u, ...patch }));

  // ----- unsaved changes: ask before leaving -----
  // only the Profile card counts (it holds the data that is really saved: names, username, avatar).
  // - closing or reloading the tab, or the back button: the browser's own prompt (its text can't be changed)
  // - clicking a link (the sidebar, "reset it by email") or Log out: our own dialog (below)
  const [deleted, setDeleted] = useState(false);
  const unsaved = !!preview?.unsaved && !deleted;
  const allowLeave = useRef(false); // true once the person said "leave anyway", so nothing asks again
  const [leave, setLeave] = useState(null); // { go } = what to do if the person leaves anyway

  useEffect(() => {
    if (!unsaved) return undefined;
    const beforeUnload = (e) => {
      if (allowLeave.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    // capture phase, so this runs before the sidebar's own click handlers
    const onClick = (e) => {
      if (allowLeave.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = e.target.closest?.("a[href], .fm-nav__logout");
      if (!el || el.closest(".fm-modal")) return; // links inside a dialog (e.g. delete account) are not caught
      if (el.tagName === "A") {
        if (el.target && el.target !== "_self") return; // opens in a new tab: this page stays
        const url = new URL(el.href, window.location.href);
        if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page
        e.preventDefault();
        e.stopPropagation();
        setLeave({ go: () => window.location.assign(url.href) });
      } else {
        // the Log out button: after "leave anyway" it is clicked again, and the sidebar asks "Log out?" as usual
        e.preventDefault();
        e.stopPropagation();
        setLeave({ go: () => el.click() });
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [unsaved]);

  // "leave anyway" switches the warning off for good, so neither our dialog nor the browser's asks again
  // (that includes the sidebar's own "Log out?" question that comes after this one)
  const leaveAnyway = () => {
    allowLeave.current = true;
    const { go } = leave;
    setLeave(null);
    go();
  };

  return (
    <div className="min-h-screen bg-[#F1E7D2] text-[#202808] flex flex-col md:flex-row font-body">
      <Sidebar active="settings" user={user || { username: "", firstName: "", lastName: "" }} />

      <div className="flex-1 min-w-0 p-3 sm:p-5 flex flex-col gap-4">
        <header className="flex items-center gap-3">
          <span className="fm-panel w-12 h-12 shrink-0 flex items-center justify-center" aria-hidden="true">
            <SettingsIcon size={26} />
          </span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">Settings</h1>
        </header>

        <div className="w-full max-w-5xl mx-auto pb-24">
          {loadError ? (
            <p role="alert" className="fm-set__formerror fm-error">
              We couldn't load your settings. Check your connection and reload the page.
            </p>
          ) : !user ? (
            <p role="status">Loading…</p>
          ) : (
            <div className="fm-set__layout">
              <SettingsCard
                first={preview ? preview.firstName : user.firstName || ""}
                last={preview ? preview.lastName : user.lastName || ""}
                username={preview ? preview.username : user.username || ""}
                avatar={preview ? preview.avatar : user.avatar || null}
                unsaved={!!preview?.unsaved && !deleted}
                email={user.email}
                role={user.role}
              />
              <div className="fm-set__forms">
                <ProfileSection user={user} onSaved={onSaved} onPreview={setPreview} />
                <EmailSection user={user} onSaved={onSaved} />
                <PasswordSection />
                <DeleteSection firstName={user.firstName} onDeleted={() => {
                  allowLeave.current = true;
                  setDeleted(true);
                }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {leave && (
        <Modal title="Leave without saving?" onClose={() => setLeave(null)}>
          <p className="mb-4">You have unsaved changes to your profile. If you leave now, they'll be lost.</p>
          <div className="fm-modal__actions">
            <button type="button" className="fm-btn fm-btn--light" onClick={leaveAnyway}>
              Leave without saving
            </button>
            <button type="button" className="fm-btn fm-btn--primary" onClick={() => setLeave(null)} autoFocus>
              Keep editing
            </button>
          </div>
        </Modal>
      )}

      <ChatHead context={{ page: "settings" }} />
    </div>
  );
}