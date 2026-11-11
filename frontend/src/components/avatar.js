// avatar helpers (DiceBear v10). the avatars are drawn right in the browser:
// nothing is fetched from dicebear.com, and every style is loaded only when somebody opens the avatar maker.
//
//   npm i @dicebear/core @dicebear/styles
//
// an avatar is saved as a tiny object, never as an image:
//   { style: "sprouts", seed: "k3j9d2xa", background: "dec59e" }
//     style       one of AVATAR_STYLES (key)
//     seed        any text. the same seed always gives the same face
//     background  hex color without #, or null for a see-through background
// todo(backend): save this object on the user (a json column is fine) and draw it anywhere with useAvatarUri()
import { useEffect, useState } from "react";
import { Style, Avatar } from "@dicebear/core";

// the styles people can pick from. add one by adding a line here (names: https://www.dicebear.com/styles/).
// every style is its own small file, so only the ones that are on screen get downloaded.
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

// background choices (the FarMe palette). hex without #, null = see-through
export const AVATAR_BACKGROUNDS = [
  { value: null, label: "No background" },
  { value: "dec59e", label: "Brandy" },
  { value: "c4866d", label: "Copper" },
  { value: "a9b88a", label: "Leaf" },
  { value: "fbf6ea", label: "Paper" },
  { value: "6a784d", label: "Dingley" },
];

export const newSeed = () => Math.random().toString(36).slice(2, 10);

// the starting point when somebody opens the avatar maker
export const startAvatar = () => ({ style: AVATAR_STYLES[0].key, seed: newSeed(), background: "dec59e" });

// ---------------------------------------------------------------------------
// caches. these are what stop the avatar from flickering (initials first, picture a moment later).
//   styleCache  key -> Promise<Style>   style definitions are downloaded once and kept
//   styleReady  key -> Style            the same styles, but already resolved, so render can read them right away
//   uriCache    "style|seed|bg" -> data: address of the finished picture
// finished pictures are also saved in localStorage, so a new page (or a reload) shows the avatar on the first paint.
// ---------------------------------------------------------------------------
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
    // if the download fails, forget it so the next try can start again
    p.catch(() => styleCache.delete(key));
    styleCache.set(key, p);
  }
  return styleCache.get(key);
}

// the picture as a data: address, ready for <img src>. null if the avatar is not valid.
export function avatarUri(style, avatar) {
  try {
    const options = { seed: avatar.seed || "farme" };
    if (avatar.background) options.backgroundColor = [avatar.background];
    return new Avatar(style, options).toDataUri();
  } catch {
    return null;
  }
}

// returns the picture right now if we can: memory, then localStorage, then drawn from an already-loaded style.
// returns null only when the style still has to be downloaded.
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
    /* storage blocked */
  }

  const style = styleReady.get(avatar.style);
  if (!style) return null;
  const uri = avatarUri(style, avatar);
  if (uri) {
    uriCache.set(k, uri);
    try {
      localStorage.setItem(LS_PREFIX + k, uri);
    } catch {
      /* storage blocked or full */
    }
  }
  return uri;
}

// call this on logout so the next person on this device never sees the previous avatar
export function clearAvatarCache() {
  uriCache.clear();
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage blocked */
  }
}

// useAvatarUri({ style, seed, background }) -> data address (or null while the style downloads / when there is no avatar)
export function useAvatarUri(avatar) {
  const [, rerender] = useState(0);
  const styleKey = avatar?.style;
  const seed = avatar?.seed;
  const background = avatar?.background || null;

  // worked out during render, so a cached avatar is already there on the very first paint
  const uri = styleKey ? cachedUri({ style: styleKey, seed, background }) : null;

  useEffect(() => {
    if (!styleKey || uri) return undefined;
    let alive = true;
    // once the style is downloaded, render again: cachedUri() can now draw it
    loadStyle(styleKey)
      .then(() => alive && rerender((n) => n + 1))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [styleKey, seed, background, uri]);

  return uri;
}