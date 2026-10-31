import { useState, useEffect, useMemo, useRef } from "react";
import {
  Play,
  Pause,
  Plus,
  Pencil,
  ArrowLeft,
  Trash2,
  Sparkles,
  Crosshair,
  MapPin,
  Droplets,
  Check,
  CheckCheck,
} from "lucide-react";
import "./dashboard.css";
import {
  db,
  getUser,
  logWatering,
  geocode,
  searchPlaces,
  reverseGeocode,
  fetchWeather,
  fetchRecommendations,
} from "../../services/farmeApi";
import {
  Img,
  Sidebar,
  ChatHead,
  Modal,
  ConfirmModal,
  Select,
  DatePicker,
} from "../../components/shared";
import { SOILS, CROPS, cropByKey } from "../../data/crops";

import dashboardNotif from "../../assets/dashboard-notif.png";
import dashboardEmpty from "../../assets/dashboard-empty-state.png";

const MAX_DIM_M = 200;
const MIN_DIM_M = 0.5;
const MAX_CELLS = 2500;
const CELL = 30; // pixel size of one grid square
const MAX_PREVIEW = 365; // how many days ahead the growth slider can go
// palette (same colors as the css variables in components/shared.css, i copied them here for svg fills)
const PINE = "#202808";
const KOMBU = "#33432B";
const DINGLEY = "#6A784D";
const BRANDY = "#DEC59E";
const COPPER = "#C4866D";
const SOIL = "#A66F57";
const STAGES = {
  planned: { label: "Not planted yet", color: BRANDY },
  sprout: { label: "Sprout", color: "#B9C79A" },
  growing: { label: "Growing", color: DINGLEY },
  flowering: { label: "Flowering", color: "#F0C4B4" },
  ready: { label: "Ready to harvest", color: KOMBU },
};

/* ---------- helpers ---------- */

// date helpers. i keep dates as yyyy-mm-dd strings so they save cleanly to a database
const todayIso = () => new Date().toLocaleDateString("en-CA");
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};
const daysBetween = (a, b) =>
  Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5);
const fmt = (n) => String(Number(n.toFixed(2)));
// philippine seasons: wet = june to november, dry = december to may
const seasonNow = () =>
  new Date().getMonth() >= 5 && new Date().getMonth() <= 10
    ? { key: "wet", label: "Wet season", span: "June to November" }
    : { key: "dry", label: "Dry season", span: "December to May" };
// checks a width / length the user typed and returns either a number or an error message
function parseDim(text) {
  const t = text.trim().replace(",", ".");
  if (!t) return { error: "Enter a number." };
  if (!/^\d*\.?\d+$/.test(t)) return { error: "Use a positive number, like 20 or 12.5." };
  const value = Number(t);
  if (value < MIN_DIM_M) return { error: `Min is ${MIN_DIM_M} m.` };
  if (value > MAX_DIM_M) return { error: `Max is ${MAX_DIM_M} m.` };
  return { value };
}
// one square = one plant of any crop. squares get bigger on very big plots so the grid stays usable.
function computeGrid(widthM, lengthM) {
  for (const size of [0.5, 1, 2, 5]) {
    const rows = Math.floor(widthM / size + 1e-9);
    const cols = Math.floor(lengthM / size + 1e-9);
    if (rows * cols <= MAX_CELLS) return { rows, cols, size, capacity: rows * cols };
  }
  return { rows: 1, cols: 1, size: 5, capacity: 1 };
}
// how far along a plant is (sprout -> ready), from its age vs the crop's maturity days
function getStage(plant, crop, asOf) {
  const age = daysBetween(plant.plantedOn, asOf);
  if (age < 0) return "planned";
  const ratio = age / crop.maturity;
  if (ratio < 0.25) return "sprout";
  if (ratio < 0.6) return "growing";
  if (ratio < 1) return "flowering";
  return "ready";
}
// reminders for the bell: harvest dates within the next 7 days (or already due),
// grouped by slot + crop + date. this is placeholder logic, later it can come from the backend.
function buildReminders(slots) {
  const groups = {};
  slots.forEach((s) =>
    s.plants.forEach((p) => {
      const c = cropByKey(p.cropKey);
      const date = addDays(p.plantedOn, c.maturity);
      const k = `${s.id}-${c.key}-${date}`;
      groups[k] = groups[k] || {
        id: k,
        slotId: s.id,
        slot: s.name,
        crop: c,
        days: daysBetween(todayIso(), date),
        count: 0,
      };
      groups[k].count++;
    }),
  );
  return Object.values(groups)
    .filter((r) => r.days <= 7)
    .sort((a, b) => a.days - b.days);
}

/* ---------- watering + notifications ---------- */

// my watering rule of thumb: early morning or before sunset is best. midday is too hot, and at night the leaves stay wet.
// phases: morning 5-10, midday 10-16, evening 16-19, night 19+. before 5 i send nothing.
// todo: if the rule changes (per crop, rain, soil moisture), only waterPhase / WATER_COPY need to change.
const dayOf = (ms) => new Date(ms).toLocaleDateString("en-CA");
function waterPhase(now) {
  const h = new Date(now).getHours();
  if (h < 5) return null;
  if (h < 10) return "morning";
  if (h < 16) return "midday";
  if (h < 19) return "evening";
  return "night";
}
const WATER_COPY = {
  morning: {
    tone: "info",
    good: true,
    title: "Time to water",
    tip: "Early morning is the best time: cooler air means less water is lost.",
  },
  midday: {
    tone: "warn",
    good: false,
    title: "Still needs water",
    tip: "It's hot now. Water evaporates fast and wet leaves can scorch, so wait until about 4 PM if you can.",
  },
  evening: {
    tone: "warn",
    good: true,
    title: "Last good time to water",
    tip: "Water before sunset, at the base of the plants, so the leaves dry before night.",
  },
  night: {
    tone: "warn",
    good: false,
    title: "Not a good time to water",
    tip: "Wet leaves overnight invite fungus. If the soil is very dry, water just the base. Otherwise do it first thing tomorrow.",
  },
};
const wateredToday = (slot, now) => !!slot.lastWatered && dayOf(slot.lastWatered) === dayOf(now);

// one notification per slot that still needs water today.
// the id includes the phase, so every new phase is a new notification. that's how the "remind me again" works.
function buildWaterNotifs(slots, now) {
  const phase = waterPhase(now);
  if (!phase) return [];
  const c = WATER_COPY[phase];
  return slots
    .filter((s) => s.plants.length > 0 && !wateredToday(s, now))
    .map((s) => ({
      id: `water-${s.id}-${dayOf(now)}-${phase}`,
      kind: "water",
      tone: c.tone,
      emoji: "💧",
      title: `${c.title}: ${s.name}`,
      text: c.tip,
      slotId: s.id,
    }));
}
// todo(backend): the server should create these (scheduled job / push) so they also arrive when the app is closed.
function buildNotifications(slots, now) {
  const harvests = buildReminders(slots).map((r) => ({
    id: `harvest-${r.id}`,
    kind: "harvest",
    tone: r.days <= 0 ? "warn" : "info",
    emoji: r.crop.emoji,
    title: `${r.crop.name} ×${r.count} in ${r.slot}`,
    text: r.days <= 0 ? "Ready to harvest." : `Harvest in ${r.days} day${r.days === 1 ? "" : "s"}.`,
    slotId: r.slotId,
  }));
  return [...buildWaterNotifs(slots, now), ...harvests];
}
/* ---------- weather + suggestions ---------- */

