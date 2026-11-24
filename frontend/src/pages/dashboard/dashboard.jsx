import { useState, useEffect, useMemo, useRef, useId } from "react";
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
  Leaf,
  ChevronDown,
  Info,
  Check,
  CheckCheck,
} from "lucide-react";
import "./dashboard.css";
import {
  getUser,
  getSlots,
  createSlotAPI,
  deleteSlotAPI,
  updateSlotAPI,
  createPlantAPI,
  updatePlantAPI,
  movePlantsAPI,
  deletePlantAPI,
  createHarvestAPI,
  updateHarvestAPI,
  deleteHarvestAPI,
  logWatering,
  getNotificationStates,
  markNotificationRead,
  deleteNotificationAPI,
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
import { buildChatContext } from "../../utils/chatContext";
import { sfx } from "../../utils/sfx";
import {
  plantWateredToday,
  slotWateredToday,
  wateringCounts,
  plantNeedsWater,
  slotNeedsWater,
  daysUntilWatering,
  daysOverdue,
  plantOverdue,
  wateringInterval,
} from "../../utils/watering";

import dashboardNotif from "../../assets/dashboard-notif.png";
import dashboardEmpty from "../../assets/dashboard-empty-state.png";
import trowelImg from "../../assets/trowel.png";
import sproutShocked from "../../assets/sprout/shocked.png";
import sproutHappy from "../../assets/sprout/happy.png";

const MAX_DIM_M = 200;
const MIN_DIM_M = 0.5;
const MAX_CELLS = 2500;
const MAX_NAME = 40; 
const NAME_BAD = /[^\p{L}\p{N} _.'’-]/gu;

function checkName(raw) {
  const clean = raw.replace(NAME_BAD, "");
  if (clean !== raw)
    return {
      value: clean.slice(0, MAX_NAME),
      hit: {
        title: "That character isn't allowed",
        lines: [
          "A field name can use letters, numbers, spaces and these marks: _ . ' -",
          "We removed the ones that don't fit.",
        ],
      },
    };
  if (raw.length > MAX_NAME)
    return {
      value: raw.slice(0, MAX_NAME),
      hit: {
        title: "Name is too long",
        lines: [`A field name can have up to ${MAX_NAME} characters, so we kept the first ${MAX_NAME}.`],
      },
    };
  return { value: raw, hit: null };
}

const withSuffix = (base, n) => {
  const tail = ` - ${n}`;
  return `${base.slice(0, MAX_NAME - tail.length).trimEnd()}${tail}`;
};
const CELL = 30; 
const TROWEL_SIZE = 44; 
const TROWEL_TIP = { x: 4, y: 4 }; 
const MAX_PREVIEW = 1460; 

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


const todayIso = () => new Date().toLocaleDateString("en-CA");
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};
const daysBetween = (a, b) =>
  Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5);
const fmt = (n) => String(Number(n.toFixed(2)));

const seasonNow = () =>
  new Date().getMonth() >= 5 && new Date().getMonth() <= 10
    ? { key: "wet", label: "Wet season", span: "Jun – Nov" }
    : { key: "dry", label: "Dry season", span: "Dec – May" };

function parseDim(text) {
  const t = text.trim().replace(",", ".");
  if (!t) return { error: "Enter a number." };
  if (!/^\d*\.?\d+$/.test(t)) return { error: "Use a positive number, like 20 or 12.5." };
  const value = Number(t);
  if (value < MIN_DIM_M) return { error: `Min is ${MIN_DIM_M} m.`, limit: true };
  if (value > MAX_DIM_M) return { error: `Max is ${MAX_DIM_M} m.`, limit: true };
  return { value };
}

function computeGrid(widthM, lengthM) {
  for (const size of [0.5, 1, 2, 5]) {
    const rows = Math.floor(widthM / size + 1e-9);
    const cols = Math.floor(lengthM / size + 1e-9);
    if (rows * cols <= MAX_CELLS) return { rows, cols, size, capacity: rows * cols };
  }
  return { rows: 1, cols: 1, size: 5, capacity: 1 };
}
function getStage(plant, crop, asOf) {
  const age = daysBetween(plant.plantedOn, asOf);
  if (age < 0) return "planned";
  const ratio = age / crop.maturity;
  if (ratio < 0.25) return "sprout";
  if (ratio < 0.6) return "growing";
  if (ratio < 1) return "flowering";
  return "ready";
}

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
const wateredToday = (slot, now) => slotWateredToday(slot, now);


