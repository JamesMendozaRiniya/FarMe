// farme api: i keep every call that leaves the app (storage, user, weather, ai, chat) in this file.
// no react and no ui in here, so you can swap each function for the real backend one at a time.
// anything that needs a secret (like the anthropic key) has to run on our server, never in this file.
//
// backend checklist. none of this exists yet: slots and notification marks sit in localstorage, the rest are placeholders i left for you.
//   todo(backend): slots          GET /slots, POST /slots, PATCH /slots/:id, DELETE /slots/:id
//   todo(backend): plants         POST /slots/:id/plants, DELETE /plants/:id
//   todo(backend): watering       POST /slots/:id/waterings            (see logWatering)
//   todo(backend): notifications  GET /notifications, PATCH /notifications/:id, DELETE /notifications/:id
//   todo(backend): user           GET /me, POST /logout                (see getUser, logout)
//   todo(backend): ai             POST /recommend, POST /chat          (see the two endpoints below)
// please make the server re-check everything the browser validates (sizes, names, soil) and only return the signed-in user's data.

// put our server routes here when they exist. while they're null the app uses its own fallbacks.
export const AI_ENDPOINT = null; // e.g. "/api/recommend"  -> crop suggestions
export const CHAT_ENDPOINT = null; // e.g. "/api/chat"       -> chatbot replies

const STORAGE_KEY = "farme.slots.v2";
const NOTIF_KEY = "farme.notifs.v1";

// ---------- storage (localstorage for now, our database later) ----------
// todo(backend): right now i load and save the slots as one list. swap that for the per-slot calls in the checklist above.
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
      /* storage is full or blocked, so i just skip saving */
    }
  },
  // the bell's read / deleted marks, shaped like { read: { [id]: true }, deleted: { [id]: true } }
  // todo(backend): keep these per user (maybe a notification_state table: user_id, notif_id, read, deleted)
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
      /* storage is full or blocked, so i just skip saving */
    }
  },
};

// placeholder: logs one watering. i already save lastWatered on the slot, this is just for a history table later.
// todo(backend): POST /slots/:id/waterings { at }
export async function logWatering(slotId, at) {
  return { slotId, at };
}

// ---------- user ----------
// placeholder: replace with our backend call, e.g. GET /api/me -> { firstName, lastName }
export async function getUser() {
  return { firstName: "First", lastName: "Last" };
}

// placeholder: call our backend logout (clear the session / token), then go to the login page.
// change "/login" to our real login route.
export async function logout() {
  window.location.assign("/login");
}

// ---------- location + weather (open-meteo: free, no api key, works from the browser) ----------
// farme is only for the philippines, so i limit places to PH.
// heads up: open-meteo's country filter is countryCode (camelCase). country_code gets silently ignored, i lost a while to that.
const COUNTRY = "PH";

// "Province of Batangas" -> "Batangas"
const cleanArea = (s) => (s || "").replace(/^(province|city|municipality) of\s+/i, "").trim();

// "Santo Tomas" + "Batangas" + "Calabarzon" -> "Santo Tomas, Batangas, Calabarzon" (no repeats)
const placeLabel = (r) => [...new Set([r.name, cleanArea(r.admin2), r.admin1].filter(Boolean))].join(", ");

// one search call, returns open-meteo's raw results
async function searchRaw(name, count = 10) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=${count}&language=en&countryCode=${COUNTRY}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`geocoding failed (${res.status})`);
  return ((await res.json()).results || []).filter((r) => r.country_code === COUNTRY);
}

// suggestions for the location picker while the user types: [{ id, label, lat, lon }]
export async function searchPlaces(query) {
  const q = query.trim();
  if (q.length < 3) return []; // open-meteo only matches from 3 letters
  return (await searchRaw(q, 8)).map((r) => ({ id: r.id, label: placeLabel(r), lat: r.latitude, lon: r.longitude }));
}

// turns the typed text into coordinates. it works with "santo tomas, batangas" and "santo tomas batangas":
// i search the first part, and if nothing comes back i drop words from the end ("batangas" turns into a hint
// that picks the right "santo tomas" when there are several).
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

// finds a place name for coordinates, used by "use my location" (openstreetmap nominatim: free, fine for an occasional tap)
export async function reverseGeocode(lat, lon) {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12&accept-language=en`);
  if (!res.ok) throw new Error(`reverse geocoding failed (${res.status})`);
  const a = (await res.json()).address || {};
  const town = a.city || a.town || a.village || a.municipality || a.suburb || a.hamlet;
  const area = a.province || a.county || a.state_district || a.state;
  return [...new Set([town, area].filter(Boolean))].join(", ") || null;
}

// turns open-meteo's weather code into a label + emoji
const WMO = (code) =>
  code === 0 ? ["Clear", "☀️"] : code <= 3 ? ["Partly cloudy", "⛅"] : code <= 48 ? ["Foggy", "🌫️"] : code <= 67 || (code >= 80 && code <= 82) ? ["Rain", "🌧️"] : code >= 95 ? ["Thunderstorm", "⛈️"] : ["Cloudy", "☁️"];

// gets the current weather for a spot
export async function fetchWeather(lat, lon) {
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code`);
  if (!res.ok) throw new Error(`weather failed (${res.status})`);
  const c = (await res.json()).current;
  if (!c) throw new Error("weather response had no data");
  const [label, emoji] = WMO(c.weather_code);
  return { temp: Math.round(c.temperature_2m), humidity: c.relative_humidity_2m, label, emoji };
}

// ---------- ai: crop suggestions ----------
// server contract: POST { soil, location, areaM2, season, weather, crops: [keys] }
//                  -> { recommendations: [{ key, reason }] }   (the server prompts claude and returns json)
// returns the list, or null when there's no endpoint or the call fails (then the app uses my local rules)
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

// ---------- ai: chatbot ----------
// server contract: POST { messages: [{ role: "user" | "assistant", content }], context }
//                  -> { reply: "text" }
// context = what the page knows (current page, open slot, season, weather) so the answers are about the user's farm.
// returns the reply text. throws if the server can't be reached (the chat shows a friendly error instead).
export async function sendChat({ messages, context }) {
  if (!CHAT_ENDPOINT) return "The chat isn't connected to the server yet. Once your backend is ready, set CHAT_ENDPOINT in farmeApi.js and I'll answer here.";
  const res = await fetch(CHAT_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, context }) });
  if (!res.ok) throw new Error("bad response");
  return (await res.json()).reply;
}