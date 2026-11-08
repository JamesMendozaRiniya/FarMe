// ENDPOINTS THE PAGES NEED (the same `todo(backend)` tags in dashboard.jsx / library.jsx mark where each is called)
//   todo(backend): register       POST /register                       -> register()      (the register page)
//   todo(backend): login          POST /login                          -> login()         (the login page)
//   todo(backend): password       POST /forgot-password                -> forgotPassword()  (the forgot password page)
//                                 POST /reset-password                 -> resetPassword()   (the reset password page)
//   todo(backend): user           GET /me                              -> getUser()
//   todo(backend): settings       PATCH /me { firstName, lastName, username, avatar }   -> updateProfile()   (the settings page)
//                                 POST /me/email { email, currentPassword }             -> changeEmail()
//                                 POST /me/password { currentPassword, newPassword }    -> changePassword()
//                                 DELETE /me { password }                               -> deleteAccount()
//                                 POST /logout                         -> logout()
//   todo(backend): slots          GET /slots                           -> db.loadSlots()   (return each slot with its plants, harvests, notes)
//                                 POST /slots, PATCH /slots/:id, DELETE /slots/:id
//   todo(backend): plants         POST /slots/:id/plants
//                                 PATCH /plants/:id { row, col }       (trowel tool moves plants; also used when "keep" resets plantedOn on harvest)
//                                 DELETE /plants/:id
//   todo(backend): harvests       POST /slots/:id/harvests { plantId, at, amount, kept }
//                                 PATCH /harvests/:id, DELETE /harvests/:id
//   todo(backend): notes          POST /slots/:id/notes, PATCH /notes/:id, DELETE /notes/:id
//   todo(backend): watering       POST /slots/:id/waterings { at }     -> logWatering()   (also PATCH /slots/:id { lastWatered })
//   todo(backend): notifications  GET /notifications, PATCH /notifications/:id, DELETE /notifications/:id   (see the note on notification state)
//   todo(backend): ai             POST /recommend, POST /chat          -> fetchRecommendations(), sendChat()
//
// DATA SHAPES (what the pages read and write)
//   slot     { id, name, soil, widthM, lengthM, location, lat, lon, place, lastWatered?, plants[], harvests[], notes[] }
//              name      unique per user, case-insensitive (the browser adds " (2)", " (3)"... on clashes)
//              soil      "Clay" | "Loam" | "Sandy" | "Silty"
//              widthM, lengthM   metres, between 0.5 and 200
//              location  text the user typed. lat / lon / place are null when it couldn't be geocoded
//              lastWatered       Date.now() milliseconds
//   plant    { id, row, col, cropKey, plantedOn, lastHarvested? }
//              plantedOn / lastHarvested   "YYYY-MM-DD" (local date)
//              row, col   0-based square on the slot's grid. One plant per square, and it must be inside the grid.
//                         Grid rule: try square sizes 0.5, 1, 2, 5 m and use the first where rows * cols <= 2500
//                         (rows = floor(widthM / size), cols = floor(lengthM / size)). See computeGrid in dashboard.jsx.
//   harvest  { id, cropKey, row, col, plantedOn, date, amount, kept }
//              amount is free text typed by the user (e.g. "2 kg"). kept = true if the plant kept growing.
//   note     { id, cropKeys[], plantIds?[], date, text }
//   crops    are not in the database. They live in data/crops.jsx and are referenced by `cropKey`, which must never be renamed.
//   user     { username, firstName, lastName, email, role?, avatar?, avatarUrl? }   (see getUser)

// NOTES FOR WHOEVER BUILDS THE SERVER (things the pages assume but the code can't show)
//   ids         the browser creates the ids of slots, plants, harvests and notes with crypto.randomUUID(). Either accept them as the primary
//               keys, or ignore them and RETURN your own ids from the POST routes (then the pages must use the returned ids: tell the frontend).
//   plants      unique per (slot_id, row, col), and row / col must be inside the slot's grid (see the grid rule above). Reject anything else.
//   avatar      never trust it: only accept a style from an allowed list, a seed up to ~40 characters and a background that is a hex color.
//   passwords   a WRONG current password (changeEmail, changePassword, deleteAccount) must answer 400 / 403 / 422, NOT 401. The pages send
//               the person to /login on every 401, and 401 means only "you have no session".
//   email       if changeEmail returns { pending: true }, the server also needs the route the emailed link opens (e.g. GET /confirm-email?token=...).
//   ai          POST /recommend and /chat: keep the Anthropic API key on the server only (never in this file or in any VITE_ variable),
//               require a logged-in user, rate limit them, and cap the size of `messages` and `context`.
//   slots       until the per-slot routes exist, saveSlots sends the WHOLE list. When the server stores slots for real, the server must not
//               delete slots that are missing from a request.

