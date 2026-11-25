import { CROPS, SOILS, cropByKey, effectiveMaturity } from "../data/crops";
import { plantWateredToday, slotWateredToday, wateringCounts } from "./watering";

const DAY_MS = 864e5;
const MAX_HARVESTS = 10;
const MAX_NOTES = 10;
const MAX_NOTE_CHARS = 300;

const dayOf = (ms) => new Date(ms).toLocaleDateString("en-CA");
const daysBetween = (a, b) =>
  Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / DAY_MS);
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};

function soilGrowthGuide() {
  return {
    rule: "Days to harvest = baseDays x factor. The first soil in soilsBestFirst is the best soil (x0.9, faster). Other listed soils are fine (x1.0). Any soil not listed is a poor fit (x1.25, slower).",
    crops: CROPS.map((c) => ({
      crop: cropLabel(c.key),
      baseDays: c.maturity,
      soilsBestFirst: c.soils,
      daysBySoil: Object.fromEntries(SOILS.map((s) => [s, effectiveMaturity(c, s)])),
    })),
  };
}

function partOfDay(now) {
  const h = new Date(now).getHours();
  if (h < 5) return "night";
  if (h < 10) return "morning";
  if (h < 16) return "midday";
  if (h < 19) return "evening";
  return "night";
}

const cropLabel = (key) => {
  const c = cropByKey(key);
  if (!c) return key;
  return c.en && c.en !== c.name ? `${c.en} (${c.name})` : c.name;
};

function wateringInfo(slot, now) {
  if (!slot.lastWatered) return { logged: false };
  const today = dayOf(now);
  const daysAgo = daysBetween(dayOf(slot.lastWatered), today);
  const counts = wateringCounts(slot, now);
  return {
    logged: true,
    date: dayOf(slot.lastWatered),
    time: new Date(slot.lastWatered).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    daysAgo,
    wateredToday: slotWateredToday(slot, now),
    plantsWateredToday: counts.watered,
    plantsNotWateredToday: counts.notWatered,
  };
}

function plantGroups(slot, now) {
  const today = dayOf(now);
  const groups = {};
  (slot.plants || []).forEach((p) => {
    const c = cropByKey(p.cropKey);
    const k = `${p.cropKey}|${p.plantedOn}`;
    if (!groups[k]) {
      groups[k] = {
        crop: cropLabel(p.cropKey),
        count: 0,
        plantedOn: p.plantedOn,
        ageDays: daysBetween(p.plantedOn, today),
        wateredCount: 0,
        notWateredCount: 0,
      };
      if (c?.maturity != null) {
        groups[k].harvestInDays = daysBetween(today, addDays(p.plantedOn, effectiveMaturity(c, slot.soil)));
      }
    }
    groups[k].count += 1;
    groups[k][plantWateredToday(p, now) ? "wateredCount" : "notWateredCount"] += 1;
  });
  return Object.values(groups).sort((a, b) => (a.harvestInDays ?? 1e9) - (b.harvestInDays ?? 1e9));
}

function plantsByWatering(slot, now) {
  const out = { wateredToday: {}, notWateredToday: {} };
  (slot.plants || []).forEach((p) => {
    const bucket = plantWateredToday(p, now) ? out.wateredToday : out.notWateredToday;
    const label = cropLabel(p.cropKey);
    bucket[label] = (bucket[label] || 0) + 1;
  });
  return out;
}

function slotDetail(slot, now) {
  const harvests = [...(slot.harvests || [])]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, MAX_HARVESTS)
    .map((h) => ({ crop: cropLabel(h.cropKey), date: h.date, amount: h.amount }));

  const notes = [...(slot.notes || [])]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, MAX_NOTES)
    .map((n) => ({
      date: n.date,
      crops: (n.cropKeys || []).map(cropLabel),
      text: String(n.text || "").slice(0, MAX_NOTE_CHARS),
    }));

  return {
    name: slot.name,
    soil: slot.soil,
    location: slot.place || slot.location,
    areaM2: Math.round(slot.widthM * slot.lengthM),
    lastWatered: wateringInfo(slot, now),
    plants: plantGroups(slot, now),
    plantsByWatering: plantsByWatering(slot, now),
    recentHarvests: harvests,
    recentNotes: notes,
  };
}

