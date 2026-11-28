import { cropByKey } from "../data/crops";

const dayOf = (ms) => new Date(ms).toLocaleDateString("en-CA");
const DAY_MS = 86400000;
const dayNumber = (ms) => Math.round(new Date(dayOf(ms) + "T00:00:00").getTime() / DAY_MS);


export const plantWateredToday = (plant, now) =>
  !!plant?.lastWatered && dayOf(plant.lastWatered) === dayOf(now);

export function slotWateredToday(slot, now) {
  const plants = slot?.plants || [];
  if (plants.length === 0) return !!slot?.lastWatered && dayOf(slot.lastWatered) === dayOf(now);
  return plants.every((p) => plantWateredToday(p, now));
}

export function wateringCounts(slot, now) {
  const plants = slot?.plants || [];
  const watered = plants.filter((p) => plantWateredToday(p, now)).length;
  const needWater = plants.filter((p) => plantNeedsWater(p, now)).length;
  return { total: plants.length, watered, notWatered: plants.length - watered, needWater };
}

export const wateringInterval = (plant) => cropByKey(plant?.cropKey)?.waterEvery || 1;

export function daysUntilWatering(plant, now) {
  if (!plant?.lastWatered) return 0;
  return dayNumber(plant.lastWatered) + wateringInterval(plant) - dayNumber(now);
}

export const plantNeedsWater = (plant, now) => daysUntilWatering(plant, now) <= 0;

export const slotNeedsWater = (slot, now) =>
  (slot?.plants || []).some((p) => plantNeedsWater(p, now));

export function daysOverdue(plant, now) {
  if (!plant?.lastWatered) {
    if (!plant?.plantedOn) return 0;
    const planted = Math.round(new Date(`${plant.plantedOn}T00:00:00`).getTime() / DAY_MS);
    return Math.max(0, dayNumber(now) - planted);
  }
  return Math.max(0, -daysUntilWatering(plant, now));
}

export const plantOverdue = (plant, now) => daysOverdue(plant, now) > 0;