// Put the server routes here when they exist. While they're null the app uses its own fallbacks.
// API_BASE: set it to the server's address (e.g. "http://localhost:3000/api", or "/api" with a dev proxy) and the account + settings calls
// below stop using their placeholders and call the real routes through request(). While it is null nothing is sent anywhere.
// (slots / plants / harvests / notes still go through db.* until their per-slot calls are written, see the endpoint list.)
export const API_BASE = null;
export const AI_ENDPOINT = null; // e.g. "/api/recommend" -> crop suggestions
export const CHAT_ENDPOINT = null; // e.g. "/api/chat" -> chatbot replies

const STORAGE_KEY = "farme.slots.v2";
const NOTIF_KEY = "farme.notifs.v1";

// ---------- storage (localStorage for now, our database later) ----------
// todo(backend): swap the whole-list load/save below for the per-slot calls in the endpoint list above.
// The pages load the whole slot list once, then call saveSlots(slots) with the WHOLE list after every change.
// That is the current shortcut. To move to the per-action endpoints above, call them inside the page
// actions (createSlot, plantCell, harvestPlants...) instead of saveSlots.
//
// WHEN YOU REPLACE loadSlots: throw on failure. Do not return [] on an error. The pages treat the result as
// the user's real data and then save it back, so an "empty" result caused by a failed request would wipe their slots.
// (The pages don't catch a thrown error yet, so add an error state there when you do this.)
// Also note dashboard and library both save the whole list, so with two tabs open the last save wins.
export const db = {
  async loadSlots() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return Array.isArray(data.slots) ? data.slots : [];
    } catch {
      return [];
    }
  },
  async saveSlots(slots) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, slots }));
    } catch {
      /* storage is full or blocked, so skip saving */
    }
  },

  // todo(backend): keep these marks per user (e.g. a notification_state table: user_id, notif_id, read, deleted).
  // The bell's read / deleted marks: { read: { [notifId]: true }, deleted: { [notifId]: true } }
  // The notifications themselves are NOT stored. The dashboard builds them from the slots on every render
  // (harvest reminders and watering reminders) and their ids are derived from the data:
  //   "harvest-<slotId>-<cropKey>-<harvestDate>"   and   "water-<slotId>-<YYYY-MM-DD>-<morning|midday|evening|night>"
  // So the server only needs to keep the marks, e.g. a notification_state table (user_id, notif_id, read, deleted).
  // If notifications become server-generated (scheduled job / push, so they arrive when the app is closed),
  // serve them from GET /notifications and drop buildNotifications() in dashboard.jsx.
  async loadNotifState() {
    try {
      const d = JSON.parse(localStorage.getItem(NOTIF_KEY) || "{}");
      return { read: d.read || {}, deleted: d.deleted || {} };
    } catch {
      return { read: {}, deleted: {} };
    }
  },
  async saveNotifState(state) {
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify(state));
    } catch {
      /* storage is full or blocked, so skip saving */
    }
  },
};

// Placeholder. The "water plants" button already saves lastWatered on the slot; this is only for a watering history table.
// todo(backend): POST /slots/:id/waterings { at }   (at = Date.now() milliseconds)
export async function logWatering(slotId, at) {
  return { slotId, at };
}