function fieldSummary(slot, now) {
  const w = wateringInfo(slot, now);
  return {
    name: slot.name,
    plantCount: (slot.plants || []).length,
    lastWatered: w.logged ? (w.wateredToday ? "today" : `${w.daysAgo} day(s) ago`) : "not logged",
  };
}

function attentionFor(slots, now, weather) {
  const items = [];
  const phase = partOfDay(now);

  slots.forEach((s) => {
    if (!(s.plants || []).length) return;
    const w = wateringInfo(s, now);

    if (!w.wateredToday) {
      const since = w.logged
        ? `last watered ${w.daysAgo} day(s) ago`
        : "no watering has been logged yet";
      const c = wateringCounts(s, now);
      const detail =
        c.watered > 0
          ? `${c.notWatered} of ${c.total} plants are not watered yet today`
          : `has not been watered today (${since}`;
      items.push({
        kind: "water",
        slot: s.name,
        text:
          c.watered > 0
            ? `${s.name}: ${detail} (it is ${phase}).`
            : `${s.name} ${detail}; it is ${phase}).`,
        chip: `Should I water ${s.name} today?`,
        score: w.logged ? 60 + Math.min(w.daysAgo, 10) * 3 : 75,
      });
    }

    plantGroups(s, now).forEach((g) => {
      if (g.harvestInDays == null || g.harvestInDays > 7) return;
      const when =
        g.harvestInDays <= 0
          ? "is ready to harvest"
          : `will be ready in ${g.harvestInDays} day(s)`;
      items.push({
        kind: "harvest",
        slot: s.name,
        text: `${g.crop} x${g.count} in ${s.name} ${when}.`,
        chip: g.harvestInDays <= 0 ? `Is my ${g.crop.split(" (")[0]} ready to harvest?` : `How do I prepare for harvesting ${g.crop.split(" (")[0]}?`,
        score: g.harvestInDays <= 0 ? 80 : 60 - g.harvestInDays,
      });
    });
  });

  const today = weather?.forecast?.[0];
  if (today && today.rainChancePct != null && today.rainChancePct >= 60) {
    items.push({
      kind: "rain",
      slot: null,
      text: `Rain is likely today (${today.rainChancePct}% chance, ${today.rainMm ?? 0} mm expected).`,
      chip: "Should I water if it might rain?",
      score: 70,
    });
  }
  if (weather?.temp != null && weather.temp >= 34) {
    items.push({
      kind: "heat",
      slot: null,
      text: `It is hot right now (${weather.temp}°C).`,
      chip: "How do I protect my plants from the heat?",
      score: 65,
    });
  }

  return items.sort((a, b) => b.score - a.score);
}

const DEFAULT_CHIPS = [
  "What should I plant now?",
  "How often should I water?",
  "What's the 3-day forecast?",
];

export function buildChatContext({ page, season, slot, slots = [], weather, now = Date.now() }) {
  const attention = attentionFor(slot ? [slot] : slots, now, slot ? weather : null);

  const context = {
    page,
    season,
    today: {
      date: dayOf(now),
      weekday: new Date(now).toLocaleDateString("en-US", { weekday: "long" }),
      time: new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      partOfDay: partOfDay(now),
    },
    slot: slot ? { ...slotDetail(slot, now), weather } : undefined,
    fields: slots.map((s) => fieldSummary(s, now)),
    attention: attention.slice(0, 5).map((a) => a.text),
    soilGrowthGuide: soilGrowthGuide(),
  };

  return {
    context,
    suggestions: DEFAULT_CHIPS,
    hint: null,
  };
}
