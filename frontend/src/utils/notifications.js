import { cropByKey } from "../data/crops";
import { slotWateredToday } from "./watering";

const dayOf = (ms) => new Date(ms).toLocaleDateString("en-CA");
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5);


function waterPhase(now) {
  const h = new Date(now).getHours();
  if (h < 5) return null;
  if (h < 10) return "morning";
  if (h < 16) return "midday";
  if (h < 19) return "evening";
  return "night";
}


export function notificationIds(slots, now) {
  const ids = [];
  const phase = waterPhase(now);
  if (phase) {
    slots.forEach((s) => {
      const watered = slotWateredToday(s, now);
      if ((s.plants || []).length > 0 && !watered) ids.push(`water-${s.id}-${dayOf(now)}-${phase}`);
    });
  }
  const seen = new Set();
  const today = dayOf(now);
  slots.forEach((s) =>
    (s.plants || []).forEach((p) => {
      const c = cropByKey(p.cropKey);
      if (!c) return;
      const date = addDays(p.plantedOn, c.maturity);
      if (daysBetween(today, date) > 7) return;
      seen.add(`harvest-${s.id}-${c.key}-${date}`);
    }),
  );
  return [...ids, ...seen];
}

export function countUnread(slots, marks, now) {
  return notificationIds(slots, now).filter((id) => !marks.deleted?.[id] && !marks.read?.[id]).length;
}