// react hook: loads the weather whenever the coordinates change
function useWeather(lat, lon) {
  const [state, setState] = useState({ data: null, loading: false });
  useEffect(() => {
    if (lat == null || lon == null) return setState({ data: null, loading: false });
    let live = true;
    setState({ data: null, loading: true });
    fetchWeather(lat, lon)
      .then((data) => live && setState({ data, loading: false }))
      .catch((e) => {
        console.warn("[farme] weather failed:", e.message); // shows up in the browser console if something goes wrong
        if (live) setState({ data: null, loading: false });
      });
    return () => {
      live = false;
    };
  }, [lat, lon]);
  return state;
}

// fallback recommendations: scores every crop on soil, season and temperature, then returns the top 3
function localRecommend({ soil, areaM2, season, weather }) {
  return CROPS.map((c) => {
    const why = [];
    let score = 0;
    if (c.soils.includes(soil)) ((score += 3), why.push(`${soil.toLowerCase()} soil suits it`));
    if (c.seasons.includes(season.key))
      ((score += 2), why.push(`does well in the ${season.key} season`));
    if (weather && weather.temp >= c.temp[0] && weather.temp <= c.temp[1])
      ((score += 2), why.push(`${weather.temp}°C is in its comfort range`));
    if (c.big && areaM2 < 10) score -= 2;
    return {
      key: c.key,
      score,
      reason: why.length
        ? `${why.slice(0, 2).join(" and ")}.`.replace(/^./, (m) => m.toUpperCase())
        : "Worth a try in this plot.",
    };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ key, reason }) => ({ key, reason }));
}

// asks the ai (through the api file) first. if there's no endpoint or it fails, my local rules above answer instead.
async function getRecommendations(ctx) {
  const ai = await fetchRecommendations({
    ...ctx,
    season: ctx.season.key,
    crops: CROPS.map((c) => c.key),
  });
  const items = (ai || []).filter((r) => cropByKey(r.key)).slice(0, 3);
  if (items.length) return { items, source: "ai" };
  return { items: localRecommend(ctx), source: "rules" };
}

/* ---------- small ui pieces + the add slot flow ---------- */

// placeholder picture of a field (swap it for a real image later, keep the size fixed)
function SlotThumb() {
  return (
    <svg
      viewBox="0 0 160 70"
      className={`w-full block border-b-[3px] border-[#202808]`}
      aria-hidden="true"
    >
      <rect width="160" height="70" fill={DINGLEY} />
      <rect
        x="14"
        y="10"
        width="132"
        height="50"
        rx="6"
        fill={SOIL}
        stroke={PINE}
        strokeWidth="3"
      />
      {[0, 1, 2, 3].map((i) => (
        <line
          key={i}
          x1="22"
          x2="138"
          y1={21 + i * 11}
          y2={21 + i * 11}
          stroke="#6E4637"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

// weather + season in one bar: weather on the left, season on the right.
// props: wx = { data, loading } from useWeather, season = { key, label, span } from seasonNow,
//        onSetLocation = optional, shows a "set location" link when there's no weather
// styles are in dashboard.css (.fm-conditions). the season half is kombu in the wet season and copper in the dry season.
function ConditionsBar({ wx, season, onSetLocation }) {
  const w = wx.data;
  return (
    <div className="fm-conditions" role="group" aria-label="Weather and season">
      <div className="fm-conditions__cell">
        <span className="fm-conditions__icon" aria-hidden="true">
          {w ? w.emoji : "🌡️"}
        </span>
        <div className="min-w-0">
          <p className="fm-conditions__big">{w ? `${w.temp}°C` : wx.loading ? "…" : "--"}</p>
          <p className="fm-conditions__small">
            {w ? (
              `${w.label} · ${w.humidity}% humidity`
            ) : wx.loading ? (
              "Loading weather"
            ) : onSetLocation ? (
              <button
                type="button"
                onClick={onSetLocation}
                className="min-h-[44px] text-left underline font-bold"
              >
                Weather unavailable. Set location
              </button>
            ) : (
              "Weather unavailable"
            )}
          </p>
        </div>
      </div>
      <div className={`fm-conditions__cell fm-conditions__cell--${season.key}`}>
        <span className="fm-conditions__icon" aria-hidden="true">
          {season.key === "wet" ? "🌧️" : "☀️"}
        </span>
        <div className="min-w-0">
          <p className="fm-conditions__big">{season.label}</p>
          <p className="fm-conditions__small">{season.span}</p>
        </div>
      </div>
    </div>
  );
}

function InfoBox({ slot }) {
  const items = [
    ["Plot size", `${fmt(slot.widthM)} × ${fmt(slot.lengthM)} m`],
    ["Soil type", slot.soil],
    ["Location", slot.place || slot.location || "Not set"],
  ];
  return (
    <div className="bg-[#DEC59E] border-[3px] border-[#202808] rounded-xl p-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        {items.map(([k, v]) => (
          <div key={k}>
            <p className="font-bold">{k}</p>
            <p className="bg-[#FBF6EA] border-2 border-[#202808] rounded-lg px-2 py-1 mt-1 break-words">
              {v}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- location picker: search, current location, or drop a pin on the map ---------- */

// leaflet (the map library) loads from a cdn the first time a map shows, so there's nothing to install.
// if it can't load (offline, blocked), the picker still works with search and "use my location".
const LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4";
let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = `${LEAFLET}/leaflet.css`;
      document.head.appendChild(css);
      const js = document.createElement("script");
      js.src = `${LEAFLET}/leaflet.js`;
      js.onload = () => resolve(window.L);
      js.onerror = () => {
        leafletPromise = null; // so it can try again next time
        reject(new Error("map failed to load"));
      };
      document.head.appendChild(js);
    });
  }
  return leafletPromise;
}

const PH_CENTER = [12.9, 122.8]; // the map starts on the philippines until a place is picked

// the map. tap anywhere or drag the pin to choose the exact spot.
// props: value = { lat, lon }, onPick(lat, lon) = called with the chosen spot
function PinMap({ value, onPick }) {
  const box = useRef(null);
  const mapRef = useRef({}); // { map, marker } once the map is ready
  const valueRef = useRef(value); // always the latest value, so a slow map load never uses an old one
  const pickRef = useRef(onPick);
  valueRef.current = value;
  pickRef.current = onPick;
  const [failed, setFailed] = useState(false);

  const sync = () => {
    const { map, marker } = mapRef.current;
    const v = valueRef.current;
    if (!map || v.lat == null) return;
    marker.addTo(map);
    marker.setLatLng([v.lat, v.lon]);
    map.setView([v.lat, v.lon], Math.max(map.getZoom(), 13));
  };

  useEffect(() => {
    let dead = false;
    loadLeaflet()
      .then((L) => {
        if (dead || !box.current) return;
        const map = L.map(box.current, { center: PH_CENTER, zoom: 5, scrollWheelZoom: false });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap contributors",
        }).addTo(map);
        const icon = L.divIcon({
          className: "fm-pin",
          html: "<span></span>",
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        });
        const marker = L.marker(PH_CENTER, { icon, draggable: true });
        map.on("click", (e) => {
          marker.addTo(map);
          marker.setLatLng(e.latlng);
          pickRef.current(e.latlng.lat, e.latlng.lng);
        });
        marker.on("dragend", () => {
          const at = marker.getLatLng();
          pickRef.current(at.lat, at.lng);
        });
        mapRef.current = { map, marker };
        sync();
        setTimeout(() => map.invalidateSize(), 80); // the dialog animates in, so i measure the size again once it settles
      })
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
      mapRef.current.map?.remove();
      mapRef.current = {};
    };
  }, []);

  // move the pin when the spot changes from outside (search, "use my location")
  useEffect(sync, [value.lat, value.lon]);

  if (failed)
    return (
      <p className="text-sm">
        The map couldn't load, but you can still search or use your location.
      </p>
    );
  return (
    <div
      ref={box}
      className="fm-map"
      role="application"
      aria-label="Map. Tap to drop the pin, or drag it."
    />
  );
}

