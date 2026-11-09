import { useState, useEffect, useMemo } from "react";
import {
  Search,
  SlidersHorizontal,
  BookOpen,
  Sprout,
  CalendarCheck,
  NotebookPen,
  Plus,
  ArrowLeft,
  Trash2,
  ChevronRight,
  ListChecks,
  Pencil,
  LayoutGrid,
  Leaf,
} from "lucide-react";

import {
  getUser,
  fetchWeather,
  getSlots,
  deletePlantAPI,
  updateHarvestAPI,
  deleteHarvestAPI,
  createNoteAPI,
  updateNoteAPI,
  deleteNoteAPI,
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

import { CROPS, cropByKey } from "../../data/crops";

import "./library.css";
import dashboardEmpty from "../../assets/dashboard-empty-state.png";
import libraryEmpty from "../../assets/library-empty-state.png";

// todo: the date + stage helpers below are copies of the ones in dashboard.jsx. move them to one shared utils file.
const STAGES = {
  planned: { label: "Not planted yet", color: "#DEC59E" },
  sprout: { label: "Sprout", color: "#B9C79A" },
  growing: { label: "Growing", color: "#6A784D" },
  flowering: { label: "Flowering", color: "#F0C4B4" },
  ready: { label: "Ready to harvest", color: "#33432B" },
};
// the stages in order, with where each one starts and ends (as a share of the crop's maturity days)
const GROWTH = [
  ["sprout", 0, 0.25],
  ["growing", 0.25, 0.6],
  ["flowering", 0.6, 1],
  ["ready", 1, null],
];

/* ---------- helpers ---------- */

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => iso(new Date());
const addDays = (s, n) => {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const daysBetween = (a, b) =>
  Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5);
const niceDate = (s) =>
  new Date(`${s}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
const fmt = (value) => Number(value ?? 0).toFixed(1);
const pctOf = (age, maturity) => Math.min(100, Math.max(0, Math.round((age / maturity) * 100)));
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// where a plant sits in its field, like "Row 2, column 3". notes keep a plant's id, so a removed plant says so.
const spotOf = (slot, id) => {
  const p = slot?.plants.find((x) => x.id === id);
  return p ? `Row ${p.row + 1}, column ${p.col + 1}` : "a removed plant";
};
const plantsLabel = (slot, n) => (n.plantIds || []).map((id) => spotOf(slot, id)).join(" · ");
const stageOf = (age, maturity) => {
  if (age < 0) return "planned";
  const r = age / maturity;
  return r < 0.25 ? "sprout" : r < 0.6 ? "growing" : r < 1 ? "flowering" : "ready";
};

// one entry per crop in a field. the squares are grouped by planting date ("plantings"), because the same crop can be
// planted on different days. each planting has its own age, stage and harvest date.
// plants = every square on its own. since / age / stage / harvestOn describe the oldest planting (the most advanced one).
function cropsIn(slot) {
  const g = {};
  slot.plants.forEach((p) => {
    const crop = cropByKey(p.cropKey);
    if (!crop) return; // a crop that's no longer in crops.jsx is skipped instead of crashing the page
    const e = (g[crop.key] ||= { crop, count: 0, groups: {}, list: [] });
    e.count++;
    e.list.push(p);
    (e.groups[p.plantedOn] ||= { plantedOn: p.plantedOn, count: 0 }).count++;
  });
  const today = todayIso();
  return Object.values(g).map((e) => {
    const batches = Object.values(e.groups)
      .sort((a, b) => a.plantedOn.localeCompare(b.plantedOn))
      .map((b) => {
        const age = daysBetween(b.plantedOn, today);
        return {
          ...b,
          age,
          stage: stageOf(age, e.crop.maturity),
          harvestOn: addDays(b.plantedOn, e.crop.maturity),
          left: Math.max(0, e.crop.maturity - age),
        };
      });
    // every planted square on its own, in grid order (row by row)
    const plants = [...e.list]
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map((p) => {
        const age = daysBetween(p.plantedOn, today);
        return {
          id: p.id,
          row: p.row,
          col: p.col,
          plantedOn: p.plantedOn,
          lastHarvested: p.lastHarvested,
          age,
          stage: stageOf(age, e.crop.maturity),
          harvestOn: addDays(p.plantedOn, e.crop.maturity),
          left: Math.max(0, e.crop.maturity - age),
        };
      });
    const oldest = batches[0];
    return {
      crop: e.crop,
      count: e.count,
      batches,
      plants,
      readyCount: batches.filter((b) => b.stage === "ready").reduce((sum, b) => sum + b.count, 0),
      since: oldest.plantedOn,
      age: oldest.age,
      stage: oldest.stage,
      harvestOn: oldest.harvestOn,
    };
  });
}

// loads the weather for one field
function useWx(lat, lon) {
  const [wx, setWx] = useState(null);
  useEffect(() => {
    if (lat == null || lon == null) return setWx(null);
    let live = true;
    fetchWeather(lat, lon)
      .then((d) => live && setWx(d))
      .catch(() => live && setWx(null));
    return () => {
      live = false;
    };
  }, [lat, lon]);
  return wx;
}

// true on laptop screens and up. below that, the crop details open in a dialog instead of a side panel.
function useWide() {
  const q = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/* ---------- dialogs ---------- */

// a note can be about several crops. old notes only have one cropKey, so these read both shapes.
const noteKeys = (n) => n.cropKeys || (n.cropKey ? [n.cropKey] : []);
const cropsLabel = (keys) =>
  keys
    .map((k) => cropByKey(k))
    .filter(Boolean)
    .map((c) => `${c.emoji} ${c.name}`)
    .join(", ");

// new journal note: pick the field, tick the crop(s) it is about, then write it. the note is dated today.
// start = { slotId, cropKeys, plantId? } is what the dialog opens with. with a plantId the note is only about that one plant.
function NoteModal({ slots, start, onSave, onClose }) {
  const [slotId, setSlotId] = useState(start.slotId);
  const [keys, setKeys] = useState(start.cropKeys);
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const slot = slots.find((s) => s.id === slotId);
  const crops = [...new Set(slot.plants.map((p) => p.cropKey))].map(cropByKey).filter(Boolean);
  const allOn = crops.length > 0 && crops.every((c) => keys.includes(c.key));
  const cropError = keys.length === 0 ? "Pick at least one crop." : "";
  const textError = !text.trim() ? "Write a short note first." : "";
  const toggle = (k) => setKeys((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (cropError || textError) return;
    onSave({ slotId, cropKeys: keys, plantIds: start.plantId ? [start.plantId] : undefined, text: text.trim() });
  };
  const one = start.plantId ? cropByKey(keys[0]) : null;
  return (
    <Modal title={one ? "New note for this plant" : "New journal note"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        {one && (
          <p className="fm-panel p-3 flex items-center gap-3">
            <span className="text-3xl leading-none" aria-hidden="true">
              {one.emoji}
            </span>
            <span className="min-w-0">
              <span className="block font-bold">{one.name}</span>
              <span className="block text-sm">
                {slot.name} · {spotOf(slot, start.plantId)}
              </span>
            </span>
          </p>
        )}
        {!one && slots.length > 1 && (
          <div>
            <label htmlFor="note-field" className="block font-bold mb-1">
              Field
            </label>
            <Select
              id="note-field"
              value={slotId}
              onChange={(v) => {
                setSlotId(v);
                setKeys([]); // the crops belong to the field, so start the picks over
              }}
              options={slots.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>
        )}
        {!one && (
        <div role="group" aria-labelledby="note-crops-label">
          <div className="flex items-center justify-between gap-2">
            <p id="note-crops-label" className="font-bold">
              Which crops is this for?
            </p>
            {crops.length > 1 && (
              <button
                type="button"
                onClick={() => setKeys(allOn ? [] : crops.map((c) => c.key))}
                className="underline font-bold text-sm min-h-[44px]"
              >
                {allOn ? "Clear" : "Select all"}
              </button>
            )}
          </div>
          {crops.length === 0 ? (
            <p className="text-sm">Nothing is planted in {slot.name} yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {crops.map((c) => {
                const on = keys.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggle(c.key)}
                    aria-pressed={on}
                    className={`min-h-[44px] px-3 rounded-xl border-[3px] border-[#202808] font-bold flex items-center gap-2 ${on ? "bg-[#33432B] text-[#FBF6EA] shadow-[3px_3px_0_#C4866D]" : "bg-white"}`}
                  >
                    <span className="text-xl" aria-hidden="true">
                      {c.emoji}
                    </span>
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
          <p role="alert" className="fm-error text-sm min-h-[20px]">
            {tried ? cropError : ""}
          </p>
        </div>
        )}
        <div>
          <label htmlFor="note-text" className="block font-bold mb-1">
            Note
          </label>
          <textarea
            id="note-text"
            autoFocus={start.cropKeys.length > 0 || Boolean(one)}
            rows={5}
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What did you notice today?"
            aria-invalid={tried && textError ? "true" : "false"}
            aria-describedby="note-err"
            className="fm-input !py-2"
          />
          <div className="flex justify-between gap-3 text-sm">
            <p id="note-err" role="alert" className="fm-error min-h-[20px]">
              {tried ? textError : ""}
            </p>
            <span>{text.length}/500</span>
          </div>
        </div>
        <button type="submit" className="fm-btn fm-btn--primary">
          Save note
        </button>
      </form>
    </Modal>
  );
}

