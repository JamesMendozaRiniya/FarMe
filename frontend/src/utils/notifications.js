// counts the unread notifications for the Mail label on the home page.
// this follows the same rules as buildNotifications() in dashboard.jsx (harvest reminders + watering reminders, with the same ids),
// so the number here matches the bell on the dashboard. it only reads: the read / deleted marks still belong to the dashboard.
// todo: dashboard.jsx still has its own copy of these helpers. move it to import from here so there is one version.
// todo(backend): if notifications become server-generated (GET /notifications), replace this whole file with that call.
import { cropByKey } from "../data/crops";

const dayOf = (ms) => new Date(ms).toLocaleDateString("en-CA");
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5);

// before 5 am nothing is sent. after that every part of the day is its own phase, so a new phase is a new notification.
function waterPhase(now) {
  const h = new Date(now).getHours();
  if (h < 5) return null;
  if (h < 10) return "morning";
  if (h < 16) return "midday";
  if (h < 19) return "evening";
  return "night";
}

// the ids of every notification that exists right now
export function notificationIds(slots, now) {
  const ids = [];
  const phase = waterPhase(now);
  if (phase) {
    slots.forEach((s) => {
      const watered = !!s.lastWatered && dayOf(s.lastWatered) === dayOf(now);
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

// marks = { read: { [id]: true }, deleted: { [id]: true } } from db.loadNotifState()
export function countUnread(slots, marks, now) {
  return notificationIds(slots, now).filter((id) => !marks.deleted?.[id] && !marks.read?.[id]).length;
}