// ---------- request(): the one place that talks to the server ----------
// Used by the account + settings calls below when API_BASE is set. It
//   - sends the session cookie (credentials: "include"). the server must allow our origin with CORS and credentials, or use a dev proxy
//   - turns a failed answer into the Error the pages already catch: throw Object.assign(new Error(message), { fields, status })
//   - sends the person to /login when the server says 401 (no session), except for the public calls (public: true), because a 401
//     from /login itself just means "wrong password" and must be shown on the page
//   - returns the JSON body, or null when there is none (204)
const LOGIN_PATH = "/login";
async function request(path, { method = "GET", body, public: isPublic = false } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("We couldn't reach the server. Check your connection and try again.");
  }
  if (res.status === 401 && !isPublic) {
    window.location.assign(LOGIN_PATH);
    throw new Error("Please log in again.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error(data.message || "Something went wrong. Please try again."), { fields: data.fields, status: res.status });
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

// ---------- account: register + login + password reset ----------
// HOW THESE FOUR CALLS SHOULD ANSWER (register, login, forgotPassword, resetPassword):
//   success    200 / 201 with JSON, or 204. the pages don't read the body.
//   failure    a 4xx status with JSON { "message": "text for the person", "fields": { "username": "text" } }   (fields is optional).
//              when you write the real fetch, turn that into: throw Object.assign(new Error(message), { fields })
//              (that is what the pages already catch). 429 = too many tries, e.g. "Too many tries. Please wait a few minutes."
//   session    an httpOnly cookie. if the API is on another origin, the fetch calls need credentials: "include" and the server
//              must allow our origin with CORS (or serve the API from the same origin / a dev proxy). protect the POST routes
//              against CSRF (SameSite cookies and/or a CSRF token).
//   not logged in   GET /me and the slot routes answer 401.
//              todo(frontend): the pages don't send the person to /login on a 401 yet. add that when /me is real.
// todo(backend): placeholder. Replace with POST /register.
// payload = { firstName, lastName, username, email, password, avatar }   (avatar is null, or { style, seed, background })
//   username and email arrive trimmed and in lowercase. the password is sent exactly as typed (never trimmed).
// The server must:
//   - check every field again (the page's checks only help people early): names 1 to 40 characters, username 3 to 20
//     (letters, numbers, underscores), a valid email, password 8 to 72 characters with a letter and a number
//   - keep username and email unique (they arrive lowercase, so compare them without caring about case)
//   - store only a hash of the password (bcrypt or argon2), never the password itself
//   - save the avatar object as it is and return it from GET /me
//   - later, maybe send a confirmation email before the account can log in
// When the server says no, THROW an Error. Its message shows above the button. If it names fields, they show under those fields:
//   const err = new Error("..."); err.fields = { username: "That username is taken." }; throw err;
// On success just return (the page then shows "Log in"). Nobody is logged in yet.
export async function register(payload) {
  if (API_BASE) return request("/register", { method: "POST", body: payload, public: true });
  console.info("register payload (not sent anywhere yet)", { ...payload, password: "••••••••" });
  await new Promise((resolve) => setTimeout(resolve, 700));
}

// todo(backend): placeholder. Replace with POST /login.
// payload = { identifier, password, remember }   (identifier is the username or the email, as typed)
//   identifier  the page does NOT change its case. the server decides: with an @ it is an email, otherwise a username,
//               and it compares without caring about case (register saves both in lowercase).
//   remember  true = keep them logged in for a long time (e.g. a 30 day cookie), false = until the browser closes
// On success the server starts the session (an httpOnly cookie is the safest) and this function returns. The page then goes to the dashboard.
// When the server says no, THROW an Error. Its message shows above the button:
//   throw new Error("The username/email or the password is wrong.");
// Keep that message the same for "no such user" and "wrong password", so nobody can find out who has an account.
// The server should also limit how many tries one person can make.
// (If you ever need to mark one field, err.fields = { password: "..." } shows the text under that field.)
export async function login(payload) {
  if (API_BASE) return request("/login", { method: "POST", body: payload, public: true });
  console.info("login payload (not sent anywhere yet)", { ...payload, password: "••••••••" });
  await new Promise((resolve) => setTimeout(resolve, 700));
}

// todo(backend): placeholder. Replace with POST /forgot-password.
// payload = { email }   (trimmed, in lowercase)
// The server looks the email up and, if it has an account, emails a link to <our site>/reset-password?token=<token>.
//   - the token: random, single use, expires in about 30 to 60 minutes. store only a hash of it.
//   - ALWAYS answer the same (just return) whether the email has an account or not, so nobody can find out who is registered.
//     the page always says "if that email has an account, we sent a link".
//   - limit how many links one email (and one address) can ask for.
// THROW an Error only when something is really wrong (the server is down, too many tries). Its message shows above the button.
export async function forgotPassword(payload) {
  if (API_BASE) return request("/forgot-password", { method: "POST", body: payload, public: true });
  console.info("forgot password payload (not sent anywhere yet)", payload);
  await new Promise((resolve) => setTimeout(resolve, 700));
}

// todo(backend): placeholder. Replace with POST /reset-password.
// payload = { token, password }   (token is the one from the link in the email. the password is sent exactly as typed, never trimmed)
// The server checks the token (it exists, was not used, did not expire), checks the password rules again (8 to 72 characters,
// a letter and a number), saves the hash of the new password, marks the token as used, and ideally ends the person's other sessions.
// When the token is bad or old, THROW an Error such as "This link has expired. Ask for a new one." Its message shows above the button.
export async function resetPassword(payload) {
  if (API_BASE) return request("/reset-password", { method: "POST", body: payload, public: true });
  console.info("reset password payload (not sent anywhere yet)", { ...payload, password: "••••••••" });
  await new Promise((resolve) => setTimeout(resolve, 700));
}

// ---------- user ----------
// todo(backend): placeholder user. Replace with GET /me for the signed-in user.
// Must return: { username, firstName, lastName, email, role?, avatar?, avatarUrl? }
//   username    shown in the dashboard greeting ("Hello, <username>") and the library title ("<username>'s Library")
//   firstName / lastName   shown in the sidebar user card (and used for the initials)
//   email       shown on the settings page (the person's current email)
//   role        optional, shown under the name in the sidebar (defaults to "Farmer")
//   avatarUrl   optional, a full image URL for the profile photo. Leave it out or null and the sidebar shows initials.
//               If the image fails to load the sidebar falls back to the initials.
//   avatar      optional, the object made on the register page: { style, seed, background } (see avatar.js). Save it as is and
//               return it as is. The sidebar draws it with useAvatarUri(user.avatar), then falls back to avatarUrl, then initials.
//
// The settings calls below only change this placeholder user: they save to localStorage (USER_KEY) so a change survives a reload
// while there is no server. When GET /me is real, delete USER_KEY, saveUserLocal() and the `saved` lines.
const USER_KEY = "farme.user.v1";
function readUserLocal() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveUserLocal(patch) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify({ ...readUserLocal(), ...patch }));
  } catch {
    /* storage is full or blocked, so skip saving */
  }
}
export async function getUser() {
  if (API_BASE) return request("/me");
  return {
    username: "Juan",
    firstName: "Juan",
    lastName: "Dela Cruz",
    email: "juan@example.com",
    role: "Farmer",
    avatarUrl: null,
    ...readUserLocal(),
  };
}