const TYPE_OPTIONS = [
  { value: "all", label: "All crops" },
  { value: "vegetable", label: "Vegetables" },
  { value: "fruit", label: "Fruits" },
];

const SORT_OPTIONS = [
  { value: "default", label: "Default order" },
  { value: "planted-new", label: "Planted: newest first" },
  { value: "planted-old", label: "Planted: oldest first" },
  { value: "harvest-soon", label: "Harvest: soonest first" },
  { value: "harvest-late", label: "Harvest: latest first" },
];
const NO_FILTER = {
  type: "all",
  field: "all",
  plantedFrom: "",
  plantedTo: "",
  harvestFrom: "",
  harvestTo: "",
  stages: [], // growth stages to show. empty = every stage
  sort: "default",
};
const SEARCH_HINT = { fields: "Search in your fields…", harvest: "Search harvests…", journal: "Search notes…" };

// every crop's journal tab gets one of the palette colors: [background, text]
const TAB_COLORS = [
  ["#6A784D", "#FBF6EA"], // dingley
  ["#C4866D", "#202808"], // copper
  ["#DEC59E", "#202808"], // brandy
  ["#A66F57", "#FBF6EA"], // soil
  ["#33432B", "#FBF6EA"], // kombu
];
const tabColor = (key) => TAB_COLORS[Math.max(0, CROPS.findIndex((c) => c.key === key)) % TAB_COLORS.length];

// dates are yyyy-mm-dd strings, so comparing them as text works. an empty limit means "no limit"
const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);
// does this plant pass the date filters? harvest date = planting date + the crop's maturity days
function plantPasses(p, f) {
  const crop = cropByKey(p.cropKey);
  if (!crop) return false;
  return (
    inRange(p.plantedOn, f.plantedFrom, f.plantedTo) &&
    inRange(addDays(p.plantedOn, crop.maturity), f.harvestFrom, f.harvestTo) &&
    (f.stages.length === 0 || f.stages.includes(stageOf(daysBetween(p.plantedOn, todayIso()), crop.maturity)))
  );
}
// the field with only the plants that pass the date filters, so counts and details match what the filter shows
const filterSlot = (slot, f) => ({ ...slot, plants: slot.plants.filter((p) => plantPasses(p, f)) });
// sorts the crop tiles inside a field by the dates of their plantings
function sortTiles(tiles, sort) {
  const first = (t) => t.batches[0];
  const last = (t) => t.batches[t.batches.length - 1];
  const by = {
    "planted-new": (a, b) => last(b).plantedOn.localeCompare(last(a).plantedOn),
    "planted-old": (a, b) => first(a).plantedOn.localeCompare(first(b).plantedOn),
    "harvest-soon": (a, b) => first(a).harvestOn.localeCompare(first(b).harvestOn),
    "harvest-late": (a, b) => last(b).harvestOn.localeCompare(last(a).harvestOn),
  }[sort];
  return by ? [...tiles].sort(by) : tiles;
}
// sorts single plants (the "each plant" view)
function sortPlants(list, sort) {
  const by = {
    "planted-new": (a, b) => b.plantedOn.localeCompare(a.plantedOn),
    "planted-old": (a, b) => a.plantedOn.localeCompare(b.plantedOn),
    "harvest-soon": (a, b) => a.harvestOn.localeCompare(b.harvestOn),
    "harvest-late": (a, b) => b.harvestOn.localeCompare(a.harvestOn),
  }[sort];
  return by ? [...list].sort(by) : list;
}

// from / to date pickers for one kind of date
function DateRange({ id, label, hint, from, to, onChange }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="font-bold mb-1">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${id}-from`} className="block text-sm mb-1">
            From
          </label>
          <DatePicker id={`${id}-from`} value={from} onChange={(v) => onChange({ from: v, to })} />
        </div>
        <div>
          <label htmlFor={`${id}-to`} className="block text-sm mb-1">
            To
          </label>
          <DatePicker id={`${id}-to`} value={to} onChange={(v) => onChange({ from, to: v })} />
        </div>
      </div>
      {hint && <p className="text-xs">{hint}</p>}
      {(from || to) && (
        <button
          type="button"
          className="underline font-bold text-sm self-start"
          onClick={() => onChange({ from: "", to: "" })}
        >
          Clear dates
        </button>
      )}
    </fieldset>
  );
}

function FilterModal({ value, slots, onApply, onClose }) {
  const [draft, setDraft] = useState(value);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const fieldOptions = [{ value: "all", label: "All fields" }, ...slots.map((s) => ({ value: s.id, label: s.name }))];
  return (
    <Modal title="Filter" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor="f-type" className="block font-bold mb-1">
            Crop type
          </label>
          <Select id="f-type" value={draft.type} onChange={(type) => set({ type })} options={TYPE_OPTIONS} />
        </div>
        <div>
          <label htmlFor="f-field" className="block font-bold mb-1">
            Field
          </label>
          <Select id="f-field" value={draft.field} onChange={(field) => set({ field })} options={fieldOptions} />
        </div>
        <div>
          <label htmlFor="f-sort" className="block font-bold mb-1">
            Sort by
          </label>
          <Select id="f-sort" value={draft.sort} onChange={(sort) => set({ sort })} options={SORT_OPTIONS} />
        </div>
        <div role="group" aria-labelledby="f-stage-label">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p id="f-stage-label" className="font-bold">
              Growth stage
            </p>
            {draft.stages.length > 0 && (
              <button type="button" className="underline font-bold text-sm min-h-[44px]" onClick={() => set({ stages: [] })}>
                Clear stages
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(STAGES).map(([k, s]) => (
              <button
                key={k}
                type="button"
                aria-pressed={draft.stages.includes(k)}
                onClick={() =>
                  set({ stages: draft.stages.includes(k) ? draft.stages.filter((x) => x !== k) : [...draft.stages, k] })
                }
                className="fm-stagechip"
              >
                <span className="fm-stagechip__dot" style={{ background: s.color }} aria-hidden="true" />
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-xs mt-1">Pick one or more. Only plants in those stages are shown.</p>
        </div>
        <DateRange
          id="f-planted"
          label="Date planted"
          from={draft.plantedFrom}
          to={draft.plantedTo}
          onChange={({ from, to }) => set({ plantedFrom: from, plantedTo: to })}
        />
        <DateRange
          id="f-harvest"
          label="Harvest date"
          hint="Uses the expected harvest date of each plant."
          from={draft.harvestFrom}
          to={draft.harvestTo}
          onChange={({ from, to }) => set({ harvestFrom: from, harvestTo: to })}
        />
        <div className="fm-modal__actions mt-1">
          <button type="button" className="fm-btn fm-btn--light" onClick={() => onApply(NO_FILTER)}>
            Reset
          </button>
          <button type="button" className="fm-btn fm-btn--primary" onClick={() => onApply(draft)}>
            Show results
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- edit dialogs. saving does not apply the change right away: the page asks "save changes?" first.
function EditNoteModal({ slot, note, onSave, onClose }) {
  const [text, setText] = useState(note.text);
  const [date, setDate] = useState(note.date);
  const [keys, setKeys] = useState(noteKeys(note));
  const [tried, setTried] = useState(false);
  const single = Boolean(note.plantIds?.length); // a note about one plant keeps its crop
  // the crops of this field plus the note's own, so a crop whose plants are gone can stay on the note
  const crops = [...new Set([...slot.plants.map((p) => p.cropKey), ...noteKeys(note)])].map(cropByKey).filter(Boolean);
  const textError = !text.trim() ? "Write a short note first." : "";
  const cropError = !single && keys.length === 0 ? "Pick at least one crop." : "";
  const dateError = !date ? "Pick a date." : "";
  const sameKeys = [...keys].sort().join() === [...noteKeys(note)].sort().join();
  const changed = text.trim() !== note.text || date !== note.date || (!single && !sameKeys);
  const toggle = (k) => setKeys((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (textError || cropError || dateError) return;
    if (!changed) return onClose();
    onSave({ text: text.trim(), date, ...(single ? {} : { cropKeys: keys }) });
  };
  return (
    <Modal title="Edit note" onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <p className="text-sm">
          {slot.name}
          {single && ` · ${plantsLabel(slot, note)}`}
        </p>
        <div>
          <label htmlFor="edit-note-date" className="block font-bold mb-1">
            Date
          </label>
          <DatePicker id="edit-note-date" value={date} onChange={setDate} max={todayIso()} />
          <p role="alert" className="fm-error text-sm min-h-[20px]">
            {tried ? dateError : ""}
          </p>
        </div>
        {!single && (
          <div role="group" aria-labelledby="edit-note-crops">
            <p id="edit-note-crops" className="font-bold mb-1">
              Which crops is this for?
            </p>
            <div className="flex flex-wrap gap-2">
              {crops.map((c) => {
                const on = keys.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggle(c.key)}
                    aria-pressed={on}
                    className={`min-h-[44px] px-3 rounded-xl border-[3px] border-[#202808] font-bold flex items-center gap-2 ${on ? "bg-[#33432B] text-[#FBF6EA] shadow-[3px_3px_0_#C4866D]" : "bg-white"}`}
                  >
                    <span className="text-xl" aria-hidden="true">
                      {c.emoji}
                    </span>
                    {c.name}
                  </button>
                );
              })}
            </div>
            <p role="alert" className="fm-error text-sm min-h-[20px]">
              {tried ? cropError : ""}
            </p>
          </div>
        )}
        <div>
          <label htmlFor="edit-note-text" className="block font-bold mb-1">
            Note
          </label>
          <textarea
            id="edit-note-text"
            autoFocus
            rows={5}
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={tried && textError ? "true" : "false"}
            aria-describedby="edit-note-err"
            className="fm-input !py-2"
          />
          <div className="flex justify-between gap-3 text-sm">
            <p id="edit-note-err" role="alert" className="fm-error min-h-[20px]">
              {tried ? textError : ""}
            </p>
            <span>{text.length}/500</span>
          </div>
        </div>
        <div className="fm-modal__actions">
          <button type="button" className="fm-btn fm-btn--light" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="fm-btn fm-btn--primary">
            Save changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

