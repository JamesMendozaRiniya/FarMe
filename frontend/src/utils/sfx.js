const KEY_ON = "fm-sfx-on";
const KEY_VOL = "fm-sfx-volume";
const DEFAULT_VOLUME = 0.6;

let ctx = null;
let master = null;
let noiseBuffer = null;

const active = new Set();

const read = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
};

const clamp01 = (n) => Math.min(1, Math.max(0, n));

let enabled = read(KEY_ON, "1") !== "0";

const rawVolume = read(KEY_VOL, "");
const savedVolume = rawVolume.trim() === "" ? NaN : Number(rawVolume);
let volume = Number.isFinite(savedVolume) ? clamp01(savedVolume) : DEFAULT_VOLUME;

function audio() {
  if (!enabled) return null;

  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;

  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  return ctx;
}

function getNoiseBuffer(c) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== c.sampleRate) {
    const length = Math.floor(c.sampleRate * 2);
    noiseBuffer = c.createBuffer(1, length, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function track(source) {
  active.add(source);
  source.onended = () => active.delete(source);
}

function tone(c, {
  type = "sine",
  from,
  to = from,
  start = 0,
  dur = 0.12,
  gain = 0.2,
}) {
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  const envelope = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(from, t);

  if (to !== from) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  }

  envelope.gain.setValueAtTime(0.0001, t);
  envelope.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur / 3));
  envelope.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  osc.connect(envelope).connect(master);
  track(osc);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(c, {
  start = 0,
  dur = 0.2,
  from = 800,
  to = from,
  q = 0.8,
  type = "lowpass",
  gain = 0.2,
}) {
  const t = c.currentTime + start;
  const buffer = getNoiseBuffer(c);

  const source = c.createBufferSource();
  source.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);

  if (to !== from) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  }

  const envelope = c.createGain();
  envelope.gain.setValueAtTime(0.0001, t);
  envelope.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.025, dur / 3));
  envelope.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  source.connect(filter).connect(envelope).connect(master);
  track(source);

  const offset = Math.random() * Math.max(0, buffer.duration - dur - 0.05);
  source.start(t, offset);
  source.stop(t + dur + 0.02);
}

function leafRustle(c, start = 0) {
  noise(c, {
    start,
    dur: 0.13,
    from: 2600,
    to: 900,
    type: "bandpass",
    gain: 0.12,
  });

  noise(c, {
    start: start + 0.08,
    dur: 0.11,
    from: 1800,
    to: 700,
    type: "bandpass",
    gain: 0.09,
  });
}

const play = (fn) => (...args) => {
  try {
    const c = audio();
    if (c) fn(c, ...args);
  } catch (err) {
    if (import.meta.env?.DEV) console.warn("[sfx]", err);
  }
};

export const sfx = {

  plant: play((c) => {
    noise(c, {
      dur: 0.17,
      from: 900,
      to: 260,
      type: "lowpass",
      gain: 0.25,
    });

    tone(c, {
      from: 115,
      to: 65,
      dur: 0.15,
      gain: 0.22,
    });

    noise(c, {
      start: 0.16,
      dur: 0.2,
      from: 1200,
      to: 350,
      type: "lowpass",
      gain: 0.16,
    });
  }),

  water: play((c) => {
    noise(c, {
      dur: 0.62,
      from: 1900,
      to: 650,
      type: "bandpass",
      q: 0.5,
      gain: 0.22,
    });

    noise(c, {
      dur: 0.48,
      from: 850,
      to: 300,
      type: "lowpass",
      gain: 0.12,
    });

    [0.08, 0.21, 0.36, 0.49].forEach((t) => {
      noise(c, {
        start: t,
        dur: 0.055,
        from: 2400,
        to: 1100,
        type: "highpass",
        gain: 0.12,
      });
    });
  }),

  harvest: play((c) => {
    leafRustle(c, 0);

    noise(c, {
      start: 0.12,
      dur: 0.075,
      from: 2100,
      to: 650,
      type: "bandpass",
      gain: 0.17,
    });

    tone(c, {
      type: "triangle",
      from: 230,
      to: 155,
      start: 0.2,
      dur: 0.13,
      gain: 0.12,
    });
  }),

  pickup: play((c) => {
    tone(c, {
      type: "triangle",
      from: 190,
      to: 130,
      dur: 0.08,
      gain: 0.17,
    });

    noise(c, {
      start: 0.025,
      dur: 0.09,
      from: 1100,
      to: 450,
      type: "lowpass",
      gain: 0.12,
    });
  }),

  place: play((c) => {
    tone(c, {
      from: 105,
      to: 65,
      dur: 0.13,
      gain: 0.2,
    });

    noise(c, {
      start: 0.035,
      dur: 0.14,
      from: 950,
      to: 300,
      type: "lowpass",
      gain: 0.16,
    });
  }),

  remove: play((c) => {
    noise(c, {
      dur: 0.2,
      from: 500,
      to: 1100,
      type: "bandpass",
      gain: 0.2,
    });

    noise(c, {
      start: 0.12,
      dur: 0.23,
      from: 800,
      to: 220,
      type: "lowpass",
      gain: 0.2,
    });

    leafRustle(c, 0.17);

    tone(c, {
      from: 100,
      to: 55,
      start: 0.15,
      dur: 0.17,
      gain: 0.13,
    });
  }),

  error: play((c) => {
    tone(c, {
      type: "triangle",
      from: 190,
      to: 145,
      dur: 0.12,
      gain: 0.17,
    });

    tone(c, {
      type: "triangle",
      from: 150,
      to: 110,
      start: 0.15,
      dur: 0.15,
      gain: 0.15,
    });
  }),

  notify: play((c) => {
    tone(c, {
      type: "sine",
      from: 740,
      dur: 0.25,
      gain: 0.13,
    });

    tone(c, {
      type: "sine",
      from: 988,
      start: 0.12,
      dur: 0.35,
      gain: 0.1,
    });
  }),

  whoosh: play((c, level = 0) => {
    const l = Math.min(10, Math.max(0, Number(level) || 0));
    tone(c, {
      type: "triangle",
      from: 260 + l * 40,
      to: 640 + l * 80,
      dur: 0.2,
      gain: 0.5,
    });
  }),

  gust: play((c) => {
    tone(c, { type: "sawtooth", from: 200, to: 700, dur: 1.2, gain: 0.25 });
    tone(c, { type: "sine", from: 500, to: 250, start: 0.5, dur: 1.2, gain: 0.3 });
  }),

  chopper: play((c) => {
    for (let i = 0; i < 24; i++) {
      tone(c, {
        type: "square",
        from: 180,
        to: 110,
        start: i * 0.085,
        dur: 0.06,
        gain: 0.25,
      });
    }
  }),

  oink: play((c) => {
    tone(c, { type: "sawtooth", from: 420, to: 200, dur: 0.15, gain: 0.45 });
    tone(c, { type: "sawtooth", from: 380, to: 180, start: 0.2, dur: 0.17, gain: 0.45 });
  }),

  isEnabled: () => enabled,

  setEnabled(on) {
    enabled = !!on;

    if (!enabled) {
      active.forEach((source) => {
        try {
          source.stop();
        } catch {}
      });
      active.clear();
    }

    try {
      localStorage.setItem(KEY_ON, enabled ? "1" : "0");
    } catch {}
  },

  getVolume: () => volume,

  setVolume(v) {
    volume = clamp01(Number(v) || 0);

    if (master && ctx) {
      master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    }

    try {
      localStorage.setItem(KEY_VOL, String(volume));
    } catch {}
  },
};