function buildWaterNotifs(slots, now) {
  const phase = waterPhase(now);
  if (!phase) return [];
  const c = WATER_COPY[phase];
  return slots
    .filter((s) => s.plants.length > 0 && slotNeedsWater(s, now))
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

function useWeather(lat, lon) {
  const [state, setState] = useState({ data: null, loading: false });
  useEffect(() => {
    if (lat == null || lon == null) return setState({ data: null, loading: false });
    let live = true;
    setState({ data: null, loading: true });
    fetchWeather(lat, lon)
      .then((data) => live && setState({ data, loading: false }))
      .catch((e) => {
        console.warn("[farme] weather failed:", e.message); 
        if (live) setState({ data: null, loading: false });
      });
    return () => {
      live = false;
    };
  }, [lat, lon]);
  return state;
}

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

function useCountUp(target, ms = 800) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target == null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setVal(target);
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      setVal(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return val;
}

function ConditionsBar({ wx, season, onSetLocation }) {
  const [open, setOpen] = useState(false);
  const desktop = useMediaQuery("(min-width: 768px)");
  const bodyId = useId();
  const w = wx.data;
  const shownTemp = useCountUp(w ? w.temp : null);
  return (
    <div className="fm-conditions" role="group" aria-label="Weather and season">
      {desktop ? (
        <div className="fm-conditions__head">
          <Leaf size={22} className="fm-conditions__leaf" aria-hidden="true" />
          <span className="fm-conditions__title">Farm Conditions</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="fm-conditions__head"
        >
          <Leaf size={22} className="fm-conditions__leaf" aria-hidden="true" />
          <span className="fm-conditions__title">Farm Conditions</span>
          {!open && (
            <span className="fm-conditions__summary">
              {wx.loading && <span className="fm-conditions__pulse" aria-hidden="true" />}
              {w ? `${w.emoji} ${w.temp}°C · ` : ""}
              {season.label}
            </span>
          )}
          <span className="fm-conditions__toggle" aria-hidden="true">
            <ChevronDown size={20} className="fm-conditions__chev" />
          </span>
        </button>
      )}
      <div id={bodyId} className="fm-collapse" data-open={desktop || open}>
        <div className="fm-collapse__inner">
          <div className="fm-conditions__body">
            <div
              key={w ? "ready" : wx.loading ? "loading" : "none"}
              className="fm-conditions__weather"
              aria-busy={wx.loading}
            >
              {wx.loading && !w ? (
                <>
                  <span className="fm-skel fm-skel--icon" aria-hidden="true" />
                  <div className="min-w-0 flex flex-col gap-2">
                    <span className="fm-skel fm-skel--temp" aria-hidden="true" />
                    <span className="fm-skel fm-skel--line" aria-hidden="true" />
                    <span className="sr-only">Loading weather</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="fm-conditions__icon" aria-hidden="true">
                    <span className="fm-conditions__emoji">{w ? w.emoji : "🌡️"}</span>
                  </span>
                  <div className="min-w-0">
                    <p className="fm-conditions__temp">{w ? `${shownTemp}°C` : "--"}</p>
                    {w ? (
                      <>
                        <p className="fm-conditions__label">{w.label}</p>
                        <p className="fm-conditions__meta fm-conditions__humidity">
                          <Droplets size={14} aria-hidden="true" />
                          <span className="fm-conditions__hval">{w.humidity}%</span>
                          <span className="fm-conditions__hlabel">humidity</span>
                        </p>
                      </>
                    ) : onSetLocation ? (
                      <button
                        type="button"
                        onClick={onSetLocation}
                        className="min-h-[44px] text-left underline font-bold text-sm"
                      >
                        Weather unavailable. Set location
                      </button>
                    ) : (
                      <p className="fm-conditions__label">Weather unavailable</p>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className={`fm-conditions__season fm-conditions__season--${season.key}`}>
              <span className="fm-conditions__fx" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span key={i} style={{ "--i": i }} />
                ))}
              </span>
              <p className="fm-conditions__meta">
                <Leaf size={16} className="fm-conditions__leaf" aria-hidden="true" /> Current season
              </p>
              <p className="fm-conditions__temp">{season.label}</p>
              <p className="fm-conditions__label">{season.span}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CropDropdown({ id, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef(null);
  const listId = useId();
  const groups = [
    ["Vegetables", CROPS.filter((c) => c.type === "vegetable")],
    ["Fruits", CROPS.filter((c) => c.type === "fruit")],
  ];
  const flat = [null, ...groups.flatMap(([, items]) => items)];
  const selected = cropByKey(value);
  const optId = (i) => `${listId}-${i}`;

  useEffect(() => {
    if (!open) return;
    const away = (e) => {
      if (root.current && !root.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optId(active))?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const openList = () => {
    setActive(Math.max(0, flat.findIndex((c) => (c ? c.key : null) === (value || null))));
    setOpen(true);
  };
  const choose = (i) => {
    onChange(flat[i] ? flat[i].key : null);
    setOpen(false);
  };
  const onKeyDown = (e) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      return setOpen(false);
    }
    if (e.key === "Tab") return setOpen(false);
    const move = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (move) {
      e.preventDefault();
      if (!open) return openList();
      return setActive((i) => Math.min(flat.length - 1, Math.max(0, i + move)));
    }
    if (open && e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (open && e.key === "End") {
      e.preventDefault();
      setActive(flat.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) choose(active);
      else openList();
    }
  };

  return (
    <div className="fm-dropdown" ref={root}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optId(active) : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className="fm-dropdown__button"
      >
        {selected ? (
          <>
            <span className="text-xl" aria-hidden="true">
              {selected.emoji}
            </span>
            <span className="flex-1 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 truncate fm-dropdown__placeholder">Select a crop</span>
        )}
        <ChevronDown size={20} className="fm-dropdown__chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-label="Crops" className="fm-dropdown__list">
          <li
            id={optId(0)}
            role="option"
            aria-selected={!value}
            onClick={() => choose(0)}
            onMouseMove={() => setActive(0)}
            className={`fm-dropdown__option ${active === 0 ? "fm-dropdown__option--active" : ""}`}
          >
            No crop selected
          </li>
          {groups.map(([label, items]) => (
            <li key={label} role="presentation" className="contents">
              <p className="fm-dropdown__group" aria-hidden="true">
                {label}
              </p>
              <ul role="group" aria-label={label}>
                {items.map((c) => {
                  const i = flat.indexOf(c);
                  return (
                    <li
                      key={c.key}
                      id={optId(i)}
                      role="option"
                      aria-selected={value === c.key}
                      onClick={() => choose(i)}
                      onMouseMove={() => setActive(i)}
                      className={`fm-dropdown__option ${active === i ? "fm-dropdown__option--active" : ""}`}
                    >
                      <span className="text-xl" aria-hidden="true">
                        {c.emoji}
                      </span>
                      {c.name}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InfoBox({ slot }) {
  const items = [
    ["Plot size", `${fmt(slot.widthM)} × ${fmt(slot.lengthM)} m = ${fmt(slot.widthM * slot.lengthM)} m²`],
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

function SlotTitle({ slot }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e) => {
      if (root.current && !root.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="relative min-w-0" ref={root}>
      <div className="flex items-start gap-1">
        <h2 className="font-display text-2xl font-bold truncate">{slot.name}</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label="Field details"
          className="relative shrink-0 p-0.5 text-[#33432B] before:absolute before:-inset-2 before:content-['']"
        >
          <Info size={15} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div
          id={panelId}
          className="fm-card absolute left-0 top-full mt-2 z-20 w-[min(22rem,calc(100vw-3rem))] p-3"
        >
          <InfoBox slot={slot} />
        </div>
      )}
    </div>
  );
}


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
        leafletPromise = null; 
        reject(new Error("map failed to load"));
      };
      document.head.appendChild(js);
    });
  }
  return leafletPromise;
}

const PH_CENTER = [12.9, 122.8]; 
function PinMap({ value, onPick }) {
  const box = useRef(null);
  const mapRef = useRef({}); 
  const valueRef = useRef(value); 
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
        setTimeout(() => map.invalidateSize(), 80); 
      })
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
      mapRef.current.map?.remove();
      mapRef.current = {};
    };
  }, []);

  
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


function LocationPicker({ value, onChange, error }) {
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle"); 
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");
  const asked = useRef(0); 
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


  const setSpot = async (lat, lon) => {
    const id = ++asked.current;
    const coords = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    setNote("");
    onChange({ text: coords, lat, lon, place: coords });
    let label = null;
    try {
      label = await reverseGeocode(lat, lon);
    } catch {
      
    }
    if (label && id === asked.current) onChange({ text: label, lat, lon, place: label });
  };

  
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


function LimitModal({ title, lines, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Img src={sproutShocked} alt="" w={72} h={72} label="sprout" />
          <div role="alert" className="flex flex-col gap-1 min-w-0">
            {lines.map((t) => (
              <p key={t} className="break-words">
                {t}
              </p>
            ))}
          </div>
        </div>
        <button type="button" onClick={onClose} className="fm-btn fm-btn--primary" autoFocus>
          Got it
        </button>
      </div>
    </Modal>
  );
}

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
  ); 
  const [geoErr, setGeoErr] = useState("");
  const setLoc = (v) => {
    setGeoErr("");
    setLocRaw(v);
  };
  const [soil, setSoil] = useState(slot ? slot.soil : "");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(null); 
  const pw = parseDim(w);
  const pl = parseDim(l);
  const area = pw.value && pl.value ? pw.value * pl.value : null;
  const locError = !loc.text.trim() ? "Pick or search for your town or city." : "";
  const soilError = !soil ? "Pick a soil type." : "";

  
  const closeLimit = () => {
    const id = limit?.focusId;
    setLimit(null);
    if (id) setTimeout(() => document.getElementById(id)?.focus(), 0);
  };
  
  const changeName = (e) => {
    const { value, hit } = checkName(e.target.value);
    setName(value);
    if (hit) setLimit({ focusId: "slot-name", ...hit });
  };
  
  const changeDim = (label, id, setValue) => (e) => {
    const text = e.target.value;
    const t = text.trim().replace(",", ".");
    if (/^\d*\.?\d+$/.test(t) && Number(t) > MAX_DIM_M) {
      setValue(String(MAX_DIM_M));
      setLimit({
        focusId: id,
        title: `${label} is too big`,
        lines: [`The biggest allowed is ${MAX_DIM_M} m, so we set it to ${MAX_DIM_M} m.`],
      });
      return;
    }
    setValue(text);
  };

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
   
    const hit = [
      ["Width", pw, "slot-w"],
      ["Length", pl, "slot-l"],
    ].filter(([, p]) => p.limit);
    if (hit.length) {
      setLimit({
        focusId: hit[0][2],
        title: "Size is out of range",
        lines: hit.map(([label]) => `${label} must be between ${MIN_DIM_M} m and ${MAX_DIM_M} m.`),
      });
      return;
    }
    if (pw.error || pl.error || locError || soilError) return;
    setBusy(true);
  
    let geo = loc.lat != null ? loc : null;
    if (!geo) {
      try {
        geo = await geocode(loc.text.trim());
      } catch {
       
      }
    }
    
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
    setBusy(false); 
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
        onChange={changeDim(label.split(" ")[0], id, setValue)}
        placeholder="e.g. 20"
        aria-invalid={(tried || value) && parsed.error ? "true" : "false"}
        aria-describedby={`${id}-err`}
        className="fm-input"
      />
      {err(id, (tried || value) && parsed.error, parsed.error)}
    </div>
  );

  return (
    <>
      <Modal title={editing ? "Edit slot" : "Add a slot"} onClose={() => !limit && onClose()}>
        <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
          <div>
            <label htmlFor="slot-name" className="block font-bold mb-1">
              Field name
            </label>
            <input
              id="slot-name"
              value={name}
              onChange={changeName}
              aria-describedby="slot-name-count"
              className="fm-input"
            />
            <p id="slot-name-count" className="text-xs text-right mt-1">
              {name.length}/{MAX_NAME}
            </p>
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
      {limit && <LimitModal title={limit.title} lines={limit.lines} onClose={closeLimit} />}
    </>
  );
}


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
    };
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


function ReminderBell({ notifs, loading, onRead, onReadAll, onDelete, onDeleteAll, onOpen }) {
  
  const wantsMail = () => window.location.hash === "#notifications";
  const [open, setOpen] = useState(wantsMail);
  useEffect(() => {
    const check = () => {
      if (!wantsMail()) return;
      setOpen(true);
      
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);
  const unread = loading ? 0 : notifs.filter((n) => !n.read).length;
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
            {!loading && notifs.length > 0 && (
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
          {loading && (
            <div className="flex flex-col gap-2" aria-busy="true">
              <span className="sr-only">Loading your notifications</span>
              {[0, 1, 2].map((i) => (
                <div key={i} aria-hidden="true" className="fm-panel p-2 flex flex-col gap-2">
                  <span className="fm-bone fm-bone--title" />
                  <span className="fm-bone fm-bone--line" />
                </div>
              ))}
            </div>
          )}
          {!loading && notifs.length === 0 && (
            <p className="text-sm">
              You're all caught up. Watering and harvest reminders show up here once you plant
              something.
            </p>
          )}
          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {!loading && notifs.map((n) => (
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


function PlotGrid({
  grid,
  plantMap,
  asOf,
  now,
  selected,
  onSelect,
  onActivate,
  onBox,
  tool,
  carry,
  picked,
}) {
  const { rows, cols } = grid;
  const svgRef = useRef(null);
  const startRef = useRef(null);
  const [box, setBox] = useState(null);
  const canDrag = tool === "trowel" && carry.length === 0;
  const cellAt = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * cols * CELL;
    const y = ((e.clientY - r.top) / r.height) * rows * CELL;
    return {
      row: Math.min(rows - 1, Math.max(0, Math.floor(y / CELL))),
      col: Math.min(cols - 1, Math.max(0, Math.floor(x / CELL))),
    };
  };
  const dragging = box !== null;
  useEffect(() => {
    if (!dragging) return;
    const move = (e) => setBox({ start: startRef.current, end: cellAt(e) });
    const up = (e) => {
      const end = cellAt(e);
      const start = startRef.current;
      setBox(null);
      if (start.row !== end.row || start.col !== end.col)
        onBox(start, end, e.shiftKey || e.ctrlKey || e.metaKey);
    };
    const cancel = () => setBox(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    
  }, [dragging]);
  
  const [ptr, setPtr] = useState(null);
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
      const lifted = !!(plant && carry.some((c) => c.id === plant.id)); 
      const isPicked = !!(plant && picked.includes(plant.id)); 
      cells.push(
        <g
          key={`${row}-${col}`}
          onClick={() => onActivate({ row, col })}
          onPointerDown={(e) => {
            if (!canDrag || e.button !== 0) return;
            startRef.current = { row, col };
            setBox({ start: { row, col }, end: { row, col } });
          }}
          className={tool ? undefined : "cursor-pointer"}
          opacity={lifted ? 0.35 : 1}
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
            strokeDasharray={lifted ? "4 3" : undefined}
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
          {plant && plantNeedsWater(plant, now) && (
            <g pointerEvents="none">
              <title>{plantOverdue(plant, now) ? `Overdue by ${daysOverdue(plant, now)} day${daysOverdue(plant, now) === 1 ? "" : "s"}` : "Water today"}</title>
              <circle
                cx={col * CELL + 10}
                cy={row * CELL + CELL - 10}
                r={8}
                fill={plantOverdue(plant, now) ? "#C0392B" : "#4A90C2"}
                stroke={PINE}
                strokeWidth={1.5}
              />
              <path
                d={`M${col * CELL + 10} ${row * CELL + CELL - 15} q3.6 4 3.6 6 a3.6 3.6 0 0 1 -7.2 0 q0 -2 3.6 -6 z`}
                fill="#FBF6EA"
              />
            </g>
          )}
          {isPicked && (
            <>
              <rect
                x={col * CELL + 1}
                y={row * CELL + 1}
                width={CELL - 2}
                height={CELL - 2}
                rx={5}
                fill="none"
                stroke={COPPER}
                strokeWidth={4}
                pointerEvents="none"
              />
              <circle
                cx={col * CELL + CELL - 7}
                cy={row * CELL + 7}
                r={7}
                fill={COPPER}
                stroke={PINE}
                strokeWidth={2}
                pointerEvents="none"
              />
              <path
                d={`M${col * CELL + CELL - 10} ${row * CELL + 7} l2.5 2.5 l4.5 -5`}
                fill="none"
                stroke={PINE}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              />
            </>
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
      onPointerMove={(e) =>
        setPtr(tool && e.pointerType !== "touch" ? { x: e.clientX, y: e.clientY } : null)
      }
      onPointerLeave={() => setPtr(null)}
    >
      <svg
        ref={svgRef}
        width={cols * CELL}
        height={rows * CELL}
        viewBox={`0 0 ${cols * CELL} ${rows * CELL}`}
        style={{
          display: "block",
          margin: "0 auto",
          maxWidth: "none",
          cursor: tool ? "none" : undefined,
          touchAction: canDrag ? "none" : undefined,
          userSelect: "none",
        }}
        onDragStart={(e) => e.preventDefault()}
        tabIndex={0}
        role="group"
        aria-label={`Planting grid, ${rows} rows by ${cols} columns. Arrow keys move, Enter plants or selects.`}
        onKeyDown={onKeyDown}
      >
        {cells}
        {box && box.start && (
          <rect
            x={Math.min(box.start.col, box.end.col) * CELL}
            y={Math.min(box.start.row, box.end.row) * CELL}
            width={(Math.abs(box.end.col - box.start.col) + 1) * CELL}
            height={(Math.abs(box.end.row - box.start.row) + 1) * CELL}
            fill="rgba(196,134,109,0.28)"
            stroke={PINE}
            strokeWidth={2}
            strokeDasharray="5 3"
            pointerEvents="none"
          />
        )}
      </svg>
      {}
      {tool && ptr && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: ptr.x - TROWEL_TIP.x,
            top: ptr.y - TROWEL_SIZE + TROWEL_TIP.y,
            zIndex: 25,
            pointerEvents: "none",
          }}
        >
          <img
            src={trowelImg}
            alt=""
            draggable={false}
            style={{ display: "block", width: TROWEL_SIZE, height: "auto" }}
          />
          {carry.length > 0 && (
            <span style={{ position: "absolute", left: TROWEL_SIZE - 8, top: -10, fontSize: 22 }}>
              {cropByKey(carry[0].cropKey).emoji}
              {carry.length > 1 && (
                <span style={{ fontSize: 13, fontWeight: 800 }}>×{carry.length}</span>
              )}
            </span>
          )}
        </div>
      )}
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


function HarvestModal({ plants, onSubmit, onClose }) {
  const [amount, setAmount] = useState("");
  const [action, setAction] = useState("keep");
  const many = plants.length > 1;
  const summary = Object.values(
    plants.reduce((acc, p) => {
      const crop = cropByKey(p.cropKey);
      acc[p.cropKey] = acc[p.cropKey] || { crop, n: 0 };
      acc[p.cropKey].n++;
      return acc;
    }, {}),
  )
    .map((g) => `${g.crop.emoji} ${g.crop.name} ×${g.n}`)
    .join(", ");
  const options = [
    [
      "keep",
      "Harvest and keep",
      `Logs the harvest. ${many ? "The plants stay" : "The plant stays"} and start${many ? "" : "s"} growing again from a sprout.`,
    ],
    [
      "remove",
      "Harvest and remove",
      `Logs the harvest and frees ${many ? "the squares" : "the square"} for something new.`,
    ],
  ];
  return (
    <Modal
      title={many ? `${plants.length} plants are ready` : "This plant is ready"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ action, amount: amount.trim() });
        }}
        className="flex flex-col gap-3"
      >
        <p className="font-bold">
          {many
            ? summary
            : `${summary.replace(" ×1", "")} at row ${plants[0].row + 1}, column ${plants[0].col + 1}`}
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-bold mb-1">What do you want to do?</legend>
          {options.map(([value, title, text]) => (
            <label
              key={value}
              className={`fm-panel p-3 flex items-start gap-3 cursor-pointer ${action === value ? "!bg-[#DEC59E]" : ""}`}
            >
              <input
                type="radio"
                name="plant-action"
                checked={action === value}
                onChange={() => setAction(value)}
                className="mt-1 w-5 h-5 accent-[#33432B]"
              />
              <span>
                <span className="block font-bold">{title}</span>
                <span className="text-sm">{text}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div>
          <label htmlFor="harvest-amount" className="block font-bold mb-1">
            {many ? "How much from each plant? (optional)" : "How much did you pick? (optional)"}
          </label>
          <input
            id="harvest-amount"
            value={amount}
            maxLength={30}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 3 kg or 12 pieces"
            className="fm-input"
          />
        </div>
        <button type="submit" className="fm-btn fm-btn--primary">
          Log harvest
        </button>
      </form>
    </Modal>
  );
}


export default function FarMeDashboard() {
  const [slots, setSlots] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 150);
    return () => clearTimeout(t);
  }, []);
  const ready = loaded;
  const [openId, setOpenId] = useState(null);
  const [editingId, setEditingId] = useState(null); 
  const [renameText, setRenameText] = useState(""); 
  const [renameAsk, setRenameAsk] = useState(null); 
  const [renameLimit, setRenameLimit] = useState(null); 
  const [renameBusy, setRenameBusy] = useState(false);
  const askingRef = useRef(false); 
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false); 
  const [pendingEdit, setPendingEdit] = useState(null); 
  const [updated, setUpdated] = useState(null); 
  const [confirm, setConfirm] = useState(null); 
  const [toDelete, setToDelete] = useState(null); 
  const [harvesting, setHarvesting] = useState(null); 
  const [brush, setBrush] = useState(null); 
  const [selected, setSelected] = useState(null);
  const [tool, setTool] = useState(null); 
  const [picked, setPicked] = useState([]); 
  const [carry, setCarry] = useState([]); 
  const [toolMsg, setToolMsg] = useState(""); 
  const [blocked, setBlocked] = useState(null); 
  const [plantedOn, setPlantedOn] = useState(todayIso());
  const [preview, setPreview] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState(null); 
  const plantingCellsRef = useRef(new Set()); 
  const wateringRef = useRef(false);


  const showError = (error, fallback, title = "Something went wrong") => {
    sfx.error();
    const msg = error?.message || fallback;
    if (/already occupied/i.test(msg)) {
      getSlots().then(setSlots).catch(() => {});
      return setNotice({
        title: "That square is taken",
        lines: ["Something is already planted there.", "Pick another square, or use the trowel to move it."],
      });
    }
    setNotice({ title, lines: [msg] });
  };

  useEffect(() => {
    async function loadDashboard() {
      try {
        const data = await getSlots();
        setSlots(data);
      } catch (error) {
        console.error("Failed to load slots:", error);
        showError(null, "Unable to load your slots. Please try again.", "Couldn’t load your slots");
      } finally {
        setLoaded(true);
      }
    }

    loadDashboard();
  }, []);

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

  
  const [user, setUser] = useState({ username: "", firstName: "", lastName: "" }); 
  const [flow, setFlow] = useState(null);
  useEffect(() => {
    getUser()
      .then(setUser)
      .catch((error) => console.error("Failed to load the signed-in user:", error));
  }, []);

  
  const slot = slots.find((s) => s.id === openId) || null;
  const flowSlot = flow ? slots.find((s) => s.id === flow.id) || null : null;
  const wxSlot = flowSlot || slot || null;
  const wx = useWeather(wxSlot?.lat, wxSlot?.lon);
  const season = seasonNow();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  
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
  const carryPlants = slot ? slot.plants.filter((p) => carry.includes(p.id)) : [];
  const pickedPlants = slot ? slot.plants.filter((p) => picked.includes(p.id)) : [];
  const readyPlants = slot
    ? slot.plants.filter((p) => getStage(p, cropByKey(p.cropKey), todayIso()) === "ready")
    : [];
  const pickedReady = pickedPlants.filter((p) => readyPlants.some((r) => r.id === p.id));
  const clearTrowel = () => {
    setCarry([]);
    setPicked([]);
  };

 
  useEffect(() => {
    if (!toolMsg) return;
    const t = setTimeout(() => setToolMsg(""), 4000);
    return () => clearTimeout(t);
  }, [toolMsg]);
  
  useEffect(() => {
    if (!tool) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (carry.length) setCarry([]);
      else if (picked.length) setPicked([]);
      else setTool(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, carry, picked]);

  const updateSlot = (id, fn) => setSlots((all) => all.map((s) => (s.id === id ? fn(s) : s)));
  const uniqueName = (base) => {
    let name = base;
    let n = 2;
    while (slots.some((s) => s.name.toLowerCase() === name.toLowerCase()))
      name = withSuffix(base, n++);
    return name;
  };


  const renameSlot = editingId ? slots.find((x) => x.id === editingId) : null;
  const renameChanged =
    !!renameSlot && renameText.trim() !== "" && renameText.trim() !== renameSlot.name;
  const focusRename = () =>
    setTimeout(() => document.getElementById(`rename-${editingId}`)?.focus(), 0);
  const startRename = (s) => {
    askingRef.current = false;
    setRenameAsk(null);
    setRenameText(s.name);
    setEditingId(s.id);
  };
  const endRename = () => {
    askingRef.current = false;
    setRenameAsk(null);
    setEditingId(null);
  };
  const askRename = (kind) => {
    askingRef.current = true;
    setRenameAsk(kind);
  };
  const keepEditing = () => {
    askingRef.current = false;
    setRenameAsk(null);
    focusRename();
  };
  const onRenameChange = (e) => {
    const { value, hit } = checkName(e.target.value);
    setRenameText(value);
    if (hit) {
      askingRef.current = true;
      setRenameLimit(hit);
    }
  };
  const closeRenameLimit = () => {
    askingRef.current = false;
    setRenameLimit(null);
    focusRename();
  };
  const saveRename = async () => {
    const s = renameSlot;
    if (!s || renameBusy) return;
    const base = renameText.trim();
    let name = base;
    let n = 2;
    while (slots.some((x) => x.id !== s.id && x.name.toLowerCase() === name.toLowerCase()))
      name = withSuffix(base, n++);
    setRenameBusy(true);
    try {
      await updateSlotAPI(s.id, {
        name,
        soil: s.soil,
        widthM: s.widthM,
        lengthM: s.lengthM,
        location: s.location,
        ...(s.lat != null ? { lat: s.lat } : {}),
        ...(s.lon != null ? { lon: s.lon } : {}),
        ...(s.place != null ? { place: s.place } : {}),
      });
      setSlots(await getSlots());
      endRename();
      setUpdated({ name });
    } catch (error) {
      console.error("Failed to rename slot:", error);
      showError(error, "Unable to rename slot. Please try again.", "Couldn’t rename the slot");
    } finally {
      setRenameBusy(false);
    }
  };

  
  const createSlot = async (data) => {
    try {
      const slotData = {
        ...data,
        name: uniqueName(data.name),
      };

      const savedSlot = await createSlotAPI(slotData);

      setSlots((all) => [...all, savedSlot]);
      setShowAdd(false);
      setFlow({ step: "success", id: savedSlot.id });
    } catch (error) {
      console.error("Failed to create slot:", error);
      showError(error, "Unable to create slot. Please try again.", "Couldn’t create the slot");
    }
  };


 
  const openSlot = (id) => {
    setOpenId(id);
    setSelected(null);
    setTool(null);
    clearTrowel();
    setPreview(0);
    setPlaying(false);
  };

  
  const pickRecommended = (key) => {
    setBrush(key);
    openSlot(flow.id);
    setFlow(null);
  };

  const closeFlow = () => {
    if (flow) openSlot(flow.id);
    setFlow(null);
  };

  const activateCell = async (cell) => {
    setSelected(cell);

    if (!slot) return;

    const here = plantMap.get(`${cell.row}-${cell.col}`);

    if (tool === "trowel") return trowelClick(cell, here);
    if (!brush) return;
    if (here) {
      return setNotice({
        title: "That square is taken",
        lines: ["Something is already planted there.", "Pick another square, or use the trowel to move it."],
      });
    }
    const cellKey = `${slot.id}-${cell.row}-${cell.col}`;
    if (plantingCellsRef.current.has(cellKey)) return;
    plantingCellsRef.current.add(cellKey);

    const targetSlotId = slot.id;
    const cropKey = brush;
    const plantingDate = plantedOn;

    const temporaryId = `pending-${targetSlotId}-${cell.row}-${cell.col}-${Date.now()}`;
    const temporaryPlant = {
      id: temporaryId,
      row: cell.row,
      col: cell.col,
      cropKey,
      plantedOn: plantingDate,
      pendingSave: true,
    };

    updateSlot(targetSlotId, (s) => ({
      ...s,
      plants: [...s.plants, temporaryPlant],
    }));
    sfx.plant();

    try {
      const newPlant = await createPlantAPI(targetSlotId, {
        row: cell.row,
        col: cell.col,
        cropKey,
        plantedOn: plantingDate,
      });

      updateSlot(targetSlotId, (s) => ({
        ...s,
        plants: s.plants.map((p) =>
          p.id === temporaryId ? newPlant : p
        ),
      }));
    } catch (error) {
      console.error(`Failed to plant crop at ${cell.row}, ${cell.col}:`, error);

      updateSlot(targetSlotId, (s) => ({
        ...s,
        plants: s.plants.filter((p) => p.id !== temporaryId),
      }));

      showError(error, "Unable to plant crop. Please try again.", "Couldn’t plant that");
    } finally {
      plantingCellsRef.current.delete(cellKey);
    }
  };


  const trowelClick = (cell, here) => {
    if (carryPlants.length) return placeGroup(cell);
    if (!here && pickedPlants.length) return placeGroup(cell, pickedPlants);
    if (!here) return;
    if (!picked.includes(here.id)) sfx.pickup();
    setPicked((ids) =>
      ids.includes(here.id) ? ids.filter((id) => id !== here.id) : [...ids, here.id],
    );
    setToolMsg("");
  };

  const placeGroup = async (cell, plants = carryPlants) => {
    const group = [...plants].sort(
      (a, b) => a.row - b.row || a.col - b.col
    );

    if (!group.length) return;

    const rank = (values) => new Map([...new Set(values)].sort((a, b) => a - b).map((v, i) => [v, i]));
    const rowRank = rank(group.map((p) => p.row));
    const colRank = rank(group.map((p) => p.col));
    const target = (p) => ({
      row: cell.row + rowRank.get(p.row) - rowRank.get(group[0].row),
      col: cell.col + colRank.get(p.col) - colRank.get(group[0].col),
    });

    
    if (group.every((p) => target(p).row === p.row && target(p).col === p.col)) {
      setCarry([]);
      return setToolMsg("Put back where they were.");
    }

    const ids = new Set(group.map((p) => p.id));

    let taken = 0;
    let outside = 0;
    group.forEach((p) => {
      const { row: r, col: c } = target(p);
      if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) {
        outside++;
        return;
      }
      const other = plantMap.get(`${r}-${c}`);
      if (other && !ids.has(other.id)) taken++;
    });

    if (taken || outside) {
      return setBlocked({ taken, outside });
    }

    if (group.some((p) => p.pendingSave)) {
      return setToolMsg("Still saving a plant. Try again in a second.");
    }

    const slotId = slot.id;
    const moves = group.map((p) => ({ id: p.id, ...target(p) }));
    const before = new Map(group.map((p) => [p.id, { row: p.row, col: p.col }]));
    const apply = (positions) =>
      updateSlot(slotId, (s) => ({
        ...s,
        plants: s.plants.map((p) => (positions.has(p.id) ? { ...p, ...positions.get(p.id) } : p)),
      }));

    apply(new Map(moves.map((m) => [m.id, { row: m.row, col: m.col }])));
    setCarry([]);
    setPicked([]);
    sfx.place();
    setToolMsg(
      group.length === 1
        ? `Moved ${cropByKey(group[0].cropKey).name}.`
        : `Moved ${group.length} plants together.`
    );

    try {
      await movePlantsAPI(slotId, moves.map(({ id, row, col }) => ({ id, row, col })));
    } catch (error) {
      console.error("Failed to move plants:", error);
      apply(before);
      setToolMsg("");
      showError(error, "Unable to move plants. Please try again.", "Couldn’t move the plants");
    }
  };

  const selectBox = (a, b, add) => {
    const r1 = Math.min(a.row, b.row);
    const r2 = Math.max(a.row, b.row);
    const c1 = Math.min(a.col, b.col);
    const c2 = Math.max(a.col, b.col);
    const inside = slot.plants
      .filter((p) => p.row >= r1 && p.row <= r2 && p.col >= c1 && p.col <= c2)
      .map((p) => p.id);
    setPicked((ids) => (add ? [...new Set([...ids, ...inside])] : inside));
    setToolMsg("");
  };
  const startMove = () => {
    setCarry(picked);
    setPicked([]);
    setToolMsg("");
  };
  const toggleTrowel = () => {
    setTool(tool ? null : "trowel");
    setBrush(null);
    clearTrowel();
    setToolMsg("");
  };

  const removePlants = async (ids) => {
    const slotId = slot.id;
    const removed = slot.plants.filter((p) => ids.includes(p.id));

    updateSlot(slotId, (s) => ({
      ...s,
      plants: s.plants.filter((p) => !ids.includes(p.id)),
    }));
    setCarry((c) => c.filter((id) => !ids.includes(id)));
    setPicked((c) => c.filter((id) => !ids.includes(id)));
    sfx.remove();

    const results = await Promise.allSettled(ids.map((id) => deletePlantAPI(id)));
    const failedIds = ids.filter((_, i) => results[i].status === "rejected");
    if (!failedIds.length) return;

    const failed = removed.filter((p) => failedIds.includes(p.id));
    updateSlot(slotId, (s) => ({ ...s, plants: [...s.plants, ...failed] }));
    const firstError = results.find((r) => r.status === "rejected")?.reason;
    console.error("Failed to remove plants:", firstError);
    showError(firstError, "Unable to remove plants. Please try again.", "Couldn’t remove the plants");
  };

  const harvestPlants = async ({ action, amount }) => {
    const group = slot.plants.filter((x) => harvesting.includes(x.id));

    if (!group.length) {
      setHarvesting(null);
      return;
    }

    const keep = action === "keep";
    const date = todayIso();
    const ids = new Set(group.map((p) => p.id));

    try {

      const newHarvests = await Promise.all(
        group.map((p) =>
          createHarvestAPI(slot.id, {
            cropKey: p.cropKey,
            row: p.row,
            col: p.col,
            plantedOn: p.plantedOn,
            date,
            amount: amount?.trim() || "Not specified",
            kept: keep,
          })
        )
      );

      if (keep) {
        await Promise.all(
          group.map((p) =>
            updatePlantAPI(p.id, {
              plantedOn: date,
              lastHarvested: date,
            })
          )
        );
      } else {
        await Promise.all(group.map((p) => deletePlantAPI(p.id)));
      }

      updateSlot(slot.id, (s) => ({
        ...s,
        harvests: [...newHarvests, ...(s.harvests || [])],
        plants: keep
          ? s.plants.map((x) =>
              ids.has(x.id)
                ? { ...x, plantedOn: date, lastHarvested: date }
                : x
            )
          : s.plants.filter((x) => !ids.has(x.id)),
      }));

      setPicked((c) => c.filter((id) => !ids.has(id)));
      setHarvesting(null);
      sfx.harvest();

      const what =
        group.length === 1
          ? cropByKey(group[0].cropKey).name
          : `${group.length} plants`;

      setToolMsg(
        keep
          ? `Harvested ${what}. ${
              group.length === 1 ? "It starts" : "They start"
            } growing again.`
          : `Harvested ${what}. The ${
              group.length === 1 ? "square is" : "squares are"
            } free.`
      );
    } catch (error) {
      console.error("Failed to harvest plants:", error);
      showError(error, "Unable to harvest plants. Please try again.", "Couldn’t harvest");
    }
  };

  const doDelete = async () => {
    if (!toDelete) return;

    try {
      await deleteSlotAPI(toDelete.id);

      setSlots((all) => all.filter((s) => s.id !== toDelete.id));

      if (openId === toDelete.id) {
        setOpenId(null);
      }

      setToDelete(null);
    } catch (error) {
      console.error("Failed to delete slot:", error);
      showError(error, "Unable to delete slot. Please try again.", "Couldn’t delete the slot");
    }
  };

  const counts = slot
    ? slot.plants.reduce((m, p) => ({ ...m, [p.cropKey]: (m[p.cropKey] || 0) + 1 }), {})
    : {};

 
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
 
  const [nstate, setNstate] = useState({ read: {}, deleted: {} });
  const [nLoaded, setNLoaded] = useState(false);
  useEffect(() => {
    getNotificationStates()
      .then(setNstate)
      .catch((error) => console.error("Failed to load notification marks:", error))
      .finally(() => setNLoaded(true));
  }, []);
  const allNotifs = useMemo(() => buildNotifications(slots, now), [slots, now]);
  
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
 
  const saveMarks = (requests) =>
    Promise.all(requests).catch((error) => {
      console.error("Failed to save the notification change:", error);
      getNotificationStates().then(setNstate).catch(() => {});
    });
  const markRead = (id) => {
    setNstate((st) => ({ ...st, read: { ...st.read, [id]: true } }));
    saveMarks([markNotificationRead(id)]);
  };
  const markAllRead = () => {
    const ids = notifs.filter((n) => !n.read).map((n) => n.id);
    if (!ids.length) return;
    setNstate((st) => ({
      ...st,
      read: { ...st.read, ...Object.fromEntries(ids.map((id) => [id, true])) },
    }));
    saveMarks(ids.map((id) => markNotificationRead(id)));
  };
  const deleteNotif = (id) => {
    setNstate((st) => ({ ...st, deleted: { ...st.deleted, [id]: true } }));
    saveMarks([deleteNotificationAPI(id)]);
  };
  const deleteAllNotifs = () => {
    const ids = notifs.map((n) => n.id);
    if (!ids.length) return;
    setNstate((st) => ({
      ...st,
      deleted: { ...st.deleted, ...Object.fromEntries(ids.map((id) => [id, true])) },
    }));
    saveMarks(ids.map((id) => deleteNotificationAPI(id)));
  };

  const saveWatering = async (plantIds) => {
    if (!slot?.id || wateringRef.current) return;
    wateringRef.current = true;

    const slotId = slot.id;
    const at = Date.now();
    const only = plantIds ? new Set(plantIds) : null;
    const before = new Map(slot.plants.map((p) => [p.id, p.lastWatered]));
    const beforeSlot = slot.lastWatered;

    updateSlot(slotId, (s) => ({
      ...s,
      lastWatered: at,
      plants: s.plants.map((p) => (!only || only.has(p.id) ? { ...p, lastWatered: at } : p)),
    }));
    sfx.water();

    try {
      await logWatering(slotId, at, plantIds);
    } catch (error) {
      console.error("Failed to record watering:", error);
      updateSlot(slotId, (s) => ({
        ...s,
        lastWatered: beforeSlot,
        plants: s.plants.map((p) => (before.has(p.id) ? { ...p, lastWatered: before.get(p.id) } : p)),
      }));
      showError(error, "Unable to record watering. Please try again.", "Couldn’t record watering");
    } finally {
      wateringRef.current = false;
    }
  };

  const waterSlot = () => saveWatering();

  const waterPlant = (plant) => {
    if (!plant?.id || plant.pendingSave) return;
    return saveWatering([plant.id]);
  };

  const requestEdit = (data) => {
    let name = data.name;
    let n = 2;
    while (slots.some((x) => x.id !== slot.id && x.name.toLowerCase() === name.toLowerCase()))
      name = withSuffix(data.name, n++);
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
    if (changes.length === 0) return setShowEdit(false); 
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
  
  const applyEdit = async () => {
    if (!pendingEdit || !slot) return;

    const { data } = pendingEdit;
    const g = computeGrid(data.widthM, data.lengthM);

    const removedPlants = slot.plants.filter(
      (p) => p.row >= g.rows || p.col >= g.cols
    );

    const updates = {
      name: data.name,
      soil: data.soil,
      widthM: data.widthM,
      lengthM: data.lengthM,
      location: data.location,
      ...(data.lat != null ? { lat: data.lat } : {}),
      ...(data.lon != null ? { lon: data.lon } : {}),
      ...(data.place != null ? { place: data.place } : {}),
    };

    try {
      await updateSlotAPI(slot.id, updates);

      await Promise.all(
        removedPlants.map((plant) => deletePlantAPI(plant.id))
      );

      const refreshedSlots = await getSlots();
      setSlots(refreshedSlots);

      setSelected(null);
      setPendingEdit(null);
      setShowEdit(false);

      setUpdated({ name: data.name });
    } catch (error) {
      console.error("Failed to update slot:", error);

      try {
        const refreshedSlots = await getSlots();
        setSlots(refreshedSlots);
      } catch (refreshError) {
        console.error("Failed to refresh slots:", refreshError);
      }

      showError(error, "Unable to update slot. Please try again.", "Couldn’t update the slot");
    }
  };

  
  const confirmPlants =
    confirm?.type === "plant" && slot ? slot.plants.filter((p) => confirm.ids.includes(p.id)) : [];
  const confirmInfo =
    confirm?.type === "plant" && confirmPlants.length
      ? {
          title:
            confirmPlants.length === 1
              ? "Remove this plant?"
              : `Remove ${confirmPlants.length} plants?`,
          message:
            confirmPlants.length === 1
              ? `${cropByKey(confirmPlants[0].cropKey)?.name} at row ${confirmPlants[0].row + 1}, column ${confirmPlants[0].col + 1} will be removed from this slot.`
              : `${confirmPlants.length} plants will be removed from this slot.`,
          label: confirmPlants.length === 1 ? "Remove plant" : "Remove plants",
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
    if (confirm.type === "plant") removePlants(confirm.ids);
    else if (confirm.type === "notif") deleteNotif(confirm.id);
    else deleteAllNotifs();
    setConfirm(null);
  };

  const chat = buildChatContext({
    page: "dashboard",
    season: season.key,
    slot,
    slots,
    weather: wx.data,
    now,
  });

  const emptyState = (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-10">
      {}
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
      onClick={() => {
        setBrush(brush === c.key ? null : c.key);
        setTool(null);
        clearTrowel();
      }}
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
            {user.username ? `Hello, ${user.username}` : "Hello"}
          </h1>
          <ReminderBell
            notifs={notifs}
            loading={!loaded || !nLoaded}
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
              <div className="contents sm:flex sm:items-center sm:gap-3 sm:flex-wrap sm:justify-end">
                <div
                  className="order-3 basis-full text-sm text-right -mt-2 sm:mt-0 sm:order-none sm:basis-auto"
                  aria-live="polite"
                >
                  {slot.plants.length > 0 && (
                    <p className="font-bold">
                      {(() => {
                        const c = wateringCounts(slot, now);
                        return c.needWater === 0
                          ? "No plants need water right now"
                          : `${c.needWater} of ${c.total} plant${c.total === 1 ? "" : "s"} need water`;
                      })()}
                    </p>
                  )}
                  <p className="font-bold">
                    {slot.lastWatered
                      ? `Last watered: ${wateredToday(slot, now) ? "today" : new Date(slot.lastWatered).toLocaleDateString([], { month: "short", day: "numeric" })}, ${new Date(slot.lastWatered).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                      : "Not watered yet"}
                  </p>
                  {slot.plants.length > 0 && slotNeedsWater(slot, now) && waterPhase(now) && (
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
                  className={`fm-btn fm-btn--primary flex items-center gap-2 order-2 sm:order-none`}
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

          {!slot && !ready && slow && (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}
              aria-busy="true"
            >
              <span className="sr-only">Loading your fields</span>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className="bg-white border-[3px] border-[#202808] rounded-xl overflow-hidden"
                >
                  <span className="fm-bone fm-bone--thumb" />
                  <div className="p-3 flex flex-col gap-2">
                    <span className="fm-bone fm-bone--title" />
                    <span className="fm-bone fm-bone--line" />
                    <span className="fm-bone fm-bone--line" style={{ width: "55%" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!slot && ready && slots.length === 0 && emptyState}
          {!slot && ready && slots.length > 0 && (
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
                            id={`rename-${s.id}`}
                            autoFocus
                            value={renameText}
                            onChange={onRenameChange}
                            aria-label="Slot name"
                            className={`flex-1 min-w-0 border-[3px] border-[#202808] rounded-lg px-2 py-1`}
                            onBlur={() => {
                              if (askingRef.current) return; 
                              if (!renameChanged) return endRename();
                              askRename("leave");
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (!renameChanged) return endRename();
                                askRename("save");
                              } else if (e.key === "Escape") {
                                if (!renameChanged) return endRename();
                                askRename("leave");
                              }
                            }}
                          />
                        ) : (
                          <>
                            <span className="flex-1 font-display text-lg font-bold truncate">
                              {s.name}
                            </span>
                            <button
                              onClick={() => startRename(s)}
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
                <SlotTitle slot={slot} />
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
                {isDesktop ? (
                  <>
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
                  </>
                ) : (
                  <div>
                    <label htmlFor="crop-pick" className="block font-bold mb-2">
                      Crop to plant
                    </label>
                    <CropDropdown
                      id="crop-pick"
                      value={brush}
                      onChange={(key) => {
                        setBrush(key);
                        setTool(null);
                        clearTrowel();
                      }}
                    />
                  </div>
                )}
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
                    now={now}
                    selected={selected}
                    onSelect={setSelected}
                    onActivate={activateCell}
                    onBox={selectBox}
                    tool={tool}
                    carry={carryPlants}
                    picked={picked}
                  />
                </div>
                <div className={`fm-panel p-4`} style={{ flex: "1 1 220px" }} aria-live="polite">
                  {}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <button
                      onClick={toggleTrowel}
                      aria-pressed={tool === "trowel"}
                      className={`min-h-[44px] px-3 rounded-xl border-[3px] border-[#202808] font-bold flex items-center gap-2 ${tool === "trowel" ? "bg-[#33432B] text-[#FBF6EA] shadow-[3px_3px_0_#C4866D]" : "bg-white"}`}
                    >
                      <img src={trowelImg} alt="" className="w-7 h-7 object-contain" />
                      Trowel
                    </button>
                  </div>
                  {tool && (
                    <div className="flex flex-col gap-2 mb-3">
                      {carryPlants.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => setCarry([])} className="fm-btn fm-btn--light">
                            Put back
                          </button>
                          <button
                            onClick={() =>
                              setConfirm({ type: "plant", ids: carryPlants.map((p) => p.id) })
                            }
                            className="fm-btn fm-btn--danger-light"
                          >
                            Throw away
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => setPicked(slot.plants.map((p) => p.id))}
                              disabled={slot.plants.length === 0}
                              className="fm-btn fm-btn--light !min-h-[36px] !px-2 !text-xs"
                            >
                              Select all
                            </button>
                            <button
                              onClick={() => setPicked(readyPlants.map((p) => p.id))}
                              disabled={readyPlants.length === 0}
                              className="fm-btn fm-btn--light !min-h-[36px] !px-2 !text-xs"
                            >
                              Select ready ({readyPlants.length})
                            </button>
                            {picked.length > 0 && (
                              <button
                                onClick={() => setPicked([])}
                                className="fm-btn fm-btn--light !min-h-[36px] !px-2 !text-xs"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          {picked.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              <button onClick={startMove} className="fm-btn fm-btn--primary">
                                Move ({picked.length})
                              </button>
                              <button
                                onClick={() => setHarvesting(pickedReady.map((p) => p.id))}
                                disabled={pickedReady.length === 0}
                                className="fm-btn fm-btn--accent"
                              >
                                Harvest ({pickedReady.length})
                              </button>
                              <button
                                onClick={() => setConfirm({ type: "plant", ids: picked })}
                                className="fm-btn fm-btn--danger-light"
                              >
                                Throw away
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {(toolMsg || tool) && (
                    <p className="text-sm font-bold mb-3">
                      {toolMsg ||
                        (carryPlants.length > 0
                          ? `${carryPlants.length} plant${carryPlants.length === 1 ? " is" : "s are"} on the trowel. Click a square to put ${carryPlants.length === 1 ? "it" : "them"} down. The top left plant lands where you click, and empty gaps between them are squeezed out.`
                          : picked.length > 0
                            ? `${picked.length} selected. Drag again for a new selection, hold Shift to add, or click a plant to add or remove it. Click an empty square to move them there.${pickedReady.length < picked.length ? " Only ready plants can be harvested." : ""}`
                            : "Drag across the grid to select a group, or click plants one by one. Then move, harvest or throw them away.")}
                    </p>
                  )}
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
                      {selPlant.lastHarvested && <p>Last harvested: {selPlant.lastHarvested}</p>}
                      <p className="font-bold flex items-center gap-1">
                        <Droplets size={14} aria-hidden="true" />
                        {!selPlant.lastWatered
                          ? "Not watered yet \u2013 needs water"
                          : plantOverdue(selPlant, now)
                            ? `Overdue by ${daysOverdue(selPlant, now)} day${daysOverdue(selPlant, now) === 1 ? "" : "s"} (last: ${new Date(selPlant.lastWatered).toLocaleDateString([], { month: "short", day: "numeric" })})`
                            : plantNeedsWater(selPlant, now)
                            ? `Needs water (last: ${new Date(selPlant.lastWatered).toLocaleDateString([], { month: "short", day: "numeric" })})`
                            : plantWateredToday(selPlant, now)
                              ? `Watered today, ${new Date(selPlant.lastWatered).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                              : `Doesn't need water yet (last: ${new Date(selPlant.lastWatered).toLocaleDateString([], { month: "short", day: "numeric" })})`}
                      </p>
                      <p className="mb-3">
                        Harvest around: {addDays(selPlant.plantedOn, selCrop.maturity)}
                      </p>
                      <p className="text-sm">
                        Needs water every {wateringInterval(selPlant)} day{wateringInterval(selPlant) === 1 ? "" : "s"}
                        {plantNeedsWater(selPlant, now)
                          ? plantOverdue(selPlant, now)
                            ? ` \u2013 overdue by ${daysOverdue(selPlant, now)} day${daysOverdue(selPlant, now) === 1 ? "" : "s"}`
                            : " \u2013 due today"
                          : ` \u2013 next in ${daysUntilWatering(selPlant, now)} day${daysUntilWatering(selPlant, now) === 1 ? "" : "s"}`}
                      </p>
                      {plantNeedsWater(selPlant, now) && (
                        <button
                          onClick={() => waterPlant(selPlant)}
                          className="fm-btn fm-btn--primary flex items-center gap-2 mb-3"
                        >
                          <Droplets size={16} /> Water this plant
                        </button>
                      )}
                      <p className="text-sm">Use the trowel to move or harvest this plant.</p>
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

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold">Jump to:</span>
                {[30, 90, 180, 365, 540, 730, 1095, 1460].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      setPreview(days);
                    }}
                    aria-pressed={preview === days}
                    className={`fm-btn ${preview === days ? "fm-btn--primary" : "fm-btn--light"} !min-h-[34px] !px-3 !text-xs`}
                  >
                    {days === 365 ? "1 year" : days === 540 ? "18 months" : days === 730 ? "2 years" : days === 1095 ? "3 years" : days === 1460 ? "4 years" : `${days} days`}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="font-bold">Watering Status:</span>
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-[#202808] bg-[#4A90C2]" />
                    Water today
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-[#202808] bg-[#C0392B]" />
                    Overdue
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="font-bold">Crop Stage:</span>
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 rounded border-2 border-[#8E5A45] bg-[#C4866D]" />
                    Empty square
                  </span>
                  {Object.entries(STAGES).map(([k, v]) => (
                    <span key={k} className="inline-flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded border-2 border-[#202808]"
                        style={{ background: v.color }}
                      />
                      {v.label}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-sm">
                One square holds one plant, whatever the crop. Large plants like banana and mango
                need more room than one square, so leave gaps around them.
              </p>
            </>
          )}
        </section>
      </div>

      <ChatHead context={chat.context} suggestions={chat.suggestions} hint={chat.hint} />

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
      {renameAsk && renameSlot && (
        <Modal
          title={renameAsk === "leave" ? "Unsaved changes" : "Save these changes?"}
          onClose={keepEditing}
        >
          <div className={renameAsk === "leave" ? "flex items-center gap-3 mb-4" : "mb-4"}>
            {renameAsk === "leave" && (
              <Img src={sproutShocked} alt="" w={72} h={72} label="sprout" />
            )}
            <div className="min-w-0">
              {renameAsk === "leave" && (
                <p className="mb-2">You changed the name but haven’t saved it yet.</p>
              )}
              <ul className="list-disc pl-5 flex flex-col gap-1">
                <li className="break-words">
                  Name: {renameSlot.name} → {renameText.trim()}
                </li>
              </ul>
            </div>
          </div>
          <div className="fm-modal__actions">
            {renameAsk === "leave" && (
              <button type="button" className="fm-btn fm-btn--light" onClick={endRename}>
                Discard
              </button>
            )}
            <button type="button" className="fm-btn fm-btn--light" onClick={keepEditing}>
              Keep editing
            </button>
            <button
              type="button"
              className="fm-btn fm-btn--primary"
              onClick={saveRename}
              disabled={renameBusy}
              autoFocus
            >
              {renameBusy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </Modal>
      )}
      {renameLimit && (
        <LimitModal title={renameLimit.title} lines={renameLimit.lines} onClose={closeRenameLimit} />
      )}
      {updated && (
        <Modal title="Slot updated successfully!" onClose={() => setUpdated(null)}>
          <div className="flex flex-col gap-4">
            <div className="flex justify-center">
              <Img src={sproutHappy} alt="" w={88} h={88} label="sprout" />
            </div>
            <p className="text-center break-words">“{updated.name}” has been updated.</p>
            <button
              type="button"
              onClick={() => setUpdated(null)}
              className="fm-btn fm-btn--primary"
              autoFocus
            >
              Got it
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
      {notice && <LimitModal title={notice.title} lines={notice.lines} onClose={() => setNotice(null)} />}
      {blocked && (
        <Modal title="Those squares are taken" onClose={() => setBlocked(null)}>
          <div className="flex flex-col gap-4">
            <p>
              {blocked.taken > 0 &&
                `${blocked.taken} square${blocked.taken === 1 ? " is" : "s are"} already planted. `}
              {blocked.outside > 0 &&
                `${blocked.outside} plant${blocked.outside === 1 ? " would" : "s would"} land outside the plot. `}
              Nothing was moved. Click a different spot to try again.
            </p>
            <div className="fm-modal__actions">
              <button
                type="button"
                className="fm-btn fm-btn--light"
                onClick={() => {
                  setBlocked(null);
                  setCarry([]);
                  setPicked([]);
                }}
              >
                Cancel move
              </button>
              <button
                type="button"
                className="fm-btn fm-btn--primary"
                onClick={() => setBlocked(null)}
                autoFocus
              >
                Try another spot
              </button>
            </div>
          </div>
        </Modal>
      )}
      {harvesting && slot && (
        <HarvestModal
          plants={slot.plants.filter((p) => harvesting.includes(p.id))}
          onSubmit={harvestPlants}
          onClose={() => setHarvesting(null)}
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