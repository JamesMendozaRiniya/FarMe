// farmeApi.js: every call that leaves the app lives in this file (storage, user, weather, AI, chat).
// No React and no UI in here, so each function can be swapped for a real backend call one at a time.
// The pages only depend on the return shapes documented below, so keep those the same.
//
// CURRENT STATUS (nothing here talks to our server yet)
//   - slots + notification marks are saved in the browser's localStorage (see `db`)
//   - getUser, logout and logWatering are placeholders
//   - weather and place search call Open-Meteo / Nominatim straight from the browser (free, no key)
//   - AI recommendations and chat are off until AI_ENDPOINT / CHAT_ENDPOINT are set (the app has fallbacks)
//
// RULES FOR THE SERVER
//   - Secrets (like the Anthropic key) stay on the server. Never put them in this file.
//   - Only return the signed-in user's data.
//   - Re-check everything the browser validates (plot size, names, soil, grid position).
//   - Ids are made in the browser with crypto.randomUUID(). Accept them, or generate your own and
//     return them. Either way they are strings.
//
// ENDPOINTS THE PAGES NEED (the same `todo(backend)` tags in dashboard.jsx / library.jsx mark where each is called)
//   todo(backend): user           GET /me                              -> getUser()
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
//   user     { username, firstName, lastName, role?, avatarUrl? }   (see getUser)

// Put the server routes here when they exist. While they're null the app uses its own fallbacks.
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

// ---------- user ----------
// todo(backend): placeholder user. Replace with GET /me for the signed-in user.
// Must return: { username, firstName, lastName, role?, avatarUrl? }
//   username    shown in the dashboard greeting ("Hello, <username>") and the library title ("<username>'s Library")
//   firstName / lastName   shown in the sidebar user card (and used for the initials)
//   role        optional, shown under the name in the sidebar (defaults to "Farmer")
//   avatarUrl   optional, a full image URL for the profile photo. Leave it out or null and the sidebar shows initials.
//               If the image fails to load the sidebar falls back to the initials.
export async function getUser() {
  return { username: "Juan", firstName: "Juan", lastName: "Dela Cruz", role: "Farmer", avatarUrl: null };
}

// todo(backend): placeholder. POST /logout, i.e. call the backend logout (end the session / clear the token), then go to the login page.
// Change "/login" to the real login route.
export async function logout() {
  window.location.assign("/login");
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