// location field: type to search places, use the device's location, or tap the map.
// props: value = { text, lat, lon, place }, onChange = gets the new value, error = message under the field
function LocationPicker({ value, onChange, error }) {
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | empty | error (so the user always sees what's going on)
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");
  const asked = useRef(0); // counts name lookups so only the newest answer gets used

  // look up suggestions 300ms after the last key. nothing to look up once a place is picked.
  useEffect(() => {
    const q = value.text.trim();
    if (value.lat != null || q.length < 3) {
      setResults([]);
      setStatus("idle");
      return;
    }
    let live = true;
    setStatus("loading");
    const t = setTimeout(() => {
      searchPlaces(q)
        .then((r) => {
          if (!live) return;
          setResults(r);
          setStatus(r.length ? "idle" : "empty");
        })
        .catch(() => {
          if (!live) return;
          setResults([]);
          setStatus("error");
        });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [value.text, value.lat]);

  // typing again clears the picked place, so the coordinates always match the text
  const type = (text) => {
    asked.current++;
    setNote("");
    onChange({ text, lat: null, lon: null, place: null });
  };
  const pick = (r) => {
    asked.current++;
    setResults([]);
    setStatus("idle");
    onChange({ text: r.label, lat: r.lat, lon: r.lon, place: r.label });
  };

  // a spot from the map or the device: show it right away, then look up its name
  const setSpot = async (lat, lon) => {
    const id = ++asked.current;
    const coords = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    setNote("");
    onChange({ text: coords, lat, lon, place: coords });
    let label = null;
    try {
      label = await reverseGeocode(lat, lon);
    } catch {
      /* no name found: keep the coordinates */
    }
    if (label && id === asked.current) onChange({ text: label, lat, lon, place: label });
  };

  // ask the browser for the device's location (needs https or localhost, plus the user's permission)
  const useMyLocation = () => {
    if (!navigator.geolocation)
      return setNote(
        "This browser can't share your location. Search for your town or tap the map.",
      );
    setLocating(true);
    setNote("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        setSpot(coords.latitude, coords.longitude);
      },
      (e) => {
        setLocating(false);
        setNote(
          e.code === 1
            ? "Location access is blocked. Allow it in your browser's site settings, or search for your town."
            : "Couldn't get your location. Search for your town or tap the map instead.",
        );
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  };

  const q = value.text.trim();
  const message =
    value.lat != null
      ? `📍 Weather will use ${value.place || value.text}.`
      : note
        ? note
        : status === "loading"
          ? "Searching…"
          : status === "empty"
            ? `No places found for "${q}". Try another spelling, or tap the map.`
            : status === "error"
              ? "Couldn't reach the place search. Check your connection, or tap the map to drop a pin."
              : results.length
                ? "Tap a place below."
                : "Search your town, use your location, or tap the map to drop a pin.";

  return (
    <div className="flex flex-col gap-2">
      <div>
        <label htmlFor="slot-loc" className="block font-bold mb-1">
          Location
        </label>
        <div className="flex gap-2">
          <input
            id="slot-loc"
            value={value.text}
            autoComplete="off"
            onChange={(e) => type(e.target.value)}
            placeholder="Search your town or city"
            aria-describedby="slot-loc-note"
            className="fm-input"
          />
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="fm-btn fm-btn--light shrink-0 flex items-center gap-2"
            aria-label="Use my current location"
          >
            <Crosshair size={16} />
            <span className="hidden sm:inline">{locating ? "Locating…" : "Use my location"}</span>
          </button>
        </div>
      </div>
      {/* suggestions: part of the page flow (not floating) so the dialog never clips them */}
      {results.length > 0 && (
        <ul aria-label="Place suggestions" className="fm-suggest">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => pick(r)}>
                <MapPin size={14} className="shrink-0" />
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p id="slot-loc-note" role="status" className="text-sm min-h-[20px]">
        {message}
      </p>
      <PinMap value={value} onPick={setSpot} />
      <p role="alert" className="fm-error text-sm min-h-[20px]">
        {error}
      </p>
    </div>
  );
}

/* step 1: the form. i also use it to edit a slot: pass slot = the slot being edited and the fields start filled in */
function AddSlotModal({ slot, defaultName, onSubmit, onClose }) {
  const editing = !!slot;
  const [name, setName] = useState(slot ? slot.name : defaultName);
  const [w, setW] = useState(slot ? String(slot.widthM) : "");
  const [l, setL] = useState(slot ? String(slot.lengthM) : "");
  const [loc, setLocRaw] = useState(
    slot
      ? {
          text: slot.place || slot.location || "",
          lat: slot.lat ?? null,
          lon: slot.lon ?? null,
          place: slot.place ?? null,
        }
      : { text: "", lat: null, lon: null, place: null },
  ); // the chosen location
  const [geoErr, setGeoErr] = useState("");
  const setLoc = (v) => {
    setGeoErr("");
    setLocRaw(v);
  };
  const [soil, setSoil] = useState(slot ? slot.soil : "");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const pw = parseDim(w);
  const pl = parseDim(l);
  const area = pw.value && pl.value ? pw.value * pl.value : null;
  const locError = !loc.text.trim() ? "Pick or search for your town or city." : "";
  const soilError = !soil ? "Pick a soil type." : "";

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    if (pw.error || pl.error || locError || soilError) return;
    setBusy(true);
    // use the picked place if there is one, otherwise try to find what was typed
    let geo = loc.lat != null ? loc : null;
    if (!geo) {
      try {
        geo = await geocode(loc.text.trim());
      } catch {
        /* offline: the slot still gets created,, just without weather */
      }
    }
    // when editing, a place i can't find is an error (para dili ma-lose ang weather location by accident)
    if (editing && !geo) {
      setBusy(false);
      return setGeoErr("We couldn't find that place. Pick one from the suggestions.");
    }
    onSubmit({
      name: name.trim() || (slot ? slot.name : defaultName),
      widthM: pw.value,
      lengthM: pl.value,
      location: loc.text.trim(),
      soil,
      lat: geo?.lat ?? null,
      lon: geo?.lon ?? null,
      place: geo?.place ?? null,
    });
    setBusy(false); // when editing, the form stays open under the "save changes?" dialog
  };

  const err = (id, show, text) => (
    <p id={`${id}-err`} role="alert" className="fm-error text-sm min-h-[20px]">
      {show ? text : ""}
    </p>
  );
  const dim = (label, id, value, setValue, parsed) => (
    <div>
      <label htmlFor={id} className="block font-bold mb-1">
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. 20"
        aria-invalid={(tried || value) && parsed.error ? "true" : "false"}
        aria-describedby={`${id}-err`}
        className="fm-input"
      />
      {err(id, (tried || value) && parsed.error, parsed.error)}
    </div>
  );

  return (
    <Modal title={editing ? "Edit slot" : "Add a slot"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
        <div>
          <label htmlFor="slot-name" className="block font-bold mb-1">
            Field name
          </label>
          <input
            id="slot-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="fm-input"
          />
        </div>
        <p className="font-bold mt-2" aria-live="polite">
          Plot size: {area ? `${fmt(area)} m²` : "—"}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {dim("Width (m)", "slot-w", w, setW, pw)}
          {dim("Length (m)", "slot-l", l, setL, pl)}
        </div>
        <LocationPicker value={loc} onChange={setLoc} error={tried ? locError || geoErr : ""} />
        <div>
          <label htmlFor="slot-soil" className="block font-bold mb-1">
            Soil type
          </label>
          <Select
            id="slot-soil"
            value={soil}
            onChange={setSoil}
            options={SOILS}
            placeholder="Select soil type"
            describedBy="slot-soil-err"
          />
          {err("slot-soil", tried, soilError)}
        </div>
        <button type="submit" disabled={busy} className={`fm-btn fm-btn--primary mt-1`}>
          {editing ? (busy ? "Checking…" : "Save changes") : busy ? "Creating…" : "Create slot"}
        </button>
      </form>
    </Modal>
  );
}

/* step 2: success summary */
function SuccessModal({ slot, onProceed, onClose }) {
  return (
    <Modal title="Slot created successfully!" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-5xl text-center" aria-hidden="true">
          🌱
        </p>
        <InfoBox slot={slot} />
        {slot.lat == null && (
          <p className="text-sm">
            We couldn’t find “{slot.location}” on the map, so weather and local suggestions will be
            limited. You can still plant.
          </p>
        )}
        <button onClick={onProceed} className="fm-btn fm-btn--primary">
          Proceed
        </button>
      </div>
    </Modal>
  );
}

/* step 3: slot details + recommended crops */
function SlotDetailModal({ slot, wx, onPick, onClose }) {
  const [recs, setRecs] = useState(null);
  useEffect(() => {
    if (wx.loading) return;
    let live = true;
    setRecs(null);
    getRecommendations({
      soil: slot.soil,
      location: slot.place || slot.location,
      areaM2: slot.widthM * slot.lengthM,
      season: seasonNow(),
      weather: wx.data,
    }).then((r) => live && setRecs(r));
    return () => {
      live = false;
    }
  }, [slot.id, wx.loading]);

  return (
    <Modal title={slot.name} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div
            className={`w-full max-w-[160px] sm:w-28 shrink-0 overflow-hidden rounded-xl border-[3px] border-[#202808] self-start`}
          >
            <SlotThumb />
          </div>
          <div className="flex-1 min-w-0">
            <InfoBox slot={slot} />
          </div>
        </div>
        <ConditionsBar wx={wx} season={seasonNow()} />
        <div>
          <h3 className="font-display text-xl font-bold flex items-center gap-2">
            <Sparkles size={18} /> Recommended crops
          </h3>
          <p className="text-sm mb-2">
            {recs?.source === "ai"
              ? "Suggested by AI for your soil, season and weather."
              : "Picked for your soil, the season and today’s weather."}
          </p>
          {!recs ? (
            <p aria-live="polite">Finding the best crops for {slot.name}…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {recs.items.map((r) => {
                const c = cropByKey(r.key);
                return (
                  <div key={r.key} className={`fm-panel p-3 flex flex-col gap-1 text-center`}>
                    <span className="text-4xl" aria-hidden="true">
                      {c.emoji}
                    </span>
                    <p className="font-display font-bold">{c.name}</p>
                    <p className="text-xs">
                      {c.en} · ~{c.maturity} days
                    </p>
                    <p className="text-sm flex-1">{r.reason}</p>
                    <button
                      onClick={() => onPick(r.key)}
                      className={`fm-btn fm-btn--accent !text-sm !px-2 mt-1`}
                    >
                      Plant this crop
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <button onClick={onClose} className="fm-btn fm-btn--light">
          Choose a crop later
        </button>
      </div>
    </Modal>
  );
}

// the notification bell in the header + its dropdown (watering and harvest reminders).
function ReminderBell({ notifs, onRead, onReadAll, onDelete, onDeleteAll, onOpen }) {
  const [open, setOpen] = useState(false);
  const unread = notifs.filter((n) => !n.read).length;
  const small = "!min-h-[34px] !px-2 !text-xs flex items-center gap-1";
  const tiny = "!min-h-[32px] !w-[32px] !px-0 flex items-center justify-center";
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications, ${unread} unread`}
        aria-expanded={open}
        className={`fm-btn fm-btn--light relative w-11 !px-0 flex items-center justify-center`}
      >
        <Img src={dashboardNotif} alt="" w={28} h={28} label="bell" />
        {unread > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1 rounded-full bg-[#C4866D] border-2 border-[#202808] text-xs font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className={`fm-card absolute right-0 top-full mt-2 z-20 w-[min(22rem,calc(100vw-1.5rem))] p-3 flex flex-col gap-2`}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-display font-bold">Notifications</p>
            {notifs.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={onReadAll}
                  disabled={unread === 0}
                  className={`fm-btn fm-btn--light ${small}`}
                >
                  <CheckCheck size={14} /> Read all
                </button>
                <button onClick={onDeleteAll} className={`fm-btn fm-btn--danger-light ${small}`}>
                  <Trash2 size={14} /> Clear all
                </button>
              </div>
            )}
          </div>
          {notifs.length === 0 && (
            <p className="text-sm">
              You're all caught up. Watering and harvest reminders show up here once you plant
              something.
            </p>
          )}
          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {notifs.map((n) => (
              <div
                key={n.id}
                className={`fm-panel p-2 text-sm flex items-start gap-2 ${n.read ? "opacity-60" : ""} ${n.tone === "warn" && !n.read ? "!border-[#8A3A28]" : ""}`}
              >
                <span
                  className={`mt-1.5 w-2.5 h-2.5 shrink-0 rounded-full border-2 ${n.read ? "border-transparent" : "bg-[#C4866D] border-[#202808]"}`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className={n.read ? "" : "font-bold"}>
                    {n.emoji} {n.title}
                  </p>
                  <p className="text-xs">{n.text}</p>
                  {n.slotId && (
                    <button
                      onClick={() => {
                        setOpen(false);
                        onOpen(n);
                      }}
                      className="underline font-bold text-xs mt-1"
                    >
                      Open slot
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!n.read && (
                    <button
                      onClick={() => onRead(n.id)}
                      aria-label="Mark as read"
                      title="Mark as read"
                      className={`fm-btn fm-btn--light ${tiny}`}
                    >
                      <Check size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(n.id)}
                    aria-label="Delete notification"
                    title="Delete"
                    className={`fm-btn fm-btn--danger-light ${tiny}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// the planting grid. every square is clickable and shows the crop's emoji + its growth stage color
function PlotGrid({ grid, plantMap, asOf, selected, onSelect, onActivate }) {
  const { rows, cols } = grid;
  const onKeyDown = (e) => {
    const map = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (map[e.key]) {
      e.preventDefault();
      const [dr, dc] = map[e.key];
      onSelect(
        selected
          ? {
              row: Math.min(rows - 1, Math.max(0, selected.row + dr)),
              col: Math.min(cols - 1, Math.max(0, selected.col + dc)),
            }
          : { row: 0, col: 0 },
      );
    } else if ((e.key === "Enter" || e.key === " ") && selected) {
      e.preventDefault();
      onActivate(selected);
    }
  };

  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const plant = plantMap.get(`${row}-${col}`);
      const crop = plant ? cropByKey(plant.cropKey) : null;
      const isSel = selected && selected.row === row && selected.col === col;
      cells.push(
        <g
          key={`${row}-${col}`}
          onClick={() => onActivate({ row, col })}
          className="cursor-pointer"
        >
          <rect
            x={col * CELL + 1}
            y={row * CELL + 1}
            width={CELL - 2}
            height={CELL - 2}
            rx={5}
            fill={plant ? STAGES[getStage(plant, crop, asOf)].color : COPPER}
            stroke={plant ? PINE : "#8E5A45"}
            strokeWidth={plant ? 2 : 1}
          />
          {plant && (
            <text
              x={col * CELL + CELL / 2}
              y={row * CELL + CELL / 2 + 6}
              textAnchor="middle"
              fontSize="18"
              pointerEvents="none"
            >
              {crop.emoji}
            </text>
          )}
          {isSel && (
            <rect
              x={col * CELL + 1}
              y={row * CELL + 1}
              width={CELL - 2}
              height={CELL - 2}
              rx={5}
              fill="none"
              stroke="#fff"
              strokeWidth={3}
              pointerEvents="none"
            />
          )}
          {isSel && (
            <rect
              x={col * CELL - 1}
              y={row * CELL - 1}
              width={CELL + 2}
              height={CELL + 2}
              rx={6}
              fill="none"
              stroke={PINE}
              strokeWidth={2}
              pointerEvents="none"
            />
          )}
        </g>,
      );
    }
  }

  return (
    <div
      className={`overflow-auto rounded-xl border-[3px] border-[#202808] bg-[#A66F57] p-2`}
      style={{ maxHeight: 460 }}
    >
      <svg
        width={cols * CELL}
        height={rows * CELL}
        viewBox={`0 0 ${cols * CELL} ${rows * CELL}`}
        style={{ display: "block", margin: "0 auto", maxWidth: "none" }}
        tabIndex={0}
        role="group"
        aria-label={`Planting grid, ${rows} rows by ${cols} columns. Arrow keys move, Enter plants or selects.`}
        onKeyDown={onKeyDown}
      >
        {cells}
      </svg>
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className={`flex-1 basis-32 fm-panel p-3`}>
      <p className="text-sm font-bold">{label}</p>
      <p className="font-display text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs">{hint}</p>}
    </div>
  );
}

/* ---------- main ---------- */

// main screen: owns all the state and wires the nav, header, slot list, slot view and modals together
export default function FarMeDashboard() {
  // state: slots = all saved fields, loaded = the db finished loading
  const [slots, setSlots] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false); // edit the open slot
  const [pendingEdit, setPendingEdit] = useState(null); // { data, changes }: edits waiting for "save these changes?"
  const [confirm, setConfirm] = useState(null); // { type: "plant" | "notif" | "notifs", id? }: a delete waiting for a yes / no
  const [toDelete, setToDelete] = useState(null); // the slot waiting for a yes / no
  const [flow, setFlow] = useState(null); // { step: "success" | "detail", id }
  // brush = the crop that gets planted when an empty square is clicked
  const [brush, setBrush] = useState(null); // the crop key chosen for planting
  const [selected, setSelected] = useState(null);
  const [plantedOn, setPlantedOn] = useState(todayIso());
  const [preview, setPreview] = useState(0);
  const [playing, setPlaying] = useState(false);

  // load the slots once on start, then save them every time they change
  // todo(backend): i save the whole list on every change. later, call the create / update / delete endpoints inside each action instead.
  useEffect(() => {
    db.loadSlots().then((s) => {
      setSlots(s);
      setLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (loaded) db.saveSlots(slots);
  }, [slots, loaded]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setPreview((d) => {
        if (d >= MAX_PREVIEW) {
          setPlaying(false);
          return d;
        }
        return Math.min(MAX_PREVIEW, d + 3);
      });
    }, 200);
    return () => clearInterval(t);
  }, [playing]);

  // the signed-in user
  // todo(backend): getUser in the api file
  const [user, setUser] = useState({ firstName: "there", lastName: "" });
  useEffect(() => {
    getUser().then(setUser);
  }, []);

  // slot = the slot being viewed, flowSlot = the one in the add-slot modals
  const slot = slots.find((s) => s.id === openId) || null;
  const flowSlot = flow ? slots.find((s) => s.id === flow.id) || null : null;
  // weather is only needed when a slot is open (or in its modal), not on the main dashboard
  const wxSlot = flowSlot || slot || null;
  const wx = useWeather(wxSlot?.lat, wxSlot?.lon);
  const season = seasonNow();

  // grid size, planted squares (by row-col), and the selected square's plant
  const grid = useMemo(
    () => (slot ? computeGrid(slot.widthM, slot.lengthM) : null),
    [slot?.widthM, slot?.lengthM],
  );
  const plantMap = useMemo(
    () => new Map((slot ? slot.plants : []).map((p) => [`${p.row}-${p.col}`, p])),
    [slot],
  );
  const asOf = addDays(todayIso(), preview);
  const selPlant = selected ? plantMap.get(`${selected.row}-${selected.col}`) : null;
  const selCrop = selPlant ? cropByKey(selPlant.cropKey) : null;
  const brushCrop = cropByKey(brush);

  const updateSlot = (id, fn) => setSlots((all) => all.map((s) => (s.id === id ? fn(s) : s)));
  const uniqueName = (base) => {
    let name = base;
    let n = 2;
    while (slots.some((s) => s.name.toLowerCase() === name.toLowerCase()))
      name = `${base} (${n++})`;
    return name;
  };

  // step 1 -> step 2: save the new slot and show the success modal
  // todo(backend): POST /slots
  const createSlot = (data) => {
    const id = crypto.randomUUID();
    setSlots((all) => [...all, { id, ...data, name: uniqueName(data.name), plants: [] }]);
    setShowAdd(false);
    setFlow({ step: "success", id });
  };

  // open a slot's grid and reset the selection + growth preview
  const openSlot = (id) => {
    setOpenId(id);
    setSelected(null);
    setPreview(0);
    setPlaying(false);
  };

  // 'plant this crop' in the detail modal: select that crop and go to the grid
  const pickRecommended = (key) => {
    setBrush(key);
    openSlot(flow.id);
    setFlow(null);
  };

  const closeFlow = () => {
    if (flow) openSlot(flow.id);
    setFlow(null);
  };

  // click / enter on a square: plant the selected crop if it's empty, otherwise just select it.
  // todo(backend): POST /slots/:id/plants
  const activateCell = (cell) => {
    setSelected(cell);
    if (!slot || !brush || plantMap.has(`${cell.row}-${cell.col}`)) return;
    updateSlot(slot.id, (s) => ({
      ...s,
      plants: [
        ...s.plants,
        { id: crypto.randomUUID(), row: cell.row, col: cell.col, cropKey: brush, plantedOn },
      ],
    }));
  };

  // todo(backend): DELETE /plants/:id
  const removePlant = (id) =>
    updateSlot(slot.id, (s) => ({ ...s, plants: s.plants.filter((p) => p.id !== id) }));
  // todo(backend): DELETE /slots/:id
  const doDelete = () => {
    setSlots((all) => all.filter((s) => s.id !== toDelete.id));
    if (openId === toDelete.id) setOpenId(null);
    setToDelete(null);
  };

  const counts = slot
    ? slot.plants.reduce((m, p) => ({ ...m, [p.cropKey]: (m[p.cropKey] || 0) + 1 }), {})
    : {};

  // notifications for the bell (see buildNotifications near the top of this file).
  // "now" ticks every minute so the watering reminders change as the time of day changes.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  // read / deleted marks, loaded and saved through the api file
  const [nstate, setNstate] = useState({ read: {}, deleted: {} });
  const [nLoaded, setNLoaded] = useState(false);
  useEffect(() => {
    db.loadNotifState().then((st) => {
      setNstate(st);
      setNLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (nLoaded) db.saveNotifState(nstate);
  }, [nstate, nLoaded]);
  const allNotifs = useMemo(() => buildNotifications(slots, now), [slots, now]);
  // drop the marks of notifications that no longer exist, so the saved list doesn't grow forever
  useEffect(() => {
    if (!loaded || !nLoaded) return;
    const ids = new Set(allNotifs.map((n) => n.id));
    const keep = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => ids.has(k)));
    setNstate((st) => {
      const read = keep(st.read);
      const deleted = keep(st.deleted);
      return Object.keys(read).length === Object.keys(st.read).length &&
        Object.keys(deleted).length === Object.keys(st.deleted).length
        ? st
        : { read, deleted };
    });
  }, [allNotifs, loaded, nLoaded]);
  const notifs = allNotifs
    .filter((n) => !nstate.deleted[n.id])
    .map((n) => ({ ...n, read: !!nstate.read[n.id] }));
  // todo(backend): read / delete should also call the notifications api (PATCH / DELETE /notifications/:id)
  const markRead = (id) => setNstate((st) => ({ ...st, read: { ...st.read, [id]: true } }));
  const markAllRead = () =>
    setNstate((st) => ({
      ...st,
      read: { ...st.read, ...Object.fromEntries(notifs.map((n) => [n.id, true])) },
    }));
  const deleteNotif = (id) =>
    setNstate((st) => ({ ...st, deleted: { ...st.deleted, [id]: true } }));
  const deleteAllNotifs = () =>
    setNstate((st) => ({
      ...st,
      deleted: { ...st.deleted, ...Object.fromEntries(notifs.map((n) => [n.id, true])) },
    }));
  // "water plants": remember when this slot was last watered (saved with the slot)
  // todo(backend): PATCH /slots/:id { lastWatered } and POST /slots/:id/waterings (logWatering is the placeholder)
  const waterSlot = () => {
    const at = Date.now();
    updateSlot(slot.id, (s) => ({ ...s, lastWatered: at }));
    logWatering(slot.id, at);
  };

  // edit slot: the form hands over the new values, i list what changed and ask before saving
  // todo(backend): re-check the new size / name on the server too
  const requestEdit = (data) => {
    let name = data.name;
    let n = 2;
    while (slots.some((x) => x.id !== slot.id && x.name.toLowerCase() === name.toLowerCase()))
      name = `${data.name} (${n++})`;
    const next = { ...data, name };
    const changes = [];
    if (next.name !== slot.name) changes.push(`Name: ${slot.name} → ${next.name}`);
    if (next.widthM !== slot.widthM || next.lengthM !== slot.lengthM)
      changes.push(
        `Size: ${fmt(slot.widthM)} × ${fmt(slot.lengthM)} m → ${fmt(next.widthM)} × ${fmt(next.lengthM)} m`,
      );
    if (
      next.lat !== (slot.lat ?? null) ||
      next.lon !== (slot.lon ?? null) ||
      (next.place || next.location) !== (slot.place || slot.location)
    )
      changes.push(`Location: ${slot.place || slot.location} → ${next.place || next.location}`);
    if (next.soil !== slot.soil) changes.push(`Soil: ${slot.soil} → ${next.soil}`);
    if (changes.length === 0) return setShowEdit(false); // nothing changed, so there's nothing to confirm
    // a smaller plot can leave planted squares outside the new grid
    const oldGrid = computeGrid(slot.widthM, slot.lengthM);
    const newGrid = computeGrid(next.widthM, next.lengthM);
    const lost = slot.plants.filter((p) => p.row >= newGrid.rows || p.col >= newGrid.cols).length;
    if (newGrid.size !== oldGrid.size)
      changes.push(`Each square changes from ${oldGrid.size} m to ${newGrid.size} m.`);
    if (lost > 0)
      changes.push(
        `${lost} planted square${lost === 1 ? "" : "s"} fall outside the new size and will be removed.`,
      );
    setPendingEdit({ data: next, changes, warn: lost > 0 });
  };
  // todo(backend): PATCH /slots/:id, and delete the plants that fell outside the new size
  const applyEdit = () => {
    const { data } = pendingEdit;
    const g = computeGrid(data.widthM, data.lengthM);
    updateSlot(slot.id, (s) => ({
      ...s,
      ...data,
      plants: s.plants.filter((p) => p.row < g.rows && p.col < g.cols),
    }));
    setSelected(null);
    setPendingEdit(null);
    setShowEdit(false);
  };

  // deleting a plant or notification(s) always asks first (see confirmInfo + runConfirm)
  const confirmPlant =
    confirm?.type === "plant" && slot ? slot.plants.find((p) => p.id === confirm.id) : null;
  const confirmInfo =
    confirm?.type === "plant" && confirmPlant
      ? {
          title: "Remove this plant?",
          message: `${cropByKey(confirmPlant.cropKey)?.name} at row ${confirmPlant.row + 1}, column ${confirmPlant.col + 1} will be removed from this slot.`,
          label: "Remove plant",
        }
      : confirm?.type === "notif"
        ? {
            title: "Delete this notification?",
            message: "It will be removed from your list.",
            label: "Delete",
          }
        : confirm?.type === "notifs"
          ? {
              title: "Delete all notifications?",
              message: `All ${notifs.length} notification${notifs.length === 1 ? "" : "s"} will be removed from your list.`,
              label: "Delete all",
            }
          : null;
  const runConfirm = () => {
    if (confirm.type === "plant") removePlant(confirm.id);
    else if (confirm.type === "notif") deleteNotif(confirm.id);
    else deleteAllNotifs();
    setConfirm(null);
  };

  // what the chatbot knows: the open slot (if any), the season and the weather
  const chatContext = {
    page: "dashboard",
    season: season.key,
    slot: slot && {
      name: slot.name,
      soil: slot.soil,
      location: slot.place || slot.location,
      areaM2: Math.round(slot.widthM * slot.lengthM),
      weather: wx.data,
      planted: counts,
    },
  };

  const emptyState = (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-10">
      {/* empty state image: i crop it because the png has blank space around the drawing. change w / ratio to resize, and the 40% to move the crop */}
      <Img
        src={dashboardEmpty}
        alt=""
        w={380}
        ratio="380 / 230"
        label="empty"
        className="object-cover object-[50%_40%] max-w-full"
      />
      <p className="font-display text-xl font-bold mt-2">No farm slots yet</p>
      <p>
        Your farm is still empty.{" "}
        <button onClick={() => setShowAdd(true)} className={`underline font-bold text-[#33432B]`}>
          Add a slot
        </button>{" "}
        to start planning your crops.
      </p>
    </div>
  );

  const cropButton = (c) => (
    <button
      key={c.key}
      onClick={() => setBrush(brush === c.key ? null : c.key)}
      aria-pressed={brush === c.key}
      className={`min-h-[44px] px-3 rounded-xl border-[3px] border-[#202808] font-bold flex items-center gap-2 ${brush === c.key ? `bg-[#33432B] text-[#FBF6EA] shadow-[3px_3px_0_#C4866D]` : `bg-white`}`}
    >
      <span className="text-xl" aria-hidden="true">
        {c.emoji}
      </span>
      {c.name}
    </button>
  );

  return (
    <div className={`min-h-screen bg-[#F1E7D2] text-[#202808] flex flex-col md:flex-row font-body`}>
      <Sidebar active="dashboard" user={user} onHome={() => setOpenId(null)} />

      <div className="flex-1 min-w-0 p-3 sm:p-5 flex flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl sm:text-3xl font-bold truncate">
            Hello, {user.firstName}
          </h1>
          <ReminderBell
            notifs={notifs}
            onRead={markRead}
            onReadAll={markAllRead}
            onDelete={(id) => setConfirm({ type: "notif", id })}
            onDeleteAll={() => setConfirm({ type: "notifs" })}
            onOpen={(n) => {
              markRead(n.id);
              openSlot(n.slotId);
            }}
          />
        </header>

        <section className={`fm-card flex-1 p-3 sm:p-5 flex flex-col gap-4`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {slot ? (
              <button
                onClick={() => setOpenId(null)}
                className="flex items-center gap-2 min-h-[44px] font-bold"
              >
                <ArrowLeft size={18} /> All slots
              </button>
            ) : (
              <span />
            )}
            {slot ? (
              <div className="flex items-center gap-3 flex-wrap justify-end">
                <div className="text-sm text-right" aria-live="polite">
                  <p className="font-bold">
                    {slot.lastWatered
                      ? `Last watered: ${wateredToday(slot, now) ? "today" : new Date(slot.lastWatered).toLocaleDateString([], { month: "short", day: "numeric" })}, ${new Date(slot.lastWatered).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                      : "Not watered yet"}
                  </p>
                  {slot.plants.length > 0 && !wateredToday(slot, now) && waterPhase(now) && (
                    <p className={WATER_COPY[waterPhase(now)].good ? "" : "fm-error"}>
                      {WATER_COPY[waterPhase(now)].good
                        ? "Good time to water."
                        : "Not the best time to water right now."}
                    </p>
                  )}
                </div>
                <button
                  onClick={waterSlot}
                  disabled={slot.plants.length === 0}
                  title={
                    slot.plants.length === 0
                      ? "Plant something first"
                      : "Log that you watered this slot"
                  }
                  className={`fm-btn fm-btn--primary flex items-center gap-2`}
                >
                  <Droplets size={16} /> Water plants
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAdd(true)}
                className={`fm-btn fm-btn--primary flex items-center gap-2`}
              >
                <Plus size={16} /> Add slot
              </button>
            )}
          </div>

          {!slot && slots.length === 0 && emptyState}
          {!slot && slots.length > 0 && (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}
            >
              {slots.map((s) => {
                const emojis = [...new Set(s.plants.map((p) => cropByKey(p.cropKey)?.emoji))].join(
                  " ",
                );
                return (
                  <div
                    key={s.id}
                    className={`bg-white border-[3px] border-[#202808] rounded-xl overflow-hidden`}
                  >
                    <button
                      onClick={() => openSlot(s.id)}
                      className="block w-full"
                      aria-label={`Open ${s.name}`}
                    >
                      <SlotThumb />
                    </button>
                    <div className="p-3">
                      <div className="flex items-center gap-2">
                        {editingId === s.id ? (
                          <input
                            autoFocus
                            defaultValue={s.name}
                            aria-label="Slot name"
                            className={`flex-1 min-w-0 border-[3px] border-[#202808] rounded-lg px-2 py-1`}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              updateSlot(s.id, (x) => ({ ...x, name: v || x.name }));
                              setEditingId(null);
                            }}
                            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          />
                        ) : (
                          <>
                            <span className="flex-1 font-display text-lg font-bold truncate">
                              {s.name}
                            </span>
                            <button
                              onClick={() => setEditingId(s.id)}
                              aria-label={`Rename ${s.name}`}
                              className={`w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#DEC59E]`}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => setToDelete(s)}
                              aria-label={`Delete ${s.name}`}
                              title="Delete slot"
                              className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#DEC59E] text-[#8A3A28]"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                      <p className="text-sm">
                        {fmt(s.widthM)} × {fmt(s.lengthM)} m, {s.soil} soil
                      </p>
                      <p className="text-sm font-bold">
                        {s.plants.length
                          ? `${emojis} ${s.plants.length} planted`
                          : "Nothing planted yet"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {slot && grid && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl font-bold">{slot.name}</h2>
                  <p>
                    {fmt(slot.widthM)} × {fmt(slot.lengthM)} m = {fmt(slot.widthM * slot.lengthM)}{" "}
                    m² · {slot.soil} soil · {slot.place || slot.location}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setFlow({ step: "detail", id: slot.id })}
                    className={`fm-btn fm-btn--light flex items-center gap-2`}
                  >
                    <Sparkles size={16} /> Suggestions
                  </button>
                  <button
                    onClick={() => setShowEdit(true)}
                    className={`fm-btn fm-btn--light flex items-center gap-2`}
                  >
                    <Pencil size={16} /> Edit slot
                  </button>
                  <button
                    onClick={() => setToDelete(slot)}
                    className={`fm-btn fm-btn--danger-light flex items-center gap-2`}
                  >
                    <Trash2 size={16} /> Delete slot
                  </button>
                </div>
              </div>

              <ConditionsBar wx={wx} season={season} onSetLocation={() => setShowEdit(true)} />

              <div
                className={`bg-[#DEC59E] border-[3px] border-[#202808] rounded-xl p-3 flex flex-col gap-3`}
              >
                <div>
                  <p className="font-bold mb-2">Vegetables</p>
                  <div className="flex flex-wrap gap-2">
                    {CROPS.filter((c) => c.type === "vegetable").map(cropButton)}
                  </div>
                </div>
                <div>
                  <p className="font-bold mb-2">Fruits</p>
                  <div className="flex flex-wrap gap-2">
                    {CROPS.filter((c) => c.type === "fruit").map(cropButton)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor="planted-on" className="font-bold">
                    Planting date
                  </label>
                  <DatePicker
                    id="planted-on"
                    value={plantedOn}
                    onChange={(v) => setPlantedOn(v || todayIso())}
                  />
                </div>
                <p className="text-sm font-bold" aria-live="polite">
                  {brushCrop
                    ? `${brushCrop.emoji} ${brushCrop.name} selected. Click an empty square to plant it.`
                    : "Pick a crop above, then click empty squares to plant. You can mix as many crops as you like."}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Stat
                  label="Squares"
                  value={`${grid.rows} × ${grid.cols}`}
                  hint={`Each is ${grid.size} × ${grid.size} m`}
                />
                <Stat
                  label="Planted"
                  value={`${slot.plants.length} / ${grid.capacity}`}
                  hint={`${grid.capacity - slot.plants.length} free squares`}
                />
                <Stat
                  label="Crops"
                  value={
                    Object.keys(counts).length
                      ? Object.entries(counts)
                          .map(([k, n]) => `${cropByKey(k).emoji}${n}`)
                          .join(" ")
                      : "—"
                  }
                />
              </div>

              <div className="flex flex-wrap gap-4 items-start">
                <div style={{ flex: "3 1 320px", minWidth: 0 }}>
                  <PlotGrid
                    grid={grid}
                    plantMap={plantMap}
                    asOf={asOf}
                    selected={selected}
                    onSelect={setSelected}
                    onActivate={activateCell}
                  />
                </div>
                <div className={`fm-panel p-4`} style={{ flex: "1 1 220px" }} aria-live="polite">
                  {!selected && <p>Click a square to plant or see details.</p>}
                  {selected && !selPlant && (
                    <>
                      <p className="text-sm">
                        Row {selected.row + 1}, column {selected.col + 1}
                      </p>
                      <h3 className="font-display text-xl font-bold">Empty square</h3>
                      <p>
                        {brushCrop
                          ? "Click it again to plant."
                          : "Pick a crop above to plant here."}
                      </p>
                    </>
                  )}
                  {selPlant && (
                    <>
                      <p className="text-sm">
                        Row {selected.row + 1}, column {selected.col + 1}
                      </p>
                      <h3 className="font-display text-xl font-bold mb-2">
                        {selCrop.emoji} {selCrop.name}{" "}
                        <span className="text-sm font-normal">({selCrop.en})</span>
                      </h3>
                      <p>Stage: {STAGES[getStage(selPlant, selCrop, asOf)].label}</p>
                      <p>Planted: {selPlant.plantedOn}</p>
                      <p className="mb-3">
                        Harvest around: {addDays(selPlant.plantedOn, selCrop.maturity)}
                      </p>
                      <button
                        onClick={() => setConfirm({ type: "plant", id: selPlant.id })}
                        className={`fm-btn fm-btn--danger-light w-full`}
                      >
                        Remove plant
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setPlaying((p) => (preview >= MAX_PREVIEW ? false : !p))}
                  aria-label={playing ? "Pause growth preview" : "Play growth preview"}
                  className={`fm-btn fm-btn--light w-11 !px-0 flex items-center justify-center`}
                >
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <label htmlFor="preview" className="font-bold">
                  {preview === 0 ? "Today" : `Today + ${preview} days`}
                </label>
                <input
                  id="preview"
                  type="range"
                  min={0}
                  max={MAX_PREVIEW}
                  value={preview}
                  onChange={(e) => setPreview(Number(e.target.value))}
                  className="flex-1"
                  style={{ minWidth: 160 }}
                />
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                <span className="inline-flex items-center gap-2">
                  <span className={`w-4 h-4 rounded border-2 border-[#8E5A45] bg-[#C4866D]`} />
                  Empty square
                </span>
                {Object.entries(STAGES).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-2">
                    <span
                      className={`w-4 h-4 rounded border-2 border-[#202808]`}
                      style={{ background: v.color }}
                    />
                    {v.label}
                  </span>
                ))}
              </div>
              <p className="text-sm">
                One square holds one plant, whatever the crop. Large plants like banana and mango
                need more room than one square, so leave gaps around them.
              </p>
            </>
          )}
        </section>
      </div>

      <ChatHead context={chatContext} />

      {showAdd && (
        <AddSlotModal
          defaultName={uniqueName(`Field ${slots.length + 1}`)}
          onSubmit={createSlot}
          onClose={() => setShowAdd(false)}
        />
      )}
      {toDelete && (
        <ConfirmModal
          title="Delete this slot?"
          message={`"${toDelete.name}" and everything planted in it will be removed. This can't be undone.`}
          confirmLabel="Delete slot"
          danger
          onConfirm={doDelete}
          onClose={() => setToDelete(null)}
        />
      )}
      {showEdit && slot && (
        <AddSlotModal
          slot={slot}
          onSubmit={requestEdit}
          onClose={() => !pendingEdit && setShowEdit(false)}
        />
      )}
      {pendingEdit && (
        <Modal title="Save these changes?" onClose={() => setPendingEdit(null)}>
          <ul className="list-disc pl-5 mb-4 flex flex-col gap-1">
            {pendingEdit.changes.map((c) => (
              <li key={c} className={c.includes("will be removed") ? "fm-error" : ""}>
                {c}
              </li>
            ))}
          </ul>
          <div className="fm-modal__actions">
            <button
              type="button"
              className="fm-btn fm-btn--light"
              onClick={() => setPendingEdit(null)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className={`fm-btn ${pendingEdit.warn ? "fm-btn--danger" : "fm-btn--primary"}`}
              onClick={applyEdit}
              autoFocus
            >
              Save changes
            </button>
          </div>
        </Modal>
      )}
      {confirmInfo && (
        <ConfirmModal
          title={confirmInfo.title}
          message={confirmInfo.message}
          confirmLabel={confirmInfo.label}
          danger
          onConfirm={runConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
      {flow?.step === "success" && flowSlot && (
        <SuccessModal
          slot={flowSlot}
          onProceed={() => setFlow({ step: "detail", id: flow.id })}
          onClose={closeFlow}
        />
      )}
      {flow?.step === "detail" && flowSlot && (
        <SlotDetailModal slot={flowSlot} wx={wx} onPick={pickRecommended} onClose={closeFlow} />
      )}
    </div>
  );
}