// a harvest log can change its amount and the day it was harvested. whether the plant was kept or removed is a fact, so it stays.
function EditHarvestModal({ harvest, onSave, onClose }) {
  const [amount, setAmount] = useState(String(harvest.amount ?? ""));
  const [date, setDate] = useState(harvest.date);
  const [tried, setTried] = useState(false);
  const dateError = !date ? "Pick a date." : harvest.plantedOn && date < harvest.plantedOn ? "It can't be before the planting date." : "";
  const changed = amount.trim() !== String(harvest.amount ?? "") || date !== harvest.date;
  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (dateError) return;
    if (!changed) return onClose();
    onSave({ amount: amount.trim(), date });
  };
  return (
    <Modal title="Edit harvest" onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <p className="fm-panel p-3 flex items-center gap-3">
          <span className="text-3xl leading-none" aria-hidden="true">
            {harvest.crop.emoji}
          </span>
          <span className="min-w-0">
            <span className="block font-bold">{harvest.crop.name}</span>
            <span className="block text-sm">
              {harvest.slotName} · {harvest.kept ? "plant kept" : "plant removed"}
            </span>
          </span>
        </p>
        <div>
          <label htmlFor="edit-h-amount" className="block font-bold mb-1">
            Amount
          </label>
          <input
            id="edit-h-amount"
            autoFocus
            maxLength={40}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 2 kg"
            className="fm-input"
          />
        </div>
        <div>
          <label htmlFor="edit-h-date" className="block font-bold mb-1">
            Date harvested
          </label>
          <DatePicker id="edit-h-date" value={date} onChange={setDate} min={harvest.plantedOn} max={todayIso()} />
          <p role="alert" className="fm-error text-sm min-h-[20px]">
            {tried ? dateError : ""}
          </p>
        </div>
        <div className="fm-modal__actions">
          <button type="button" className="fm-btn fm-btn--light" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="fm-btn fm-btn--primary">
            Save changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- small pieces ---------- */

// pick = null normally. in select mode it is { checked, onToggle } and the card turns into a tick box.
function NoteCard({ note, label, tag, pick, onEdit, onDelete }) {
  const d = new Date(`${note.date}T00:00:00`);
  const Wrap = pick ? "label" : "div";
  return (
    <Wrap className={`fm-entry text-sm${pick ? " fm-entry--pick" : ""}${pick?.checked ? " is-picked" : ""}`}>
      <span className="fm-entry__stamp" aria-hidden="true">
        <span className="fm-entry__day">{d.getDate()}</span>
        <span className="fm-entry__month">{MONTHS_SHORT[d.getMonth()]}</span>
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-bold">
          {niceDate(note.date)}
          {label && <span className="font-normal"> · {label}</span>}
        </p>
        <p className="fm-entry__text break-words whitespace-pre-wrap">{note.text}</p>
        {tag && <span className="fm-entry__tag">{tag}</span>}
      </div>
      {pick ? (
        <input
          type="checkbox"
          className="fm-check shrink-0"
          checked={pick.checked}
          onChange={pick.onToggle}
          aria-label={`Select note from ${niceDate(note.date)}`}
        />
      ) : (
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={onEdit}
            aria-label={`Edit note from ${niceDate(note.date)}`}
            title="Edit note"
            className="fm-btn fm-btn--light !min-h-[36px] !w-[36px] !px-0 flex items-center justify-center"
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button
            onClick={onDelete}
            aria-label={`Delete note from ${niceDate(note.date)}`}
            title="Delete note"
            className="fm-btn fm-btn--danger-light !min-h-[36px] !w-[36px] !px-0 flex items-center justify-center"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </Wrap>
  );
}

// one logged harvest. in select mode (pick = { checked, onToggle }) the whole row is a tick box.
function HarvestRow({ h, pick, onEdit }) {
  const Wrap = pick ? "label" : "div";
  return (
    <Wrap className={`fm-panel p-3 flex items-center gap-3${pick ? " cursor-pointer" : ""}${pick?.checked ? " !bg-[#DEC59E]" : ""}`}>
      {pick && (
        <input
          type="checkbox"
          className="fm-check shrink-0"
          checked={pick.checked}
          onChange={pick.onToggle}
          aria-label={`Select ${h.crop.name} harvested on ${niceDate(h.date)}`}
        />
      )}
      <span className="text-4xl" aria-hidden="true">
        {h.crop.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          {h.crop.name}
          {h.amount && ` · ${h.amount}`}
        </p>
        <p className="text-sm">
          {h.slotName} · {niceDate(h.date)} · {h.kept ? "plant kept" : "plant removed"}
        </p>
      </div>
      {!pick && (
        <button
          onClick={onEdit}
          aria-label={`Edit ${h.crop.name} harvest from ${niceDate(h.date)}`}
          title="Edit harvest"
          className="fm-btn fm-btn--light shrink-0 !min-h-[36px] !w-[36px] !px-0 flex items-center justify-center"
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
      )}
    </Wrap>
  );
}

// the row above a list that lets you tick things and delete them together
function SelectBar({ selecting, count, total, onStart, onCancel, onAll, onDelete }) {
  if (!selecting)
    return (
      <button onClick={onStart} className="fm-btn fm-btn--light self-start !min-h-[38px] !px-3 !text-sm flex items-center gap-2">
        <ListChecks size={16} aria-hidden="true" /> Select
      </button>
    );
  return (
    <div className="fm-selectbar" role="group" aria-label="Select items">
      <p className="font-bold" aria-live="polite">
        {count} selected
      </p>
      <button onClick={onAll} className="underline font-bold text-sm min-h-[44px]">
        {count === total ? "Clear all" : "Select all"}
      </button>
      <span className="flex-1" />
      <button onClick={onCancel} className="fm-btn fm-btn--light !min-h-[38px] !px-3 !text-sm">
        Cancel
      </button>
      <button
        onClick={onDelete}
        disabled={count === 0}
        className="fm-btn fm-btn--danger !min-h-[38px] !px-3 !text-sm flex items-center gap-2"
      >
        <Trash2 size={15} aria-hidden="true" /> Delete
      </button>
    </div>
  );
}

// the crops of the Harvest History and the Crop Journal: "All" plus one colored chip per crop.
// each crop is its own notebook / its own harvest page.
function CropTabs({ crops, counts, total, active, onPick, label, emoji, noun }) {
  const items = [
    { key: "all", label, emoji, n: total, bg: "#FBF6EA", fg: "#202808" },
    ...crops.map((c) => {
      const [bg, fg] = tabColor(c.key);
      return { key: c.key, label: c.name, emoji: c.emoji, n: counts[c.key] || 0, bg, fg };
    }),
  ];
  return (
    <div role="tablist" aria-orientation="vertical" aria-label="Crops" className="fm-chips">
      {items.map((it) => (
        <button
          key={it.key}
          role="tab"
          aria-selected={active === it.key}
          aria-label={`${it.label}, ${it.n} ${noun}${it.n === 1 ? "" : "s"}`}
          title={it.label}
          onClick={() => onPick(it.key)}
          className={`fm-chip${active === it.key ? " is-active" : ""}`}
          style={{ "--tab": it.bg, "--tab-fg": it.fg }}
        >
          <span className="fm-chip__emoji" aria-hidden="true">
            {it.emoji}
          </span>
          <span className="fm-chip__name" aria-hidden="true">
            {it.label}
          </span>
          <span className="fm-chip__n" aria-hidden="true">
            {it.n}
          </span>
        </button>
      ))}
    </div>
  );
}

function Progress({ pct }) {
  return (
    <div
      role="progressbar"
      aria-label="Growth progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-3 rounded-full border-2 border-[#202808] bg-[#DEC59E] overflow-hidden"
    >
      <div className="h-full bg-[#33432B]" style={{ width: `${pct}%` }} />
    </div>
  );
}

const dayLabel = (t) => (t.age < 0 ? `Starts in ${-t.age} d` : `Day ${t.age}`);

// one planted square in the "each plant" view. the card opens the crop's details, the bin removes just this plant.
function PlantCard({ plant, on, onSelect, onRemove }) {
  const pct = Math.min(100, Math.max(0, Math.round((plant.age / plant.crop.maturity) * 100)));
  return (
    <div className={`fm-specimen fm-specimen--card ${on ? "is-on" : ""}`} style={{ "--stage": STAGES[plant.stage].color }}>
      <button onClick={onSelect} aria-pressed={on} className="text-left flex flex-col gap-2 pr-10">
        <span className="flex items-center gap-3">
          <span className="text-4xl leading-none" aria-hidden="true">
            {plant.crop.emoji}
          </span>
          <span className="min-w-0">
            <span className="block font-bold">{plant.crop.name}</span>
            <span className="block text-sm">
              {plant.slot.name} · Row {plant.row + 1}, column {plant.col + 1}
            </span>
          </span>
        </span>
        <span className="inline-flex self-start px-3 rounded-full border-2 border-[#202808] bg-[#33432B] text-[#FBF6EA] text-sm font-bold">
          {STAGES[plant.stage].label}
        </span>
        <span className="text-sm">
          Planted {niceDate(plant.plantedOn)} · {dayLabel(plant)}
        </span>
        <span className="text-sm">
          Harvest around {niceDate(plant.harvestOn)}
          {plant.left === 0 ? " (ready)" : ` (in ${plant.left} day${plant.left === 1 ? "" : "s"})`}
        </span>
        {plant.lastHarvested && <span className="text-sm">Last harvested {niceDate(plant.lastHarvested)}</span>}
      </button>
      <Progress pct={pct} />
      <button
        onClick={onRemove}
        aria-label={`Remove ${plant.crop.name} at row ${plant.row + 1}, column ${plant.col + 1}`}
        title="Remove this plant"
        className="!absolute top-3 right-2 fm-btn fm-btn--danger-light !min-h-[34px] !w-[34px] !px-0 flex items-center justify-center"
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

// one field: its header (size, soil, place, weather) and a tile for every crop planted in it
function FieldCard({ slot, tiles, selected, onSelect }) {
  const wx = useWx(slot.lat, slot.lon);
  return (
    <section className="fm-chapter" aria-label={slot.name}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="fm-chapter__label" aria-hidden="true" />
          <h2 className="fm-chapter__title font-display text-2xl font-bold truncate">{slot.name}</h2>
          <p className="text-sm break-words">
            {fmt(slot.widthM)} × {fmt(slot.lengthM)} m · {slot.soil} soil · {slot.place || slot.location}
          </p>
        </div>
        <p className="fm-chapter__weather">
          {wx ? `${wx.emoji} ${wx.temp}°C · ${wx.label}` : "Weather unavailable"}
        </p>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))" }}>
        {tiles.map((t) => {
          const on = selected?.slotId === slot.id && selected.cropKey === t.crop.key;
          return (
            <button
              key={t.crop.key}
              onClick={() => onSelect({ slotId: slot.id, cropKey: t.crop.key })}
              aria-pressed={on}
              className={`fm-specimen fm-specimen--tile ${on ? "is-on" : ""}`}
              style={{ "--stage": STAGES[t.stage].color }}
            >
              <span className="text-5xl leading-none" aria-hidden="true">
                {t.crop.emoji}
              </span>
              <span className="font-bold mt-1">{t.crop.name}</span>
              <span className="text-sm">
                {t.batches.length > 1
                  ? `${t.count} squares · ${t.batches.length} plantings`
                  : `${dayLabel(t)}${t.count > 1 ? ` · ×${t.count}` : ""}`}
              </span>
              <span className="text-xs inline-flex items-center gap-1">
                <span
                  className="w-2.5 h-2.5 rounded-full border-2 border-[#202808]"
                  style={{ background: STAGES[t.stage].color }}
                  aria-hidden="true"
                />
                {t.readyCount > 0 && t.readyCount < t.count
                  ? `${t.readyCount} of ${t.count} ready`
                  : STAGES[t.stage].label}
              </span>
            </button>
          );
        })}
        <a
          href="/dashboard"
          aria-label={`Plant something in ${slot.name} on the dashboard`}
          className="fm-specimen--add"
        >
          <Plus size={28} aria-hidden="true" />
          Plant more
        </a>
      </div>
    </section>
  );
}

/* ---------- crop details (side panel on big screens, dialog on small ones) ---------- */

const DETAIL_TABS = [
  ["overview", "Overview"],
  ["growth", "Growth"],
  ["harvest", "Harvest"],
  ["journal", "Journal"],
];

// one planted square: where it is, when it was planted, its stage and how far along it is
function PlantRow({ plant, crop, onOpen, onRemove }) {
  const pct = pctOf(plant.age, crop.maturity);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onOpen}
          aria-label={`Open the plant at row ${plant.row + 1}, column ${plant.col + 1}`}
          className="font-bold underline text-left min-h-[32px] flex items-center gap-1"
        >
          Row {plant.row + 1}, column {plant.col + 1}
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-3 rounded-full border-2 border-[#202808] bg-[#33432B] text-[#FBF6EA] text-sm font-bold">
            {STAGES[plant.stage].label}
          </span>
          <button
            onClick={onRemove}
            aria-label={`Remove the plant at row ${plant.row + 1}, column ${plant.col + 1}`}
            title="Remove this plant"
            className="fm-btn fm-btn--danger-light !min-h-[32px] !w-[32px] !px-0 flex items-center justify-center"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="text-sm">
        Planted {niceDate(plant.plantedOn)} · {dayLabel(plant)}
        {plant.lastHarvested && ` · last harvested ${niceDate(plant.lastHarvested)}`}
      </p>
      <Progress pct={pct} />
      <p className="text-sm text-right">
        {plant.left === 0
          ? "Ready to harvest."
          : `About ${plant.left} day${plant.left === 1 ? "" : "s"} to harvest`}
      </p>
    </div>
  );
}

// props: info = the crop in this field. plant = one planted square of it (or null for the whole crop).
// with a plant, every tab is about just that plant: its own overview, growth dates, harvest history and journal.
// tab / onTab: the open tab (kept by the page, so it stays when you switch to another crop or plant)
function Detail({ slot, info, plant, notes, tab, onTab, onBack, onBackToCrop, onOpenPlant, onNew, onEdit, onDelete, onRemove }) {
  const { crop } = info;
  const shown = plant ? [plant] : info.plants;
  const facts = [
    ["Type", crop.type === "fruit" ? "Fruit" : "Vegetable"],
    ["Maturity", `about ${crop.maturity} days`],
    ["Temperature", `${crop.temp[0]}–${crop.temp[1]}°C`],
    ["Soil", crop.soils.join(", ")],
    ["Seasons", crop.seasons.map((s) => (s === "wet" ? "Wet" : "Dry")).join(", ")],
  ];
  // plant mode: notes written for this plant, then the notes written for the whole crop
  const own = plant ? notes.filter((n) => n.plantIds?.includes(plant.id)) : [];
  const shared = plant ? notes.filter((n) => !n.plantIds?.length) : notes;
  // harvests logged for this exact square (the dashboard saves the row and column with each one)
  const pastHarvests = plant
    ? (slot.harvests || [])
        .filter((h) => h.cropKey === crop.key && h.row === plant.row && h.col === plant.col)
        .sort((x, y) => y.date.localeCompare(x.date))
    : [];
  const noteCard = (n) => {
    const others = noteKeys(n).filter((k) => k !== crop.key);
    return (
      <NoteCard
        key={n.id}
        note={n}
        label={others.length ? `also for ${cropsLabel(others)}` : null}
        tag={!plant && n.plantIds?.length ? plantsLabel(slot, n) : null}
        onEdit={() => onEdit(n)}
        onDelete={() => onDelete(n)}
      />
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {onBack && (
        <button onClick={onBack} className="fm-btn fm-btn--light self-start flex items-center gap-2">
          <ArrowLeft size={16} /> Back to Library
        </button>
      )}
      {plant && onBackToCrop && (
        <button onClick={onBackToCrop} className="fm-btn fm-btn--light self-start flex items-center gap-2">
          <ArrowLeft size={16} aria-hidden="true" /> All {crop.name}
        </button>
      )}
      <div className="flex items-center gap-3">
        <span className="text-6xl leading-none" aria-hidden="true">
          {crop.emoji}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-3xl font-bold leading-tight">{crop.name}</h2>
          <p className="italic">{crop.en}</p>
          <div className="flex flex-wrap gap-2 mt-1">
            <span className="inline-block px-3 rounded-full border-2 border-[#202808] bg-[#33432B] text-[#FBF6EA] text-sm font-bold">
              {crop.type === "fruit" ? "Fruit" : "Vegetable"}
            </span>
            {plant && (
              <span className="fm-plantmark">
                {spotOf(slot, plant.id)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div role="tablist" aria-label="Crop details" className="flex flex-wrap gap-2">
        {DETAIL_TABS.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => onTab(k)}
            className={`fm-btn ${tab === k ? "fm-btn--primary" : "fm-btn--light"} !min-h-[38px] !px-3 !text-sm`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex flex-col gap-3">
        {tab === "overview" && !plant && (
          <>
            <div className="fm-panel p-3 flex flex-col gap-3">
              <div>
                <p className="font-bold">In your field</p>
                <p className="font-bold truncate">{slot.name}</p>
                <p className="text-sm">
                  {info.count} square{info.count === 1 ? "" : "s"} planted
                  {info.batches.length > 1 && ` on ${info.batches.length} different dates`}
                </p>
                {info.plants.length > 1 && <p className="text-sm">Tap a row to open that plant on its own page.</p>}
              </div>
              <div className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-1">
                {info.plants.map((pl) => (
                  <div key={pl.id} className="border-t-2 border-[#DEC59E] pt-3">
                    <PlantRow plant={pl} crop={crop} onOpen={() => onOpenPlant(pl.id)} onRemove={() => onRemove([pl.id])} />
                  </div>
                ))}
              </div>
              <button
                onClick={() => onRemove(info.plants.map((pl) => pl.id))}
                className="fm-btn fm-btn--danger-light flex items-center justify-center gap-2"
              >
                <Trash2 size={16} aria-hidden="true" />
                {info.plants.length === 1 ? `Remove this ${crop.name}` : `Remove all ${info.plants.length} ${crop.name}`}
              </button>
            </div>
            <div className="fm-panel p-3">
              <p className="font-bold mb-2">Quick facts</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {facts.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-bold">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        )}

        {tab === "overview" && plant && (
          <>
            <div className="fm-panel p-3 flex flex-col gap-3">
              <div className="fm-stagebar">
                <div>
                  <b>{plant.age < 0 ? "–" : plant.age}</b>
                  <span>days old</span>
                </div>
                <div>
                  <b>{plant.left}</b>
                  <span>days to harvest</span>
                </div>
                <div>
                  <b>{pctOf(plant.age, crop.maturity)}%</b>
                  <span>grown</span>
                </div>
              </div>
              <p className="flex items-center gap-2 font-bold">
                <span
                  className="w-4 h-4 rounded border-2 border-[#202808] shrink-0"
                  style={{ background: STAGES[plant.stage].color }}
                  aria-hidden="true"
                />
                {STAGES[plant.stage].label}
              </p>
              <Progress pct={pctOf(plant.age, crop.maturity)} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="font-bold">Field</dt>
                <dd>{slot.name}</dd>
                <dt className="font-bold">Planted</dt>
                <dd>
                  {niceDate(plant.plantedOn)} · {dayLabel(plant)}
                </dd>
                <dt className="font-bold">Harvest around</dt>
                <dd>
                  {niceDate(plant.harvestOn)}
                  {plant.left === 0 && " (ready)"}
                </dd>
                {plant.lastHarvested && (
                  <>
                    <dt className="font-bold">Last harvested</dt>
                    <dd>{niceDate(plant.lastHarvested)}</dd>
                  </>
                )}
                <dt className="font-bold">Notes</dt>
                <dd>
                  {own.length} for this plant, {shared.length} for all {crop.name}
                </dd>
              </dl>
              <button
                onClick={() => onRemove([plant.id])}
                className="fm-btn fm-btn--danger-light flex items-center justify-center gap-2"
              >
                <Trash2 size={16} aria-hidden="true" />
                Remove this plant
              </button>
            </div>
            <div className="fm-panel p-3">
              <p className="font-bold mb-2">Quick facts about {crop.name}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {facts.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-bold">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        )}

        {tab === "growth" && (
          <ol className="flex flex-col gap-2">
            {GROWTH.map(([k, from, to]) => {
              const n = shown.filter((p) => p.stage === k).length;
              const now = n > 0;
              const a = Math.round(from * crop.maturity);
              return (
                <li
                  key={k}
                  aria-current={now ? "step" : undefined}
                  className={`fm-panel p-2 flex items-center gap-3 ${now ? "!bg-[#DEC59E]" : ""}`}
                >
                  <span
                    className="w-4 h-4 rounded border-2 border-[#202808] shrink-0"
                    style={{ background: STAGES[k].color }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold">{STAGES[k].label}</span>
                    {plant && <span className="block text-xs">From {niceDate(addDays(plant.plantedOn, a))}</span>}
                  </span>
                  <span className="text-sm">{to ? `Day ${a}–${Math.round(to * crop.maturity)}` : `Day ${a}+`}</span>
                  {now && <span className="text-xs font-bold">{!plant && info.plants.length > 1 ? `${n} now` : "Now"}</span>}
                </li>
              );
            })}
          </ol>
        )}

        {tab === "harvest" && (
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
            {shown.map((pl) => (
              <div key={pl.id} className="fm-panel p-3 text-sm flex flex-col gap-1">
                <p className="font-bold">
                  Row {pl.row + 1}, column {pl.col + 1}
                </p>
                <p>
                  <span className="font-bold">Planted:</span> {niceDate(pl.plantedOn)}
                </p>
                <p>
                  <span className="font-bold">Harvest around:</span> {niceDate(pl.harvestOn)}
                </p>
                {pl.lastHarvested && (
                  <p>
                    <span className="font-bold">Last harvested:</span> {niceDate(pl.lastHarvested)}
                  </p>
                )}
                <p className="font-bold">
                  {pl.left === 0 ? "Ready to harvest now." : `${pl.left} day${pl.left === 1 ? "" : "s"} to go.`}
                </p>
              </div>
            ))}
            {plant && (
              <>
                <p className="font-bold mt-1">Past harvests from this spot</p>
                {pastHarvests.length === 0 && <p className="text-sm">None logged yet.</p>}
                {pastHarvests.map((h) => (
                  <div key={h.id} className="fm-panel p-3 text-sm">
                    <p className="font-bold">
                      {niceDate(h.date)}
                      {h.amount && ` · ${h.amount}`}
                    </p>
                    <p>
                      Planted {niceDate(h.plantedOn || h.date)} · {h.kept ? "plant kept" : "plant removed"}
                    </p>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab === "journal" && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-bold">{plant ? "Journal for this plant" : "My Journal"}</p>
                <p className="text-sm">
                  {plant
                    ? `Notes about ${spotOf(slot, plant.id).toLowerCase()} in ${slot.name}.`
                    : `Notes about this crop in ${slot.name}.`}
                </p>
              </div>
              <button onClick={onNew} className="fm-btn fm-btn--light shrink-0 flex items-center gap-2">
                <Plus size={16} /> New note
              </button>
            </div>
            {plant ? (
              <>
                {own.length === 0 && <p className="text-sm">No notes for this plant yet. Add one when you notice something.</p>}
                {own.map(noteCard)}
                {shared.length > 0 && (
                  <>
                    <p className="font-bold mt-1">For all {crop.name} in this field</p>
                    {shared.map(noteCard)}
                  </>
                )}
              </>
            ) : notes.length === 0 ? (
              <p className="text-sm">No notes yet. Add one when you notice something new.</p>
            ) : (
              notes.map(noteCard)
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- main ---------- */

const TABS = [
  ["fields", "My Fields", Sprout],
  ["harvest", "Harvest History", CalendarCheck],
  ["journal", "Crop Journal", NotebookPen],
];

export default function FarMeLibrary() {
  const [slots, setSlots] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState({ username: "", firstName: "", lastName: "" }); // empty until getUser answers, so no placeholder name shows
  const [tab, setTab] = useState("fields");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(NO_FILTER); // only the My Fields tab has a filter
  const [view, setView] = useState("crop"); // "crop" = one tile per crop, "plant" = every planted square on its own
  const [showFilter, setShowFilter] = useState(false);
  const [selected, setSelected] = useState(null); // { slotId, cropKey, plantId? }. with a plantId the details are about that one plant
  const [showNote, setShowNote] = useState(null); // { slotId, cropKeys, plantId? } while the new-note dialog is open
  const [noteCrop, setNoteCrop] = useState("all"); // which crop journal is open on the Crop Journal tab ("all" = every note)
  const [selecting, setSelecting] = useState(false); // select mode on the Harvest History and Crop Journal tabs
  const [picked, setPicked] = useState([]); // ids of the ticked harvest entries / notes
  const [bulkDel, setBulkDel] = useState(false);
  const [harvestCrop, setHarvestCrop] = useState("all"); // which crop's harvests are open on the Harvest History tab
  const [dtab, setDtab] = useState("overview"); // open tab of the crop details
  const [editing, setEditing] = useState(null); // { kind: "note" | "harvest", slotId, id } while the edit dialog is open
  const [pending, setPending] = useState(null); // an edit waiting for "save changes?": { kind, slotId, id, patch }
  const [delNote, setDelNote] = useState(null); // { slotId, id }
  const [delPlants, setDelPlants] = useState(null); // { slotId, ids }: plants waiting for "remove?"
  const wide = useWide();

  // the library reads the same slots as the dashboard (GET /slots). each slot already comes with its plants, harvests and notes.
  useEffect(() => {
    const loadLibrary = async () => {
      try {
        setSlots(await getSlots());
      } catch (error) {
        console.error("Failed to load Library:", error);
        alert("Unable to load your library. Please try again.");
      } finally {
        setLoaded(true);
      }
    };

    loadLibrary();
    getUser().then(setUser).catch(console.error);
  }, []);
  // search matches crop names (local + english) and field names. the date filters and sorting come from the filter dialog.
  const q = query.trim().toLowerCase();
  const narrowed =
    filter.type !== "all" ||
    filter.stages.length > 0 ||
    filter.plantedFrom ||
    filter.plantedTo ||
    filter.harvestFrom ||
    filter.harvestTo;
  const fields = useMemo(
    () =>
      slots
        .filter((s) => filter.field === "all" || s.id === filter.field)
        .map((s) => {
          const fieldHit = q && s.name.toLowerCase().includes(q);
          const tiles = cropsIn(filterSlot(s, filter)).filter(
            (t) =>
              (filter.type === "all" || t.crop.type === filter.type) &&
              (!q || fieldHit || t.crop.name.toLowerCase().includes(q) || t.crop.en.toLowerCase().includes(q)),
          );
          return { slot: s, tiles: sortTiles(tiles, filter.sort) };
        })
        .filter((f) => f.tiles.length > 0 || (!q && !narrowed)),
    [slots, q, filter, narrowed],
  );
  // every planted square on its own, for the "each plant" view
  const plantCards = useMemo(
    () =>
      sortPlants(
        fields.flatMap((f) => f.tiles.flatMap((t) => t.plants.map((pl) => ({ ...pl, slot: f.slot, crop: t.crop })))),
        filter.sort,
      ),
    [fields, filter.sort],
  );

  const selSlot = selected ? slots.find((s) => s.id === selected.slotId) : null;
  const selInfo = selSlot ? cropsIn(filterSlot(selSlot, filter)).find((t) => t.crop.key === selected.cropKey) : null;
  const selPlant = selInfo && selected.plantId ? selInfo.plants.find((p) => p.id === selected.plantId) || null : null;
  const selNotes = selInfo ? (selSlot.notes || []).filter((n) => noteKeys(n).includes(selected.cropKey)) : [];

 const addNote = async ({ slotId, cropKeys, plantIds, text }) => {
    try {
      // POST /slots/:id/notes. the server sends back the saved note { id, cropKeys, plantIds, date, text }
      const note = await createNoteAPI(slotId, {
        cropKeys,
        plantIds: plantIds || null,
        date: todayIso(),
        text,
      });

      setSlots((all) =>
        all.map((s) => (s.id === slotId ? { ...s, notes: [note, ...(s.notes || [])] } : s)),
      );

      setShowNote(null);
    } catch (error) {
      alert(error.message || "Failed to save journal note.");
    }
  };

  const removeNote = async () => {
    try {
      await deleteNoteAPI(delNote.id);

      setSlots((all) =>
        all.map((s) =>
          s.id === delNote.slotId
            ? {
                ...s,
                notes: (s.notes || []).filter((n) => n.id !== delNote.id),
              }
            : s,
        ),
      );

      setDelNote(null);
    } catch (error) {
      alert(error.message || "Failed to delete journal note.");
    }
  };

  // removing plants from the library. their notes and harvest history stay.
 const removePlants = async () => {
    const { slotId, ids } = delPlants;
    const slot = slots.find((s) => s.id === slotId);

    try {
      await Promise.all(ids.map((id) => deletePlantAPI(id)));

      const left = slot.plants.filter((p) => !ids.includes(p.id));

      setSlots((all) =>
        all.map((s) => (s.id === slotId ? { ...s, plants: left } : s)),
      );

      if (selected?.slotId === slotId) {
        if (!left.some((p) => p.cropKey === selected.cropKey)) {
          setSelected(null);
        } else if (selected.plantId && ids.includes(selected.plantId)) {
          setSelected({ slotId, cropKey: selected.cropKey });
        }
      }

      setDelPlants(null);
    } catch (error) {
      alert(error.message || "Failed to delete plants.");
    }
  };
  const delSlot = delPlants ? slots.find((s) => s.id === delPlants.slotId) : null;
  const delList = delSlot ? delSlot.plants.filter((p) => delPlants.ids.includes(p.id)) : [];
  const delSameCrop = delList.length > 0 && delList.every((p) => p.cropKey === delList[0].cropKey);
  const delName = delList.length ? cropByKey(delList[0].cropKey)?.name : "";

  // ----- crop journal: the notes (after the search), and the crop whose notebook is open
  const notesBase = slots
    .flatMap((s) =>
      (s.notes || []).map((n) => ({
        ...n,
        slotId: s.id,
        slotName: s.name,
        plantLabel: plantsLabel(s, n),
        crops: noteKeys(n).map(cropByKey).filter(Boolean),
      })),
    )
    .filter(
      (n) =>
        n.crops.length > 0 &&
        (!q ||
          n.text.toLowerCase().includes(q) ||
          n.slotName.toLowerCase().includes(q) ||
          n.crops.some((c) => c.name.toLowerCase().includes(q) || c.en.toLowerCase().includes(q))),
    );
  const plantedAnywhere = (c) => slots.some((s) => s.plants.some((p) => p.cropKey === c.key));
  // a crop gets a tab when it is planted somewhere or already has notes
  const journalCrops = CROPS.filter((c) => plantedAnywhere(c) || notesBase.some((n) => n.crops.some((x) => x.key === c.key)));
  const noteCounts = {};
  notesBase.forEach((n) => n.crops.forEach((c) => (noteCounts[c.key] = (noteCounts[c.key] || 0) + 1)));
  const jKey = journalCrops.some((c) => c.key === noteCrop) ? noteCrop : "all";
  const jCrop = jKey === "all" ? null : cropByKey(jKey);
  const allNotes = (jKey === "all" ? notesBase : notesBase.filter((n) => n.crops.some((c) => c.key === jKey))).sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  // ----- harvest history: the harvests logged on the dashboard + what is ready now, for the crop whose tab is open
  const harvestsBase = slots
    .flatMap((s) => (s.harvests || []).map((h) => ({ ...h, slotId: s.id, slotName: s.name, crop: cropByKey(h.cropKey) })))
    .filter((h) => h.crop && (!q || [h.crop.name, h.crop.en, h.slotName].some((v) => v.toLowerCase().includes(q))));
  const harvestCrops = CROPS.filter((c) => plantedAnywhere(c) || harvestsBase.some((h) => h.crop.key === c.key));
  const harvestCounts = {};
  harvestsBase.forEach((h) => (harvestCounts[h.crop.key] = (harvestCounts[h.crop.key] || 0) + 1));
  const hKey = harvestCrops.some((c) => c.key === harvestCrop) ? harvestCrop : "all";
  const hCrop = hKey === "all" ? null : cropByKey(hKey);
  const harvested = (hKey === "all" ? harvestsBase : harvestsBase.filter((h) => h.crop.key === hKey)).sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const ready = slots
    .flatMap((s) =>
      cropsIn(s)
        .filter(
          (t) =>
            t.readyCount > 0 &&
            (hKey === "all" || t.crop.key === hKey) &&
            (!q || s.name.toLowerCase().includes(q) || t.crop.name.toLowerCase().includes(q) || t.crop.en.toLowerCase().includes(q)),
        )
        .map((t) => ({ slot: s, ...t })),
    );

  // only My Fields has a filter now
  const filterCount =
    (filter.type !== "all") +
    (filter.field !== "all") +
    Boolean(filter.plantedFrom || filter.plantedTo) +
    Boolean(filter.harvestFrom || filter.harvestTo) +
    Boolean(filter.stages.length) +
    (filter.sort !== "default");

  // ----- edit (the dialog asks, then the page asks "save changes?")
  const editSlot = editing ? slots.find((s) => s.id === editing.slotId) : null;
  const editNote = editing?.kind === "note" ? editSlot?.notes?.find((n) => n.id === editing.id) : null;
  const editHarvestRaw = editing?.kind === "harvest" ? editSlot?.harvests?.find((h) => h.id === editing.id) : null;
  const editHarvest = editHarvestRaw && { ...editHarvestRaw, slotName: editSlot.name, crop: cropByKey(editHarvestRaw.cropKey) };
 const applyEdit = async () => {
    const { kind, slotId, id, patch } = pending;

    try {
      // PATCH /notes/:id or /harvests/:id. only the fields that changed are sent, and the server answers with the saved record
      const saved =
        kind === "note"
          ? await updateNoteAPI(id, patch)
          : await updateHarvestAPI(id, { ...patch, amount: patch.amount || "Not specified" });

      const key = kind === "note" ? "notes" : "harvests";

      setSlots((all) =>
        all.map((s) =>
          s.id === slotId
            ? {
                ...s,
                [key]: (s[key] || []).map((x) => (x.id === id ? { ...x, ...saved } : x)),
              }
            : s,
        ),
      );

      setPending(null);
      setEditing(null);
    } catch (error) {
      alert(error.message || "Failed to update record.");
    }
  };

  // ----- select mode (harvest history + journal)
  const visibleIds = tab === "harvest" ? harvested.map((h) => h.id) : tab === "journal" ? allNotes.map((n) => n.id) : [];
  const pickedNow = picked.filter((id) => visibleIds.includes(id)); // ticked items that are still on screen
  const goTab = (k) => {
    setTab(k);
    setSelecting(false);
    setPicked([]);
  };
  const togglePick = (id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const pickProps = (id) => (selecting ? { checked: picked.includes(id), onToggle: () => togglePick(id) } : null);
  const selectBar = visibleIds.length > 0 && (
    <SelectBar
      selecting={selecting}
      count={pickedNow.length}
      total={visibleIds.length}
      onStart={() => setSelecting(true)}
      onCancel={() => {
        setSelecting(false);
        setPicked([]);
      }}
      onAll={() => setPicked(pickedNow.length === visibleIds.length ? [] : visibleIds)}
      onDelete={() => setBulkDel(true)}
    />
  );
  const deletePicked = async () => {
    const ids = new Set(pickedNow);
    const key = tab === "harvest" ? "harvests" : "notes";

    try {
      if (tab === "harvest") {
        await Promise.all([...ids].map((id) => deleteHarvestAPI(id)));
      } else {
        await Promise.all([...ids].map((id) => deleteNoteAPI(id)));
      }

      setSlots((all) =>
        all.map((s) =>
          s[key]?.some((x) => ids.has(x.id))
            ? { ...s, [key]: s[key].filter((x) => !ids.has(x.id)) }
            : s,
        ),
      );

      setPicked([]);
      setSelecting(false);
      setBulkDel(false);
    } catch (error) {
      alert(error.message || "Failed to delete selected records.");
    }
  };
  // new note from the journal tab: starts on the open crop (in a field where it is planted)
  const startNote = () => {
    const home = jKey !== "all" ? slots.find((s) => s.plants.some((p) => p.cropKey === jKey)) : null;
    setShowNote({ slotId: (home || slots[0]).id, cropKeys: home ? [jKey] : [] });
  };

  const detail = selInfo && (
    <Detail
      key={`${selected.slotId}-${selected.cropKey}`}
      slot={selSlot}
      info={selInfo}
      plant={selPlant}
      notes={selNotes}
      tab={dtab}
      onTab={setDtab}
      onEdit={(n) => setEditing({ kind: "note", slotId: selSlot.id, id: n.id })}
      onBack={wide ? () => setSelected(null) : null}
      // only when the plant was opened from its crop (Grouped). in Individual there is no crop page to go back to.
      onBackToCrop={view === "crop" ? () => setSelected({ slotId: selected.slotId, cropKey: selected.cropKey }) : null}
      onOpenPlant={(plantId) => setSelected({ slotId: selected.slotId, cropKey: selected.cropKey, plantId })}
      onNew={() => setShowNote({ slotId: selSlot.id, cropKeys: [selected.cropKey], plantId: selPlant?.id })}
      onDelete={(n) => setDelNote({ slotId: selSlot.id, id: n.id })}
      onRemove={(ids) => setDelPlants({ slotId: selSlot.id, ids })}
    />
  );

  return (
    <div className="min-h-screen bg-[#F1E7D2] text-[#202808] flex flex-col md:flex-row font-body">
      <Sidebar active="library" user={user} />

      <div className="flex-1 min-w-0 p-3 sm:p-5 flex flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="fm-panel w-12 h-12 shrink-0 flex items-center justify-center" aria-hidden="true">
              <BookOpen size={26} />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-2xl sm:text-3xl font-bold truncate">
                {user.username ? `${user.username}’s Library` : "Library"}
              </h1>
            </div>
          </div>
          <p className="fm-panel px-3 py-2 font-bold flex items-center gap-2 shrink-0">
            <Sprout size={16} aria-hidden="true" />
            {slots.length} {slots.length === 1 ? "Field" : "Fields"}
          </p>
        </header>

        {/* the book: cover > index tabs + the open pages (left page = the list, right page = details on big screens) */}
        <div className="fm-book">
          <div role="tablist" aria-label="Library sections" className="fm-book__tabs">
            {TABS.map(([k, label, Icon]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => goTab(k)}
                className={`fm-booktab${tab === k ? " is-active" : ""}`}
              >
                <Icon size={16} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
          <div className={`fm-book__spread${tab === "fields" && wide ? " fm-book__spread--open" : ""}`}>
            {selInfo && tab === "fields" && <span className="fm-book__ribbon" aria-hidden="true" />}
          <section className={`fm-page fm-page--left${tab === "journal" ? " fm-page--ruled" : ""}`} key={tab}>

            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <label htmlFor="lib-search" className="sr-only">
                  {SEARCH_HINT[tab]}
                </label>
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="lib-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={SEARCH_HINT[tab]}
                  autoComplete="off"
                  className="fm-input !pl-10"
                />
              </div>
              {tab === "fields" && (
                <button onClick={() => setShowFilter(true)} className="fm-btn fm-btn--accent shrink-0 flex items-center gap-2">
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  Filter{filterCount > 0 && ` (${filterCount})`}
                </button>
              )}
            </div>

            {tab === "fields" && loaded && slots.length > 0 && (
              <div role="group" aria-label="Show the list by" className="fm-seg">
                {[
                  ["crop", "Grouped", LayoutGrid, fields.reduce((n, f) => n + f.tiles.length, 0)],
                  ["plant", "Individual", Leaf, plantCards.length],
                ].map(([k, label, Icon, n]) => (
                  <button key={k} onClick={() => setView(k)} aria-pressed={view === k} className={`fm-seg__btn${view === k ? " is-on" : ""}`}>
                    <Icon size={16} aria-hidden="true" />
                    {label}
                    <span className="fm-seg__n">{n}</span>
                  </button>
                ))}
              </div>
            )}

            {!loaded && <p aria-live="polite">Loading your fields…</p>}

            {loaded && slots.length === 0 && (
              <div className="flex flex-col items-center text-center gap-2 py-8">
                <Img
                  src={dashboardEmpty}
                  alt=""
                  w={320}
                  ratio="380 / 230"
                  label="empty"
                  className="object-cover object-[50%_40%] max-w-full"
                />
                <p className="font-display text-xl font-bold">Nothing to show yet</p>
                <p>
                  <a href="/dashboard" className="underline font-bold text-[#33432B]">
                    Add a slot on the dashboard
                  </a>{" "}
                  and plant something. It will show up here.
                </p>
              </div>
            )}

            {loaded && slots.length > 0 && tab === "fields" && (
              <>
                {fields.length === 0 && <p>No crops match your search or filter.</p>}
                {view === "crop" &&
                  fields.map((f) => (
                    <FieldCard key={f.slot.id} slot={f.slot} tiles={f.tiles} selected={selected} onSelect={setSelected} />
                  ))}
                {view === "plant" && (
                  <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
                    {plantCards.map((pl) => (
                      <PlantCard
                        key={pl.id}
                        plant={pl}
                        on={selected?.plantId ? selected.plantId === pl.id : false}
                        onSelect={() => setSelected({ slotId: pl.slot.id, cropKey: pl.crop.key, plantId: pl.id })}
                        onRemove={() => setDelPlants({ slotId: pl.slot.id, ids: [pl.id] })}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {loaded && slots.length > 0 && tab === "harvest" && (
              <>
                <CropTabs
                  crops={harvestCrops}
                  counts={harvestCounts}
                  total={harvestsBase.length}
                  active={hKey}
                  onPick={setHarvestCrop}
                  label="All harvests"
                  emoji="🧺"
                  noun="harvest"
                />
                <div className="fm-journal__head" style={{ "--tab": hCrop ? tabColor(hCrop.key)[0] : "#DEC59E" }}>
                  <span className="text-4xl leading-none" aria-hidden="true">
                    {hCrop ? hCrop.emoji : "🧺"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-2xl font-bold leading-tight">
                      {hCrop ? `${hCrop.name} harvests` : "All harvests"}
                    </h2>
                    <p className="text-sm">
                      {hCrop
                        ? `What is ready and what you picked of ${hCrop.name}, across all your fields.`
                        : "Everything that is ready and everything you picked. Pick a crop above to see just that one."}
                    </p>
                  </div>
                </div>
                {!selecting && (
                  <>
                    <h2 className="fm-page__heading font-display text-xl font-bold">Ready to harvest</h2>
                    {ready.length === 0 && <p className="text-sm">Nothing is ready yet.</p>}
                    {ready.map((r) => (
                      <div key={`${r.slot.id}-${r.crop.key}`} className="fm-panel p-3 flex items-center gap-3">
                        <span className="text-4xl" aria-hidden="true">
                          {r.crop.emoji}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold">
                            {r.crop.name} ×{r.readyCount}
                          </p>
                          <p className="text-sm">
                            {r.slot.name} · ready since {niceDate(r.harvestOn)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                <h2 className="fm-page__heading font-display text-xl font-bold mt-2">Harvested</h2>
                {selectBar}
                {harvested.length === 0 && (
                  <p className="text-sm">
                    {q
                      ? "No harvests match your search."
                      : hCrop
                        ? `No ${hCrop.name} harvests logged yet. Use the Harvest button on the dashboard when you pick it.`
                        : "No harvests logged yet. Use the Harvest button on the dashboard when you pick a crop."}
                  </p>
                )}
                {harvested.map((h) => (
                  <HarvestRow
                    key={h.id}
                    h={h}
                    pick={pickProps(h.id)}
                    onEdit={() => setEditing({ kind: "harvest", slotId: h.slotId, id: h.id })}
                  />
                ))}
              </>
            )}

            {loaded && slots.length > 0 && tab === "journal" && (
              <>
                <CropTabs
                  crops={journalCrops}
                  counts={noteCounts}
                  total={notesBase.length}
                  active={jKey}
                  onPick={setNoteCrop}
                  label="All notes"
                  emoji="📖"
                  noun="note"
                />
                <div className="fm-journal__head" style={{ "--tab": jCrop ? tabColor(jCrop.key)[0] : "#DEC59E" }}>
                  <span className="text-4xl leading-none" aria-hidden="true">
                    {jCrop ? jCrop.emoji : "📖"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-2xl font-bold leading-tight">
                      {jCrop ? `${jCrop.name} journal` : "All notes"}
                    </h2>
                    <p className="text-sm">
                      {jCrop
                        ? `Your observations about ${jCrop.name}, across all your fields.`
                        : "Every note from every crop. Pick a crop above to open its own journal."}
                    </p>
                  </div>
                  <button onClick={startNote} className="fm-btn fm-btn--primary shrink-0 flex items-center gap-2">
                    <Plus size={16} aria-hidden="true" /> New note
                  </button>
                </div>
                {selectBar}
                {allNotes.length === 0 && (
                  <p>
                    {q
                      ? "No notes match your search."
                      : jCrop
                        ? `No notes for ${jCrop.name} yet. Tap New note when you see something worth remembering.`
                        : "No notes yet. Tap New note to write one, or open a crop and use its Journal tab."}
                  </p>
                )}
                {allNotes.map((n) => (
                  <NoteCard
                    key={n.id}
                    note={n}
                    label={`${n.crops.map((c) => `${c.emoji} ${c.name}`).join(", ")} · ${n.slotName}`}
                    tag={n.plantLabel || null}
                    pick={pickProps(n.id)}
                    onEdit={() => setEditing({ kind: "note", slotId: n.slotId, id: n.id })}
                    onDelete={() => setDelNote({ slotId: n.slotId, id: n.id })}
                  />
                ))}
              </>
            )}
          </section>

          {tab === "fields" && wide && (
            <aside className="fm-page fm-page--right" aria-live="polite">
              <div className="fm-page__sticky">
                {detail || (
                  <div className="fm-page__empty">
                    <img src={libraryEmpty} alt="" className="fm-page__empty-img" />
                    <p className="font-display text-xl font-bold">Nothing selected yet</p>
                    <p>Pick a crop or a plant on the left to see how it's growing and your notes.</p>
                  </div>
                )}
              </div>
            </aside>
          )}
          </div>
        </div>
      </div>

      <ChatHead context={{ page: "library", field: selSlot?.name, crop: selInfo?.crop.key, plant: selPlant ? spotOf(selSlot, selPlant.id) : undefined }} />

      {tab === "fields" && !wide && detail && (
        <Modal title={selPlant ? `${selInfo.crop.name} · ${spotOf(selSlot, selPlant.id)}` : selInfo.crop.name} onClose={() => setSelected(null)} wide>
          {detail}
        </Modal>
      )}
      {showFilter && (
        <FilterModal
          value={filter}
          slots={slots}
          onApply={(f) => {
            setFilter(f);
            setShowFilter(false);
          }}
          onClose={() => setShowFilter(false)}
        />
      )}
      {editNote && (
        <EditNoteModal
          key={editNote.id}
          slot={editSlot}
          note={editNote}
          onSave={(patch) => setPending({ kind: "note", slotId: editSlot.id, id: editNote.id, patch })}
          onClose={() => setEditing(null)}
        />
      )}
      {editHarvest && editHarvest.crop && (
        <EditHarvestModal
          key={editHarvest.id}
          harvest={editHarvest}
          onSave={(patch) => setPending({ kind: "harvest", slotId: editSlot.id, id: editHarvest.id, patch })}
          onClose={() => setEditing(null)}
        />
      )}
      {pending && (
        <ConfirmModal
          title="Save changes?"
          message={
            pending.kind === "note"
              ? "Your note will be updated in the journal."
              : "This harvest log will be updated. The plants in your fields are not changed."
          }
          confirmLabel="Save changes"
          onConfirm={applyEdit}
          onClose={() => setPending(null)}
        />
      )}
      {bulkDel && pickedNow.length > 0 && (
        <ConfirmModal
          title={`Delete ${pickedNow.length} ${tab === "harvest" ? "harvest log" : "note"}${pickedNow.length === 1 ? "" : "s"}?`}
          message={
            tab === "harvest"
              ? "They will be removed from your harvest history. The plants in your fields are not touched. This can't be undone."
              : "They will be removed from your journal, for every crop they were written for. This can't be undone."
          }
          confirmLabel="Delete"
          danger
          onConfirm={deletePicked}
          onClose={() => setBulkDel(false)}
        />
      )}
      {showNote && <NoteModal slots={slots} start={showNote} onSave={addNote} onClose={() => setShowNote(null)} />}
      {delPlants && delList.length > 0 && (
        <ConfirmModal
          title={delList.length === 1 ? "Remove this plant?" : "Remove these plants?"}
          message={`${
            delList.length === 1
              ? `${delName} at row ${delList[0].row + 1}, column ${delList[0].col + 1}`
              : delSameCrop
                ? `All ${delList.length} ${delName}`
                : `${delList.length} plants`
          } will be removed from ${delSlot.name}. Your notes and harvest history stay.`}
          confirmLabel={delList.length === 1 ? "Remove plant" : "Remove plants"}
          danger
          onConfirm={removePlants}
          onClose={() => setDelPlants(null)}
        />
      )}
      {delNote && (
        <ConfirmModal
          title="Delete this note?"
          message="It will be removed from your journal, for every crop it was written for. This can't be undone."
          confirmLabel="Delete note"
          danger
          onConfirm={removeNote}
          onClose={() => setDelNote(null)}
        />
      )}
    </div>
  );
}