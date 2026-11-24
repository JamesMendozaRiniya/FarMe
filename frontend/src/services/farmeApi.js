const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const AI_ENDPOINT = null;
export const CHAT_ENDPOINT = null;

const LEGACY_LOCAL_KEYS = ["farme.slots.v2", "farme.notifs.v1", "farme.chat.v1"];

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg).join(" ")
          : data.message || "Something went wrong. Please try again.";

    const error = new Error(message);
    error.status = response.status;

    if (Array.isArray(data.detail)) {
      error.fields = Object.fromEntries(
        data.detail
          .filter((item) => item.loc?.length > 1)
          .map((item) => [
            item.loc[item.loc.length - 1],
            item.msg,
          ])
      );
    }

    throw error;
  }

  return data;
}

export async function getSlots() {
  return apiRequest("/slots");
}

export async function createSlotAPI(slot) {
  return apiRequest("/slots", {
    method: "POST",
    body: JSON.stringify(slot),
  });
}

export async function updateSlotAPI(id, updates) {
  return apiRequest(`/slots/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function deleteSlotAPI(id) {
  return apiRequest(`/slots/${id}`, {
    method: "DELETE",
  });
}

export async function createPlantAPI(slotId, plant) {
  return apiRequest(`/slots/${slotId}/plants`, {
    method: "POST",
    body: JSON.stringify(plant),
  });
}

export async function updatePlantAPI(plantId, updates) {
  return apiRequest(`/plants/${plantId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function deletePlantAPI(plantId) {
  return apiRequest(`/plants/${plantId}`, {
    method: "DELETE",
  });
}

export async function createHarvestAPI(slotId, harvest) {
  return apiRequest(`/slots/${slotId}/harvests`, {
    method: "POST",
    body: JSON.stringify(harvest),
  });
}

export async function updateHarvestAPI(harvestId, updates) {
  return apiRequest(`/harvests/${harvestId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function deleteHarvestAPI(harvestId) {
  return apiRequest(`/harvests/${harvestId}`, {
    method: "DELETE",
  });
}

export async function createNoteAPI(slotId, note) {
  return apiRequest(`/slots/${slotId}/notes`, {
    method: "POST",
    body: JSON.stringify(note),
  });
}

export async function updateNoteAPI(noteId, updates) {
  return apiRequest(`/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function deleteNoteAPI(noteId) {
  return apiRequest(`/notes/${noteId}`, {
    method: "DELETE",
  });
}

export async function logWatering(slotId, at) {
  return apiRequest(`/slots/${slotId}/waterings`, {
    method: "POST",
    body: JSON.stringify({ at }),
  });
}

export async function getNotificationStates() {
  const rows = await apiRequest("/notifications");

  const state = { read: {}, deleted: {} };

  for (const row of rows || []) {
    if (row.read) state.read[row.id] = true;
    if (row.deleted) state.deleted[row.id] = true;
  }

  return state;
}

export async function markNotificationRead(notifId) {
  return apiRequest(`/notifications/${encodeURIComponent(notifId)}`, {
    method: "PATCH",
    body: JSON.stringify({ read: true }),
  });
}

export async function deleteNotificationAPI(notifId) {
  return apiRequest(`/notifications/${encodeURIComponent(notifId)}`, {
    method: "DELETE",
  });
}

export async function register(payload) {
  return apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      firstName: payload.firstName,
      lastName: payload.lastName,
      username: payload.username,
      email: payload.email,
      password: payload.password,
      confirmPassword: payload.confirmPassword,
      avatar: payload.avatar || null,
    }),
  });
}

export async function login(payload) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      identifier: payload.identifier,
      password: payload.password,
    }),
  });
}

export async function forgotPassword(payload) {
  return apiRequest("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({
      email: payload.email,
    }),
  });
}

export async function resetPassword(payload) {
  return apiRequest("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({
      token: payload.token,
      new_password: payload.password,
    }),
  });
}

export async function getUser() {
  const user = await apiRequest("/auth/me");

  return {
    id: user.id,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    role: user.role || "Farmer",
    avatar: user.avatar || null,
    avatarUrl: null,
  };
}


async function settingsRequest(path, options = {}) {
  try {
    return await apiRequest(path, options);
  } catch (error) {
    if (error.status === 401) {
      window.location.assign("/login");
    }

    throw error;
  }
}

export async function updateProfile(payload) {
  return settingsRequest("/users/me", {
    method: "PATCH",
    body: JSON.stringify({
      first_name: payload.firstName,
      last_name: payload.lastName,
      username: payload.username,
      avatar: payload.avatar || null,
    }),
  });
}

export async function changeEmail(payload) {
  const result = await settingsRequest("/users/me/email", {
    method: "PATCH",
    body: JSON.stringify({
      new_email: payload.email,
      current_password: payload.currentPassword,
    }),
  });

  return { email: result.email };
}

export async function changePassword(payload) {
  return settingsRequest("/users/me/password", {
    method: "PATCH",
    body: JSON.stringify({
      current_password: payload.currentPassword,
      new_password: payload.newPassword,
      confirm_new_password: payload.newPassword,
    }),
  });
}