// ---------- settings ----------
// These four answer like the account calls above (see HOW THESE FOUR CALLS SHOULD ANSWER): success = just return,
// failure = THROW an Error whose message shows in the section, and err.fields = { username: "..." } shows under a field.
// Every one of them needs a logged-in person (401 when not). The server must check every field again.

// todo(backend): placeholder. Replace with PATCH /me.
// payload = { firstName, lastName, username, avatar }   (names trimmed, username trimmed and lowercase, avatar is null or { style, seed, background })
// Save them and answer. Username must stay unique (compare without caring about case): when it is taken,
//   throw Object.assign(new Error("That username is taken."), { fields: { username: "That username is taken." } })
// A new username is also what the person logs in with from then on.
export async function updateProfile(payload) {
  if (API_BASE) return request("/me", { method: "PATCH", body: payload });
  console.info("update profile payload (saved on this device only)", payload);
  await new Promise((resolve) => setTimeout(resolve, 500));
  saveUserLocal(payload);
}

// todo(backend): placeholder. Replace with POST /me/email.
// payload = { email, currentPassword }   (email trimmed and lowercase. the password is sent exactly as typed, never trimmed)
// Check the current password (a wrong one is err.fields = { currentPassword: "That password isn't right." }), keep the email unique, and
// save it. If you want the new address confirmed first, send a link to it and keep the old email until it is opened.
// RETURN { pending: true } in that case (the page then says "we sent a link"), or { pending: false } when the email changed right away.
export async function changeEmail(payload) {
  if (API_BASE) return request("/me/email", { method: "POST", body: payload });
  console.info("change email payload (saved on this device only)", { ...payload, currentPassword: "••••••••" });
  await new Promise((resolve) => setTimeout(resolve, 500));
  saveUserLocal({ email: payload.email });
  return { pending: false };
}

