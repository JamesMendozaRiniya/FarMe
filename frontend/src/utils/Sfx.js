
const KEY_ON = "fm-sfx-on";
const KEY_VOL = "fm-sfx-volume";

let ctx = null;
let master = null;

const read = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
};

let enabled = read(KEY_ON, "1") !== "0";

const savedVolume = Number(read(KEY_VOL, "0.6"));
let volume = Number.isFinite(savedVolume)
  ? Math.min(1, Math.max(0, savedVolume))
  : 0.6;

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
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, to),
      t + dur
    );
  }

  envelope.gain.setValueAtTime(0.0001, t);
  envelope.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  osc.connect(envelope).connect(master);
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
  const length = Math.max(1, Math.floor(c.sampleRate * dur));

  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = c.createBufferSource();
  source.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);

  if (to !== from) {
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(1, to),
      t + dur
    );
  }

  const envelope = c.createGain();
  envelope.gain.setValueAtTime(0.0001, t);
  envelope.gain.exponentialRampToValueAtTime(
    gain,
    t + Math.min(0.025, dur / 3)
  );
  envelope.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  source.connect(filter).connect(envelope).connect(master);
  source.start(t);
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

const play = (fn) => () => {
  try {
    const c = audio();
    if (c) fn(c);
  } catch {}
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

  isEnabled: () => enabled,

  setEnabled(on) {
    enabled = !!on;

    try {
      localStorage.setItem(KEY_ON, enabled ? "1" : "0");
    } catch {}
  },

  getVolume: () => volume,

  setVolume(v) {
    volume = Math.min(1, Math.max(0, Number(v) || 0));

    if (master) {
      master.gain.value = volume;
    }

    try {
      localStorage.setItem(KEY_VOL, String(volume));
    } catch {}
  },
};