export async function deleteAccount(payload) {
  const result = await settingsRequest("/users/me", {
    method: "DELETE",
    body: JSON.stringify({
      current_password: payload.password,
    }),
  });

  LEGACY_LOCAL_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
     
    }
  });

  return result;
}

export async function logout() {
  try {
    await apiRequest("/auth/logout", {
      method: "POST",
    });
  } finally {
    localStorage.removeItem("farme.chat.v1");
    localStorage.removeItem("fm-user");
    window.location.assign("/login");
  }
}

const COUNTRY = "PH";

const cleanArea = (value) =>
  (value || "")
    .replace(/^(province|city|municipality) of\s+/i, "")
    .trim();

const placeLabel = (result) =>
  [
    ...new Set([
      result.name,
      cleanArea(result.admin2),
      result.admin1,
    ].filter(Boolean)),
  ].join(", ");

async function searchRaw(name, count = 10) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=${count}&language=en&countryCode=${COUNTRY}&format=json`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`geocoding failed (${response.status})`);
  }

  return ((await response.json()).results || []).filter(
    (result) => result.country_code === COUNTRY
  );
}

export async function searchPlaces(query) {
  const value = query.trim();

  if (value.length < 3) return [];

  return (await searchRaw(value, 8)).map((result) => ({
    id: result.id,
    label: placeLabel(result),
    lat: result.latitude,
    lon: result.longitude,
  }));
}

export async function geocode(text) {
  const [first, ...rest] = text
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!first) return null;

  const words = first.split(/\s+/);
  const dropped = [];

  while (words.length) {
    const results = await searchRaw(words.join(" "));

    if (results.length) {
      const hint = [...dropped, ...rest]
        .join(" ")
        .toLowerCase();

      const hit =
        (hint &&
          results.find((result) =>
            `${result.admin1 || ""} ${result.admin2 || ""} ${result.admin3 || ""}`
              .toLowerCase()
              .includes(hint)
          )) ||
        results[0];

      return {
        lat: hit.latitude,
        lon: hit.longitude,
        place: placeLabel(hit),
      };
    }

    dropped.unshift(words.pop());
  }

  return null;
}

export async function reverseGeocode(lat, lon) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12&accept-language=en`
  );

  if (!response.ok) {
    throw new Error(
      `reverse geocoding failed (${response.status})`
    );
  }

  const address = (await response.json()).address || {};

  const town =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.suburb ||
    address.hamlet;

  const area =
    address.province ||
    address.county ||
    address.state_district ||
    address.state;

  return (
    [...new Set([town, area].filter(Boolean))].join(", ") ||
    null
  );
}

const WMO = (code) =>
  code === 0
    ? ["Clear", "☀️"]
    : code <= 3
      ? ["Partly cloudy", "⛅"]
      : code <= 48
        ? ["Foggy", "🌫️"]
        : code <= 67 || (code >= 80 && code <= 82)
          ? ["Rain", "🌧️"]
          : code >= 95
            ? ["Thunderstorm", "⛈️"]
            : ["Cloudy", "☁️"];

export async function fetchWeather(lat, lon) {
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&forecast_days=3&timezone=auto`
  );

  if (!response.ok) {
    throw new Error(`weather failed (${response.status})`);
  }

  const data = await response.json();
  const current = data.current;

  if (!current) {
    throw new Error("weather response had no data");
  }

  const [label, emoji] = WMO(current.weather_code);

  const daily = data.daily;
  const forecast = daily?.time
    ? daily.time.map((date, i) => ({
        date,
        label: WMO(daily.weather_code[i])[0],
        maxTemp: Math.round(daily.temperature_2m_max[i]),
        minTemp: Math.round(daily.temperature_2m_min[i]),
        rainChancePct: daily.precipitation_probability_max?.[i] ?? null,
        rainMm: daily.precipitation_sum?.[i] ?? null,
      }))
    : [];

  return {
    temp: Math.round(current.temperature_2m),
    humidity: current.relative_humidity_2m,
    label,
    emoji,
    forecast,
  };
}

export async function fetchRecommendations(ctx) {
  if (!AI_ENDPOINT) return null;

  try {
    const response = await fetch(
      `${API_BASE_URL}${AI_ENDPOINT}`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(ctx),
      }
    );

    if (!response.ok) {
      throw new Error("bad response");
    }

    return (await response.json()).recommendations || null;
  } catch {
    return null;
  }
}

export async function sendChat({ message, conversationId = null, context = null }) {
  if (!message?.trim()) {
    throw new Error("No user message provided.");
  }

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 30000);

  try {
    const response = await fetch(`${API_BASE_URL}/ai/chat`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: message.trim(),
        conversation_id: conversationId,
        context: context || {},
      }),
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Failed to get AI response.");
    }

    return {
      response: data.response,
      conversationId: data.conversation_id,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The AI response took too long. Please try again.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getCrops(search = "", category = "") {
  const params = new URLSearchParams();

  if (search.trim()) {
    params.append("search", search.trim());
  }

  if (category.trim()) {
    params.append("category", category.trim());
  }

  const query = params.toString();

  return apiRequest(`/crops${query ? `?${query}` : ""}`);
}

export async function getCropCategories() {
  return apiRequest("/crops/categories");
}

export async function getCropByKey(cropKey) {
  return apiRequest(`/crops/${encodeURIComponent(cropKey)}`);
}