// todo(backend): placeholder. Replace with POST /me/password.
// payload = { currentPassword, newPassword }   (both exactly as typed, never trimmed)
// Check the current password (wrong one: err.fields = { currentPassword: "That password isn't right." }), check the new one
// (8 to 72 characters, a letter and a number), save only its hash, and ideally end the person's OTHER sessions.
export async function changePassword(payload) {
  if (API_BASE) return request("/me/password", { method: "POST", body: payload });
  console.info("change password payload (not sent anywhere yet)", { currentPassword: "••••••••", newPassword: "••••••••" });
  await new Promise((resolve) => setTimeout(resolve, 500));
}

// todo(backend): placeholder. Replace with DELETE /me.
// payload = { password }   (the current password, exactly as typed)
// Check the password (wrong one: throw an Error, e.g. "That password isn't right."), then delete the person AND everything that belongs to them:
// slots, plants, harvests, notes, notification marks and the avatar. End the session. This cannot be undone.
// Until the data is on the server, the placeholder below clears what this browser keeps. The page then shows a goodbye and goes to the register page.
export async function deleteAccount(payload) {
  if (API_BASE) return request("/me", { method: "DELETE", body: payload });
  console.info("delete account (clears this browser's data only)", { password: payload?.password ? "••••••••" : "" });
  await new Promise((resolve) => setTimeout(resolve, 500));
  [STORAGE_KEY, NOTIF_KEY, USER_KEY, "farme.chat.v1"].forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* blocked, so skip */
    }
  });
}

// With API_BASE set this calls POST /logout (the server ends the session and clears the cookie), then goes to the login page.
// If the call fails the person still goes to the login page. Change LOGIN_PATH above if the login route changes.
export async function logout() {
  if (API_BASE) await request("/logout", { method: "POST", public: true }).catch(() => {});
  window.location.assign(LOGIN_PATH);
}

// ---------- location + weather (Open-Meteo: free, no API key, works from the browser) ----------
// This is called directly from the browser, so it doesn't need the backend. Open-Meteo's free tier is meant for
// non-commercial use, so check their terms (or move these calls to the server with a paid key) before launch.
// Farme is only for the Philippines, so places are limited to PH.
// Note: Open-Meteo's country filter is `countryCode` (camelCase). `country_code` is silently ignored.
const COUNTRY = "PH";

// "Province of Batangas" -> "Batangas"
const cleanArea = (s) => (s || "").replace(/^(province|city|municipality) of\s+/i, "").trim();

// "Santo Tomas" + "Batangas" + "Calabarzon" -> "Santo Tomas, Batangas, Calabarzon" (no repeats)
const placeLabel = (r) => [...new Set([r.name, cleanArea(r.admin2), r.admin1].filter(Boolean))].join(", ");

// One search call. Returns Open-Meteo's raw results.
async function searchRaw(name, count = 10) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=${count}&language=en&countryCode=${COUNTRY}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`geocoding failed (${res.status})`);
  return ((await res.json()).results || []).filter((r) => r.country_code === COUNTRY);
}

// Suggestions for the location picker while the user types: [{ id, label, lat, lon }]
export async function searchPlaces(query) {
  const q = query.trim();
  if (q.length < 3) return []; // Open-Meteo only matches from 3 letters
  return (await searchRaw(q, 8)).map((r) => ({ id: r.id, label: placeLabel(r), lat: r.latitude, lon: r.longitude }));
}

