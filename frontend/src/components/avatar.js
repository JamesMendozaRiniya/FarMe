import { useEffect, useState } from "react";
import { Style, Avatar } from "@dicebear/core";


export const AVATAR_STYLES = [
  { key: "sprouts", label: "Sprouts", load: () => import("@dicebear/styles/sprouts.json") },
  { key: "thumbs", label: "Thumbs", load: () => import("@dicebear/styles/thumbs.json") },
  { key: "fun-emoji", label: "Fun emoji", load: () => import("@dicebear/styles/fun-emoji.json") },
  { key: "big-smile", label: "Big smile", load: () => import("@dicebear/styles/big-smile.json") },
  { key: "micah", label: "Micah", load: () => import("@dicebear/styles/micah.json") },
  { key: "personas", label: "Personas", load: () => import("@dicebear/styles/personas.json") },
  { key: "miniavs", label: "Miniavs", load: () => import("@dicebear/styles/miniavs.json") },
  { key: "avataaars", label: "Avataaars", load: () => import("@dicebear/styles/avataaars.json") },
  { key: "pixel-art", label: "Pixel art", load: () => import("@dicebear/styles/pixel-art.json") },
  { key: "lorelei", label: "Lorelei", load: () => import("@dicebear/styles/lorelei.json") },
];


export const AVATAR_BACKGROUNDS = [
  { value: null, label: "No background" },
  { value: "dec59e", label: "Brandy" },
  { value: "c4866d", label: "Copper" },
  { value: "a9b88a", label: "Leaf" },
  { value: "fbf6ea", label: "Paper" },
  { value: "6a784d", label: "Dingley" },
];

export const newSeed = () => Math.random().toString(36).slice(2, 10);


export const startAvatar = () => ({ style: AVATAR_STYLES[0].key, seed: newSeed(), background: "dec59e" });

const styleCache = new Map();
const styleReady = new Map();
const uriCache = new Map();

const LS_PREFIX = "fm-avatar:";
const keyOf = (a) => `${a.style}|${a.seed}|${a.background || ""}`;

export function loadStyle(key) {
  if (!styleCache.has(key)) {
    const found = AVATAR_STYLES.find((s) => s.key === key);
    if (!found) return Promise.reject(new Error(`Unknown avatar style: ${key}`));
    const p = found.load().then((mod) => {
      const style = new Style(mod.default);
      styleReady.set(key, style);
      return style;
    });
    
    p.catch(() => styleCache.delete(key));
    styleCache.set(key, p);
  }
  return styleCache.get(key);
}

export function avatarUri(style, avatar) {
  try {
    const options = { seed: avatar.seed || "farme" };
    if (avatar.background) options.backgroundColor = [avatar.background];
    return new Avatar(style, options).toDataUri();
  } catch {
    return null;
  }
}


function cachedUri(avatar) {
  const k = keyOf(avatar);
  if (uriCache.has(k)) return uriCache.get(k);

  try {
    const saved = localStorage.getItem(LS_PREFIX + k);
    if (saved) {
      uriCache.set(k, saved);
      return saved;
    }
  } catch {
   
  }

  const style = styleReady.get(avatar.style);
  if (!style) return null;
  const uri = avatarUri(style, avatar);
  if (uri) {
    uriCache.set(k, uri);
    try {
      localStorage.setItem(LS_PREFIX + k, uri);
    } catch {
     
    }
  }
  return uri;
}


export function clearAvatarCache() {
  uriCache.clear();
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
   
  }
}


export function useAvatarUri(avatar) {
  const [, rerender] = useState(0);
  const styleKey = avatar?.style;
  const seed = avatar?.seed;
  const background = avatar?.background || null;

  const uri = styleKey ? cachedUri({ style: styleKey, seed, background }) : null;

  useEffect(() => {
    if (!styleKey || uri) return undefined;
    let alive = true;
    
    loadStyle(styleKey)
      .then(() => alive && rerender((n) => n + 1))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [styleKey, seed, background, uri]);

  return uri;
}