// what the dashboard uses:
//   key        short id. saved with every planted square, so please never rename it :D
//   name, en   local name and english name
//   emoji      shown in the palette and on the grid
//   type       "vegetable" or "fruit" (decides which list it shows under)
//   maturity   rough days from planting to harvest (stage colors, harvest date and reminders use it)
//   soils      soils it grows well in (the recommendation rules match against these)
//   seasons    "wet" and / or "dry" (june to november is wet, december to may is dry)
//   temp       [min, max] comfortable temperature in celsius
//   big        optional. true for trees / big plants, so tiny plots get a lower score
// todo(backend): later this can become a crops table with key as the id.

// soil types for the add slot form
export const SOILS = ["Clay", "Loam", "Sandy", "Silty"];

// 5 vegetables + 5 fruits common here sa philippines (the numbers are rough, not exact)
export const CROPS = [
  {
    key: "kamatis",
    name: "Kamatis",
    en: "Tomato",
    emoji: "🍅",
    type: "vegetable",
    maturity: 70,
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
    maturity: 75,
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
    maturity: 270,
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
    maturity: 270,
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
    maturity: 80,
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
    maturity: 1095,
    soils: ["Loam", "Clay", "Sandy"],
    seasons: ["wet", "dry"],
    temp: [24, 35],
    big: true,
  },
];

// finds a crop by its key, or null if there's no such crop
export const cropByKey = (key) => CROPS.find((c) => c.key === key) || null;