// Turns typed text into { lat, lon, place }, or null if nothing matches. Works with "santo tomas, batangas"
// and "santo tomas batangas": it searches the first part, and if nothing comes back it drops words from the end.
// Whatever was dropped (plus anything after a comma) is used as a hint to pick the right match when several towns share a name.
export async function geocode(text) {
  const [first, ...rest] = text.split(",").map((s) => s.trim()).filter(Boolean);
  if (!first) return null;
  const words = first.split(/\s+/);
  const dropped = [];
  while (words.length) {
    const results = await searchRaw(words.join(" "));
    if (results.length) {
      const hint = [...dropped, ...rest].join(" ").toLowerCase();
      const hit = (hint && results.find((r) => `${r.admin1 || ""} ${r.admin2 || ""} ${r.admin3 || ""}`.toLowerCase().includes(hint))) || results[0];
      return { lat: hit.latitude, lon: hit.longitude, place: placeLabel(hit) };
    }
    dropped.unshift(words.pop());
  }
  return null;
}

// Place name for coordinates, used by the "use my location" button (OpenStreetMap Nominatim).
// Nominatim's usage policy allows light use only, so this is fine for an occasional tap but not for bulk lookups.
export async function reverseGeocode(lat, lon) {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12&accept-language=en`);
  if (!res.ok) throw new Error(`reverse geocoding failed (${res.status})`);
  const a = (await res.json()).address || {};
  const town = a.city || a.town || a.village || a.municipality || a.suburb || a.hamlet;
  const area = a.province || a.county || a.state_district || a.state;
  return [...new Set([town, area].filter(Boolean))].join(", ") || null;
}

// Open-Meteo weather code -> label + emoji
const WMO = (code) =>
  code === 0 ? ["Clear", "☀️"] : code <= 3 ? ["Partly cloudy", "⛅"] : code <= 48 ? ["Foggy", "🌫️"] : code <= 67 || (code >= 80 && code <= 82) ? ["Rain", "🌧️"] : code >= 95 ? ["Thunderstorm", "⛈️"] : ["Cloudy", "☁️"];

// Current weather for a spot: { temp (°C), humidity (%), label, emoji }. Throws if the request fails.
export async function fetchWeather(lat, lon) {
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code`);
  if (!res.ok) throw new Error(`weather failed (${res.status})`);
  const c = (await res.json()).current;
  if (!c) throw new Error("weather response had no data");
  const [label, emoji] = WMO(c.weather_code);
  return { temp: Math.round(c.temperature_2m), humidity: c.relative_humidity_2m, label, emoji };
}

// ---------- AI: crop suggestions ----------
// Server contract:
//   POST AI_ENDPOINT { soil, location, areaM2, season, weather, crops: [cropKey] }
//     soil       "Clay" | "Loam" | "Sandy" | "Silty"
//     season     "wet" (June to November) | "dry" (December to May)
//     weather    current weather for the slot (same shape as fetchWeather) or null
//     crops      the crop keys the model may choose from (the list in data/crops.jsx)
//   -> { recommendations: [{ key, reason }] }   key must be one of the crop keys sent; reason is a short sentence
// The server prompts Claude and returns JSON. Returns the list, or null when there is no endpoint or the call fails;
// the page then falls back to its own local rules.
export async function fetchRecommendations(ctx) {
  if (!AI_ENDPOINT) return null;
  try {
    const res = await fetch(AI_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ctx) });
    if (!res.ok) throw new Error("bad response");
    return (await res.json()).recommendations || null;
  } catch {
    return null;
  }
}

// ---------- AI: chatbot ----------
// Server contract:
//   POST CHAT_ENDPOINT { messages: [{ role: "user" | "assistant", content }], context }
//   -> { reply: "text" }
// `messages` is the recent conversation (the browser keeps the last 50). `context` is what the page knows
// (current page, open slot, season, weather) so answers are about the user's own farm.
// Returns the reply text. Throws if the server can't be reached; the chat then shows a friendly error.
export async function sendChat({ messages, context }) {
  if (!CHAT_ENDPOINT) return "The chat isn't connected to the server yet. Once your backend is ready, set CHAT_ENDPOINT in farmeApi.js and I'll answer here.";
  const res = await fetch(CHAT_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, context }) });
  if (!res.ok) throw new Error("bad response");
  return (await res.json()).reply;
}