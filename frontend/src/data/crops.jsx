export const SOILS = ["Clay", "Loam", "Sandy", "Silty"];

export const CROPS = [
  {
    key: "kamatis",
    name: "Kamatis",
    en: "Tomato",
    emoji: "🍅",
    type: "vegetable",
    maturity: 70,
    waterEvery: 1,
    soils: ["Loam", "Sandy"],
    seasons: ["dry"],
    temp: [18, 30],
  },
  {
    key: "talong",
    name: "Talong",
    en: "Eggplant",
    emoji: "🍆",
    type: "vegetable",
    maturity: 85,
    waterEvery: 1,
    soils: ["Loam", "Silty", "Clay"],
    seasons: ["wet", "dry"],
    temp: [22, 35],
  },
  {
    key: "ampalaya",
    name: "Ampalaya",
    en: "Bitter gourd",
    emoji: "🥒",
    type: "vegetable",
    spacing: 1,
    maturity: 75,
    waterEvery: 1,
    soils: ["Loam", "Sandy"],
    seasons: ["wet", "dry"],
    temp: [24, 35],
  },
  {
    key: "sitaw",
    name: "Sitaw",
    en: "String beans",
    emoji: "🫛",
    type: "vegetable",
    maturity: 60,
    waterEvery: 1,
    soils: ["Loam", "Sandy", "Silty"],
    seasons: ["wet", "dry"],
    temp: [22, 34],
  },
  {
    key: "kangkong",
    name: "Kangkong",
    en: "Water spinach",
    emoji: "🥬",
    type: "vegetable",
    maturity: 30,
    waterEvery: 1,
    soils: ["Clay", "Silty", "Loam"],
    seasons: ["wet"],
    temp: [25, 35],
  },
  {
    key: "saging",
    name: "Saging",
    en: "Banana",
    emoji: "🍌",
    type: "fruit",
    spacing: 2,
    maturity: 270,
    waterEvery: 3,
    soils: ["Loam", "Silty", "Clay"],
    seasons: ["wet", "dry"],
    temp: [24, 35],
    big: true,
  },
  {
    key: "papaya",
    name: "Papaya",
    en: "Papaya",
    emoji: "🍈",
    type: "fruit",
    spacing: 2,
    maturity: 270,
    waterEvery: 3,
    soils: ["Loam", "Sandy"],
    seasons: ["wet", "dry"],
    temp: [24, 35],
    big: true,
  },
  {
    key: "pinya",
    name: "Pinya",
    en: "Pineapple",
    emoji: "🍍",
    type: "fruit",
    maturity: 450,
    waterEvery: 7,
    soils: ["Sandy", "Loam"],
    seasons: ["wet", "dry"],
    temp: [22, 32],
  },
  {
    key: "pakwan",
    name: "Pakwan",
    en: "Watermelon",
    emoji: "🍉",
    type: "fruit",
    spacing: 1.2,
    maturity: 80,
    waterEvery: 2,
    soils: ["Sandy", "Loam"],
    seasons: ["dry"],
    temp: [24, 34],
  },
  {
    key: "mangga",
    name: "Mangga",
    en: "Mango",
    emoji: "🥭",
    type: "fruit",
    spacing: 5,
    maturity: 1095,
    waterEvery: 7,
    soils: ["Loam", "Clay", "Sandy"],
    seasons: ["wet", "dry"],
    temp: [24, 35],
    big: true,
  },
];


export const cropByKey = (key) => CROPS.find((c) => c.key === key) || null;

export const SOIL_FACTOR = { best: 0.9, ok: 1, poor: 1.25 };

export const soilFit = (crop, soil) => {
  if (!crop || !soil) return "ok";
  const i = crop.soils.indexOf(soil);
  return i === -1 ? "poor" : i === 0 ? "best" : "ok";
};

export const effectiveMaturity = (crop, soil) => Math.round(crop.maturity * SOIL_FACTOR[soilFit(crop, soil)]);

export const cropForSoil = (crop, soil) =>
  crop ? { ...crop, baseMaturity: crop.maturity, maturity: effectiveMaturity(crop, soil), soilFit: soilFit(crop, soil) } : crop;
