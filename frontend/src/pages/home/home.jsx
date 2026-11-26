import { useEffect, useRef, useState } from "react";
import "./home.css";
import { getUser, getSlots, getNotificationStates } from "../../services/farmeApi";
import { countUnread } from "../../utils/notifications";
import { Sidebar, ChatHead } from "../../components/shared";
import { sfx } from "../../utils/sfx";
import barnImg from "../../assets/home/barn.gif";
import mountainImg from "../../assets/home/mountain.gif";
import wheelbarrowImg from "../../assets/home/wheelbarrow.gif"; 
import treeGif from "../../assets/home/tree.gif";
import grassGif from "../../assets/home/grass.gif";
import forkImg from "../../assets/home/fork.png";
import mailboxImg from "../../assets/home/mailbox.png";

const FARM_HREF = "/dashboard";
const LIBRARY_HREF = "/library";
const SETTINGS_HREF = "/settings";
const MAIL_HREF = "/dashboard#notifications";


const LINE = "#5C4334"; 
const WOOD = "#A8774F";
const WOOD_L = "#C9975F"; 
const WOOD_D = "#7B5238";
const SOIL = "#5E3A29";
const LEAF = "#5DAE3B";
const LEAF_L = "#79C94E";
const LEAF_D = "#3F8A2E";
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function Spot({ href, label, hint, children }) {
  return (
    <a href={href} className="fm-home__spot" aria-label={`${label}: ${hint}`}>
      <title>{`${label}: ${hint}`}</title>
      {children}
    </a>
  );
}


function Tag({ x, y, text, sub = null }) {
  const w = text.length * 7.4 + (sub ? (sub.length + 2) * 6.6 + 6 : 0) + 24;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="fm-home__tag">
        <rect x={-w / 2} y={-12} width={w} height={24} rx={12} />
        <text y={4.5} textAnchor="middle">
          {text}
          {sub && (
            <tspan className="fm-home__sub" dx="6">
              {`· ${sub}`}
            </tspan>
          )}
        </text>
      </g>
    </g>
  );
}


const Bush = ({ x, y, s = 1, c = "#4E9A33", l = "#6DB944", d = "#3C7D28" }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx="0" cy="3" rx="26" ry="6" fill="#2F5A1E" opacity="0.22" />
    <g fill={c}>
      <circle cx="-13" cy="-2" r="14" />
      <circle cx="11" cy="-5" r="17" />
      <circle cx="0" cy="-13" r="13" />
    </g>
    <g fill={l}>
      <circle cx="-4" cy="-17" r="8" />
      <circle cx="13" cy="-11" r="9" />
      <circle cx="-16" cy="-6" r="6" />
    </g>
    <g fill="none" stroke={d} strokeWidth="2" strokeLinecap="round">
      <path d="M-8 -9 q3 -5 7 -1 q-4 -1 -3 3" />
      <path d="M8 -1 q4 -5 8 -1 q-5 0 -4 4" />
    </g>
  </g>
);


const Grass = ({ x, y, s = 1 }) => {
  const size = 56 * s;
  return (
    <image
      href={grassGif}
      x={x - size / 2}
      y={y - size * 0.68}
      width={size}
      height={size}
      className="fm-home__img"
      aria-hidden="true"
    />
  );
};


const Daisy = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0 0 V9" stroke={LEAF_D} strokeWidth="1.6" strokeLinecap="round" />
    <path d="M0 8 q-5 -1 -6 -5 q5 0 6 5 M0 8 q5 -1 6 -5 q-5 0 -6 5" fill={LEAF} />
    <g fill="#FFFDF4" stroke="#E4DCC4" strokeWidth="0.5">
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="0" cy="-4.6" rx="2.9" ry="4.2" transform={`rotate(${a})`} />
      ))}
    </g>
    <circle r="2.6" fill="#F2C14E" />
  </g>
);

const Rock = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx="2" cy="5" rx="17" ry="4.5" fill="#2F5A1E" opacity="0.2" />
    <path d="M-15 4 Q-15 -8 -3 -9 Q10 -10 15 0 Q16 5 12 6 H-12 Q-15 6 -15 4 Z" fill="#A9A592" />
    <path d="M-15 4 Q-15 -8 -3 -9 Q4 -9.500 8 -6 Q-2 -6 -7 0 Q-10 4 -12 6 Q-15 6 -15 4 Z" fill="#C4C0AC" />
    <path d="M12 6 Q16 5 15 0 Q13 -2 10 1 Q9 4 6 6 Z" fill="#8F8B79" />
  </g>
);

function Post({ x, y, h = 24, w = 9 }) {
  return (
    <g>
      <rect x={x - w / 2} y={y - h} width={w} height={h} rx="3" fill={WOOD} stroke={LINE} strokeWidth="1.6" />
      <rect x={x - w / 2 + 1.5} y={y - h + 2} width={Math.max(2, w * 0.28)} height={h - 5} rx="1.5" fill={WOOD_L} opacity="0.75" />
    </g>
  );
}

function Bed({ c, rows, cols, s, delay }) {
  const [tl, tr, br, bl] = c;
  const pts = [];
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const t = (r + 0.55) / rows;
      pts.push(lerp(lerp(tl, bl, t), lerp(tr, br, t), (k + 0.5) / cols));
    }
  const poly = (p) => p.map((q) => q.join(",")).join(" ");
  return (
    <g>
      <polygon points={poly([tl, tr, br, bl])} fill={SOIL} stroke="#4A2F21" strokeWidth="2" strokeLinejoin="round" />
      {}
      <polygon points={poly([tl, tr, lerp(tr, br, 0.28), lerp(tl, bl, 0.28)])} fill="#7A4C3A" opacity="0.55" />
      {pts.map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <ellipse cx="0" cy="1" rx={9 * s} ry={3.2 * s} fill="#8A5A44" />
          <g transform={`scale(${s})`}>
            <use href="#fm-home-sprout" className="fm-home__plant" style={{ animationDelay: `${((i + delay) % 7) * 0.22}s` }} />
          </g>
        </g>
      ))}
      {}
      <polygon points={poly([bl, br, [br[0], br[1] + 13], [bl[0], bl[1] + 13]])} fill={WOOD} stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
      <polygon points={poly([tl, bl, [bl[0] + 7, bl[1] + 13], [tl[0] + 7, tl[1] + 3]])} fill={WOOD_D} stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
      <polygon points={poly([tr, br, [br[0] - 7, br[1] + 13], [tr[0] - 7, tr[1] + 3]])} fill={WOOD_D} stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
      <path d={`M${bl[0] + 2} ${bl[1] + 2.500} L${br[0] - 2} ${br[1] + 2.500}`} stroke={WOOD_L} strokeWidth="2" strokeLinecap="round" opacity="0.85" />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const [x, y] = lerp(bl, br, t);
        return <Post key={t} x={x} y={y + 13} h={26} w={10} />;
      })}
    </g>
  );
}


const WIND_LINES = [
  "Nice day for farming!",
  "Wheee! Spin me faster!",
  "Don't forget to water!",
  "The wind is perfect today.",
  "Plant something new!",
  "Free breeze, no charge.",
  "Is that a sprout I see?",
  "Hold on to your hat!",
  "Harvest time is coming!",
  "Round and round we go!",
];
const WIND_DIZZY = ["I'm getting dizzy...", "WHEEEEEE!", "Too... fast...", "Faster! Faster!"];
const GUST_LEAVES = [
  { x: -20, y: -90, d: 0, dy: -60 },
  { x: 10, y: -60, d: 0.15, dy: 40 },
  { x: -34, y: -40, d: 0.3, dy: -30 },
  { x: 24, y: -110, d: 0.45, dy: 70 },
  { x: -10, y: -20, d: 0.6, dy: -70 },
  { x: 36, y: -75, d: 0.75, dy: 20 },
  { x: -26, y: -120, d: 0.9, dy: 55 },
  { x: 4, y: -45, d: 1.05, dy: -45 },
  { x: -40, y: -70, d: 1.2, dy: 30 },
];
const GUST_STREAKS = [
  { x: -30, y: -100, len: 70, d: 0 },
  { x: 0, y: -70, len: 90, d: 0.2 },
  { x: -20, y: -40, len: 60, d: 0.4 },
  { x: 10, y: -125, len: 80, d: 0.6 },
];
const MAX_SPIN = 10;
const BASE_SPIN = 9;

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function FlyingPig() {
  return (
    <g>
      <g className="fm-home__wing">
        <ellipse cx="4" cy="-14" rx="11" ry="5" fill="#FBF6EA" stroke={LINE} strokeWidth="1.3" />
      </g>
      <ellipse cx="0" cy="0" rx="16" ry="11" fill="#F6B2B8" stroke={LINE} strokeWidth="1.5" />
      <rect x="-9" y="8" width="4" height="7" rx="2" fill="#F08A97" stroke={LINE} strokeWidth="1" />
      <rect x="6" y="8" width="4" height="7" rx="2" fill="#F08A97" stroke={LINE} strokeWidth="1" />
      <path d="M15 -3 q7 -4 4 -9 q-4 -3 -6 2" fill="none" stroke="#F08A97" strokeWidth="2" strokeLinecap="round" />
      <circle cx="-17" cy="-2" r="9" fill="#F6B2B8" stroke={LINE} strokeWidth="1.5" />
      <path d="M-19 -9.5 l-3 -6 l8 3 z" fill="#F08A97" stroke={LINE} strokeWidth="1" strokeLinejoin="round" />
      <ellipse cx="-25" cy="0" rx="4" ry="3.4" fill="#F08A97" stroke={LINE} strokeWidth="1.2" />
      <circle cx="-26" cy="-0.5" r="0.8" fill="#7B3F4A" />
      <circle cx="-24" cy="0.8" r="0.8" fill="#7B3F4A" />
      <circle cx="-19.5" cy="-4.5" r="1.5" fill={LINE} />
      <g className="fm-home__wing fm-home__wing--b">
        <ellipse cx="6" cy="-12" rx="10" ry="4.5" fill="#FFFFFF" stroke={LINE} strokeWidth="1.3" />
      </g>
    </g>
  );
}

function Windmill({ x, y, sc = 1, crops = 0 }) {
  const bladesRef = useRef(null);
  const st = useRef({
    angle: 0,
    vel: BASE_SPIN,
    level: 0,
    lastClick: 0,
    lastDecay: 0,
    clicks: [],
    hold: false,
    heli: false,
    pig: false,
    lastLine: "",
  });
  const timers = useRef([]);
  const sayTimer = useRef(null);
  const [bubble, setBubble] = useState(null);
  const [heli, setHeli] = useState(0);
  const [gust, setGust] = useState(0);
  const [pig, setPig] = useState(0);
  const reach = -(x / sc) - 110;

  useEffect(() => {
    const timerList = timers.current;
    return () => {
      timerList.forEach(clearTimeout);
      clearTimeout(sayTimer.current);
    };
  }, []);

  useEffect(() => {
    if (reducedMotion()) return;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = st.current;
      if (!s.hold && s.level > 0 && now - s.lastClick > 1200 && now - s.lastDecay > 600) {
        s.level -= 1;
        s.lastDecay = now;
      }
      const target = BASE_SPIN + s.level * 160;
      s.vel += (target - s.vel) * Math.min(1, dt * 2.5);
      s.angle = (s.angle + s.vel * dt) % 360;
      bladesRef.current?.setAttribute("transform", `rotate(${s.angle.toFixed(2)})`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const later = (fn, ms) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const say = (text, ms = 2600) => {
    clearTimeout(sayTimer.current);
    setBubble({ id: Date.now() + Math.random(), text });
    sayTimer.current = setTimeout(() => setBubble(null), ms);
  };
  const pickLine = (level) => {
    const pool =
      level >= 7
        ? WIND_DIZZY
        : [...WIND_LINES, ...(crops > 0 ? [`${crops} crops growing. Nice!`] : [])];
    let line;
    do {
      line = pool[Math.floor(Math.random() * pool.length)];
    } while (pool.length > 1 && line === st.current.lastLine);
    st.current.lastLine = line;
    return line;
  };

  const takeOff = () => {
    const s = st.current;
    s.clicks = [];
    if (reducedMotion()) return say("I'd fly away, but motion is off.", 3000);
    s.heli = true;
    s.hold = true;
    s.level = MAX_SPIN;
    setHeli(Date.now());
    setGust(Date.now());
    sfx.gust();
    sfx.chopper();
    say("Weeeee! Taking off!", 2400);
    later(() => say("Phew... I'm back!", 2200), 5400);
    later(() => setGust(0), 4800);
    later(() => {
      s.heli = false;
      s.hold = false;
      setHeli(0);
    }, 6100);
  };

  const launchPig = () => {
    const s = st.current;
    s.clicks = [];
    if (reducedMotion()) return say("Oink! Turn on motion to see me fly.", 3000);
    s.pig = true;
    setPig(Date.now());
    sfx.oink();
    say("Oink! When pigs fly!", 2800);
    later(() => {
      s.pig = false;
      setPig(0);
    }, 6500);
  };

  const poke = () => {
    const s = st.current;
    if (s.heli) return;
    const now = performance.now();
    s.level = Math.min(MAX_SPIN, s.level + 1);
    s.lastClick = now;
    sfx.whoosh(s.level);
    s.clicks = [...s.clicks, now].filter((t) => now - t < 8000).slice(-12);
    const c = s.clicks;

    if (c.length >= 5) {
      const last = c.slice(-5);
      const iv = last.slice(1).map((t, i) => t - last[i]);
      const slow = (v) => v >= 400 && v <= 2000;

      if (slow(iv[0]) && slow(iv[1]) && iv[2] <= 2000 && iv[3] <= 350) return takeOff();
    }
    if (!s.pig && c.length >= 10 && now - c[c.length - 10] <= 4000) return launchPig();

    say(pickLine(s.level));
  };

  const bw = bubble ? Math.max(110, bubble.text.length * 6.1 + 22) : 0;

  return (
    <g transform={`translate(${x} ${y}) scale(${sc})`}>
      <ellipse cx="2" cy="1" rx="24" ry="4.500" fill="#2F5A1E" opacity="0.2" />
      <g
        className={heli ? "fm-home__lift fm-home__lift--go" : "fm-home__lift"}
        onClick={poke}
        style={{ cursor: "pointer" }}
      >
        <rect x="-50" y="-108" width="100" height="108" fill="transparent" />
        <path d="M-17 0 L-11 -62 H11 L17 0 Z" fill="#EFE4C6" stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M3 -62 H11 L17 0 H3 Z" fill="#D8C9A2" opacity="0.85" />
        <path d="M-15 -62 L0 -80 L15 -62 Z" fill="#8A5A44" stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M-15 -62 L0 -80 L0 -62 Z" fill="#A9715A" />
        <path d="M-5 0 v-14 a5 5 0 0 1 10 0 v14 z" fill={WOOD_D} stroke={LINE} strokeWidth="1.5" />
        <rect x="-4" y="-40" width="8" height="10" rx="4" fill="#9FC3CF" stroke={LINE} strokeWidth="1.4" />
        <g transform="translate(0 -60)">
          <g ref={bladesRef}>
            {[0, 90, 180, 270].map((a) => (
              <g key={a} transform={`rotate(${a})`}>
                <rect x="-3" y="-44" width="6" height="44" fill={WOOD} stroke={LINE} strokeWidth="1.5" />
                <rect x="3" y="-44" width="13" height="30" rx="2" fill="#F8EFD8" stroke={LINE} strokeWidth="1.5" />
                <path d="M6 -42 V-16 M10 -42 V-16" stroke="#D9CBA6" strokeWidth="1.2" />
              </g>
            ))}
          </g>
          <circle r="5" fill={WOOD_D} stroke={LINE} strokeWidth="1.5" />
        </g>
      </g>

      {gust > 0 && (
        <g key={`gust-${gust}`} pointerEvents="none" aria-hidden="true" style={{ "--reach": `${reach}px` }}>
          {GUST_STREAKS.map((g, i) => (
            <path
              key={`s${i}`}
              className="fm-home__streak"
              d={`M${g.x} ${g.y} h${g.len}`}
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
              style={{ "--d": `${g.d}s` }}
            />
          ))}
          {GUST_LEAVES.map((l, i) => (
            <g key={`l${i}`} transform={`translate(${l.x} ${l.y})`}>
              <path
                className="fm-home__leaf"
                d="M-7 0 q7 -9 14 -2 q-5 10 -14 2 z"
                fill={i % 2 ? LEAF : LEAF_L}
                stroke={LEAF_D}
                strokeWidth="0.8"
                style={{ "--d": `${l.d}s`, "--dy": `${l.dy}px` }}
              />
            </g>
          ))}
        </g>
      )}

      {pig > 0 && (
        <g key={`pig-${pig}`} pointerEvents="none" aria-hidden="true" transform="translate(0 -96)">
          <g className="fm-home__pigfly" style={{ "--reach": `${reach}px` }}>
            <g className="fm-home__pigbob">
              <g transform="scale(1.3)">
                <FlyingPig />
              </g>
            </g>
          </g>
        </g>
      )}

      {bubble && (
        <g key={bubble.id} className="fm-home__say" pointerEvents="none" aria-hidden="true">
          <rect x={34 - bw} y="-152" width={bw} height="24" rx="8" fill="#FBF6EA" stroke={LINE} strokeWidth="1.6" />
          <path d="M8 -128.8 L14 -118 L22 -128.8" fill="#FBF6EA" stroke={LINE} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M9.4 -128.4 H20.6" stroke="#FBF6EA" strokeWidth="2.6" />
          <text x={34 - bw / 2} y="-136" textAnchor="middle" fontSize="11" fontWeight="700" fill={LINE}>
            {bubble.text}
          </text>
        </g>
      )}
    </g>
  );
}


const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function Scene({ fields = null, crops = null, unread = null }) {
  const farmSub = fields > 0 ? plural(fields, "field", "fields") : null;
  const libSub = crops > 0 ? `${crops} planted` : null;
  const mailSub = unread > 0 ? `${unread} new` : null;
  return (
    <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid meet" className="fm-home__svg" role="group" aria-label="Your farm. Choose the barn, the fields, the fork or the mailbox.">
      <defs>
        <linearGradient id="fm-home-sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="240">
          <stop offset="0" stopColor="#CFE3D2" />
          <stop offset="1" stopColor="#EEEBD6" />
        </linearGradient>
        <g id="fm-home-sprout">
          <path d="M0 0 V-9" stroke={LEAF_D} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M0 -8 q-9 -2 -12 -11 q10 -1 12 11" fill={LEAF} />
          <path d="M0 -8 q9 -2 12 -11 q-10 -1 -12 11" fill={LEAF_L} />
          <path d="M-1 -10 q-4 -2 -7 -6" fill="none" stroke={LEAF_D} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
        </g>
      </defs>

      {}
      <rect x="-1200" y="-900" width="3200" height="1140" fill="url(#fm-home-sky)" />
      <g className="fm-home__cloud" fill="#FBF6EA" opacity="0.95">
        <path d="M205 62 q0 -17 20 -17 q8 -15 26 -8 q18 -2 20 16 q15 2 13 15 H212 q-9 -2 -7 -6 z" />
        <path d="M212 71 H284 q9 -2 7 -6 q-30 6 -79 6 z" fill="#E6E1CD" opacity="0.7" />
      </g>
      <g className="fm-home__cloud fm-home__cloud--b" fill="#FBF6EA" opacity="0.95">
        <path d="M560 44 q0 -15 18 -15 q7 -14 24 -7 q16 -2 18 14 q13 2 11 13 H566 q-8 -2 -6 -5 z" />
        <path d="M566 52 H631 q8 -2 6 -5 q-30 6 -71 5 z" fill="#E6E1CD" opacity="0.7" />
      </g>
      <path d="M380 150 Q520 98 640 116 T800 130 V200 H380 Z" fill="#B4D38A" />
      <path d="M0 170 Q120 128 230 160 T420 150 V200 H0 Z" fill="#A5C77B" />
      {}
      <image
        href={mountainImg}
        x="250"
        y="-132"
        width="560"
        height="560"
        className="fm-home__img fm-home__far"
        aria-hidden="true"
      />
      <image
        href={mountainImg}
        x="-10"
        y="-51"
        width="420"
        height="420"
        transform="translate(400 0) scale(-1 1)"
        className="fm-home__img fm-home__far"
        aria-hidden="true"
      />
      <Windmill x={672} y={170} crops={crops} />

      <path d="M0 196 Q200 172 400 198 T800 184 V450 H0 Z" fill="#86B24F" />
      <rect x="-1200" y="440" width="3200" height="1000" fill="#86B24F" />
      <ellipse cx="520" cy="360" rx="150" ry="30" fill="#9CC460" opacity="0.7" />
      <ellipse cx="120" cy="330" rx="90" ry="22" fill="#9CC460" opacity="0.6" />
      <ellipse cx="640" cy="230" rx="120" ry="18" fill="#9CC460" opacity="0.45" />

      {}
      <g>
        <path d="M326 196 L790 184 M326 205 L790 193" stroke={LINE} strokeWidth="6" strokeLinecap="round" />
        <path d="M326 196 L790 184 M326 205 L790 193" stroke={WOOD} strokeWidth="4" strokeLinecap="round" />
        <path d="M326 195 L790 183 M326 204 L790 192" stroke={WOOD_L} strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
        {Array.from({ length: 16 }, (_, i) => {
          const x = 330 + i * 29;
          return <Post key={i} x={x} y={208 - (x - 330) * 0.011} h={20} w={7} />;
        })}
      </g>

      {}
      <path d="M158 250 C150 292 262 300 322 340 S404 412 478 456" fill="none" stroke="#C9A06E" strokeWidth="52" strokeLinecap="round" opacity="0.55" />
      <path d="M158 250 C150 292 262 300 322 340 S404 412 478 456" fill="none" stroke="#DEC59E" strokeWidth="42" strokeLinecap="round" />
      <path d="M158 250 C150 292 262 300 322 340 S404 412 478 456" fill="none" stroke="#EBD9B3" strokeWidth="18" strokeLinecap="round" opacity="0.6" />
      <g fill="#C9A87A">
        {[[190, 285, 2.5], [236, 306, 2], [300, 328, 3], [346, 360, 2.500], [396, 392, 2.800], [262, 296, 1.800]].map(([x, y, r]) => (
          <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={r * 1.4} ry={r} />
        ))}
      </g>

      {}
      <image
        href={treeGif}
        x="-90"
        y="-30"
        width="270"
        height="270"
        className="fm-home__img"
        aria-hidden="true"
      />

      <Spot
        href={FARM_HREF}
        label="Farm"
        hint={farmSub ? `${farmSub}. manage your fields and plant crops` : "manage your fields and plant crops"}
      >
        <g transform="translate(86 92)">
          <rect x="-20" y="-8" width="214" height="172" fill="transparent" />
          {}
          <image
            href={barnImg}
            x="-24"
            y="-38"
            width="230"
            height="230"
            className="fm-home__img"
          />
        </g>
        <Tag x={172} y={272} text="Farm" sub={farmSub} />
      </Spot>

      {}
      <image
        href={wheelbarrowImg}
        x="14"
        y="170"
        width="130"
        height="130"
        className="fm-home__img"
        aria-hidden="true"
      />

      <Spot
        href={LIBRARY_HREF}
        label="Library"
        hint={libSub ? `${plural(crops, "crop", "crops")} planted. see everything you have planted` : "see everything you have planted"}
      >
        <polygon points="340,206 702,200 712,262 616,328 316,318" fill="transparent" />
        <Bed c={[[392, 214], [688, 208], [698, 240], [396, 238]]} rows={2} cols={9} s={0.66} delay={2} />
        <Bed c={[[352, 252], [625, 262], [633, 300], [318, 292]]} rows={3} cols={8} s={0.85} delay={0} />
        <Tag x={470} y={344} text="Library" sub={libSub} />
      </Spot>

      <Bush x={300} y={256} s={0.9} />
      <Bush x={40} y={316} s={1.1} />
      <Bush x={228} y={338} s={0.7} />
      <Bush x={742} y={248} s={1.2} c="#5BA83A" l="#7ACB4C" />
      <Bush x={770} y={356} s={1.2} />
      <Bush x={560} y={344} s={0.8} />
      <Rock x={120} y={340} />
      <Rock x={466} y={398} s={0.8} />
      <Rock x={364} y={410} s={0.6} />
      {[[734, 431], [746, 439], [538, 427], [550, 435], [170, 343], [182, 351], [290, 383], [302, 391], [430, 371], [442, 379]].map(([x, y]) => (
        <Daisy key={`${x}-${y}`} x={x} y={y} />
      ))}
      {[[24, 300], [58, 362], [236, 408], [330, 430], [700, 398], [772, 338], [604, 430], [200, 300], [520, 410]].map(([x, y], i) => (
        <Grass key={`${x}-${y}`} x={x} y={y} s={i % 2 ? 0.9 : 1.2} />
      ))}

      <Spot href={SETTINGS_HREF} label="Settings" hint="your profile, email and password">
        <rect x="716" y="170" width="84" height="150" fill="transparent" />
        {}
        <g transform="translate(776 296)" stroke={LINE} strokeWidth="1.8" strokeLinejoin="round">
          <ellipse cx="2" cy="5" rx="24" ry="5" fill="#2F5A1E" opacity="0.2" stroke="none" />
          <g stroke="none" transform="translate(-1 -34)">
            <path d="M2 4 q-6 -6 -3 -14 q6 2 4 14 M2 4 q6 -6 12 -8 q0 7 -10 9 M2 4 q-9 -2 -12 -9 q8 -1 11 8" fill={LEAF} />
            <path d="M2 4 q6 -6 12 -8 q0 7 -10 9" fill={LEAF_L} />
          </g>
          <rect x="-16" y="-34" width="34" height="38" rx="3" fill="#B98A5E" />
          <rect x="-16" y="-34" width="34" height="9" rx="3" fill="#D1A06C" />
          <path d="M-16 -22 H18 M-16 -10 H18" />
        </g>
        {}
        <image
          href={forkImg}
          x="687"
          y="170"
          width="130"
          height="130"
          className="fm-home__img"
          aria-hidden="true"
        />
        <Tag x={746} y={322} text="Settings" />
      </Spot>

      <Spot href={MAIL_HREF} label="Mailbox" hint={mailSub ? `${plural(unread, "new notification", "new notifications")}. open your notifications` : "open your notifications"}>
        <rect x="588" y="262" width="112" height="150" fill="transparent" />
        <ellipse cx="667" cy="402" rx="22" ry="5" fill="#2F5A1E" opacity="0.2" />
        <g className="fm-home__paper">
          <path d="M598 394 l34 -6 l8 18 l-34 6 z" fill="#FBF6EA" stroke={LINE} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M606 396 l20 -3 M608 401 l20 -3" stroke={LEAF_D} strokeWidth="1.600" strokeLinecap="round" />
        </g>
        {}
        <image
          href={mailboxImg}
          x="583"
          y="262"
          width="140"
          height="140"
          className="fm-home__img"
          aria-hidden="true"
        />
        <Tag x={668} y={414} text="Mail" sub={mailSub} />
      </Spot>

      {}
      <g stroke={LINE} strokeWidth="2.400" strokeLinejoin="round">
        <path d="M0 372 L170 396 V412 L0 390 Z" fill={WOOD} />
        <path d="M0 398 L170 424 V440 L0 416 Z" fill="#B58355" />
        <path d="M0 375 L170 399 M0 401 L170 427" stroke={WOOD_L} strokeWidth="2" fill="none" opacity="0.8" />
        {[[14, 438, 70], [96, 450, 74], [176, 458, 70]].map(([x, y, h]) => (
          <g key={x}>
            <rect x={x - 12} y={y - h} width="24" height={h} rx="6" fill="#B58355" />
            <rect x={x - 8} y={y - h + 5} width="6" height={h - 12} rx="3" fill={WOOD_L} opacity="0.7" stroke="none" />
          </g>
        ))}
      </g>
      <Bush x={236} y={444} s={1.2} />
    </svg>
  );
}


function SceneMobile({ fields = null, crops = null, unread = null }) {
  const farmSub = fields > 0 ? plural(fields, "field", "fields") : null;
  const libSub = crops > 0 ? `${crops} planted` : null;
  const mailSub = unread > 0 ? `${unread} new` : null;
  const PATH = "M108 262 C60 300 46 338 108 362 S232 402 252 452 S300 524 346 612";
  return (
    <svg viewBox="0 0 400 600" preserveAspectRatio="xMidYMid meet" className="fm-home__svg fm-home__svg--m" role="group" aria-label="Your farm. Choose the barn, the fields, the fork or the mailbox.">
      <defs>
        <linearGradient id="fm-home-sky-m" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="210">
          <stop offset="0" stopColor="#CFE3D2" />
          <stop offset="1" stopColor="#EEEBD6" />
        </linearGradient>
        <g id="fm-home-sprout">
          <path d="M0 0 V-9" stroke={LEAF_D} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M0 -8 q-9 -2 -12 -11 q10 -1 12 11" fill={LEAF} />
          <path d="M0 -8 q9 -2 12 -11 q-10 -1 -12 11" fill={LEAF_L} />
          <path d="M-1 -10 q-4 -2 -7 -6" fill="none" stroke={LEAF_D} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
        </g>
      </defs>

      {}
      <rect x="-1200" y="-900" width="2800" height="1110" fill="url(#fm-home-sky-m)" />
      <g transform="translate(12 45) scale(0.8)">
        <g className="fm-home__cloud" fill="#FBF6EA" opacity="0.95">
          <path d="M205 62 q0 -17 20 -17 q8 -15 26 -8 q18 -2 20 16 q15 2 13 15 H212 q-9 -2 -7 -6 z" />
          <path d="M212 71 H284 q9 -2 7 -6 q-30 6 -79 6 z" fill="#E6E1CD" opacity="0.7" />
        </g>
      </g>
      <g transform="translate(-441 -22) scale(1.3)">
        <g className="fm-home__cloud fm-home__cloud--b" fill="#FBF6EA" opacity="0.95">
          <path d="M560 44 q0 -15 18 -15 q7 -14 24 -7 q16 -2 18 14 q13 2 11 13 H566 q-8 -2 -6 -5 z" />
          <path d="M566 52 H631 q8 -2 6 -5 q-30 6 -71 5 z" fill="#E6E1CD" opacity="0.7" />
        </g>
      </g>
      <path d="M0 176 Q100 146 200 170 T400 156 V210 H0 Z" fill="#A5C77B" />
      <path d="M180 156 Q300 116 400 134 V210 H180 Z" fill="#B4D38A" />
      {}
      <image href={mountainImg} x="90" y="2" width="330" height="330" className="fm-home__img fm-home__far" aria-hidden="true" />
      <image href={mountainImg} x="0" y="38" width="270" height="270" transform="translate(250 0) scale(-1 1)" className="fm-home__img fm-home__far" aria-hidden="true" />

      <Windmill x={344} y={184} sc={0.95} crops={crops} />

      <path d="M0 198 Q100 182 200 198 T400 188 V600 H0 Z" fill="#86B24F" />
      <rect x="-1200" y="320" width="2800" height="1200" fill="#86B24F" />
      <ellipse cx="270" cy="430" rx="120" ry="22" fill="#9CC460" opacity="0.6" />
      <ellipse cx="80" cy="392" rx="80" ry="18" fill="#9CC460" opacity="0.6" />

      {}
      <g>
        <path d="M204 216 L398 202 M204 227 L398 213" stroke={LINE} strokeWidth="5" strokeLinecap="round" />
        <path d="M204 216 L398 202 M204 227 L398 213" stroke={WOOD} strokeWidth="3.2" strokeLinecap="round" />
        {Array.from({ length: 9 }, (_, i) => {
          const x = 210 + i * 23;
          return <Post key={i} x={x} y={228 - (x - 204) * 0.072} h={18} w={6} />;
        })}
      </g>

      <path d={PATH} fill="none" stroke="#C9A06E" strokeWidth="46" strokeLinecap="round" opacity="0.55" />
      <path d={PATH} fill="none" stroke="#DEC59E" strokeWidth="38" strokeLinecap="round" />
      <path d={PATH} fill="none" stroke="#EBD9B3" strokeWidth="16" strokeLinecap="round" opacity="0.6" />
      <g fill="#C9A87A">
        {[[98, 330, 2.5], [150, 372, 2.2], [236, 418, 3], [262, 470, 2.4], [300, 526, 2.8], [76, 292, 1.8]].map(([x, y, r]) => (
          <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={r * 1.4} ry={r} />
        ))}
      </g>

      <image href={treeGif} x="-70" y="-45" width="260" height="260" className="fm-home__img" aria-hidden="true" />

      <Spot href={FARM_HREF} label="Farm" hint={farmSub ? `${farmSub}. manage your fields and plant crops` : "manage your fields and plant crops"}>
        <rect x="10" y="95" width="196" height="172" fill="transparent" />
        <image href={barnImg} x="6" y="86" width="205" height="205" className="fm-home__img" />
        <Tag x={112} y={286} text="Farm" sub={farmSub} />
      </Spot>

      <image href={wheelbarrowImg} x="-12" y="196" width="112" height="112" className="fm-home__img" aria-hidden="true" />

      <Spot href={LIBRARY_HREF} label="Library" hint={libSub ? `${plural(crops, "crop", "crops")} planted. see everything you have planted` : "see everything you have planted"}>
        <polygon points="140,222 398,214 398,352 148,350" fill="transparent" />
        <Bed c={[[262, 228], [392, 222], [380, 262], [238, 270]]} rows={2} cols={5} s={0.55} delay={2} />
        <Bed c={[[158, 298], [392, 294], [352, 350], [150, 330]]} rows={3} cols={7} s={0.78} delay={0} />
        <Tag x={214} y={380} text="Library" sub={libSub} />
      </Spot>

      <Bush x={26} y={352} s={1.1} />
      <Bush x={388} y={404} s={1.2} c="#5BA83A" l="#7ACB4C" />
      <Bush x={26} y={446} s={0.9} />
      <Bush x={236} y={598} s={1.1} />
      <Rock x={137} y={368} s={0.9} />
      <Rock x={232} y={446} s={0.7} />
      <Rock x={302} y={472} />
      <Rock x={372} y={550} s={0.9} />
      {[[128, 530], [139, 537], [152, 470], [163, 477], [240, 530], [251, 537]].map(([x, y]) => (
        <Daisy key={`${x}-${y}`} x={x} y={y} />
      ))}
      {[[16, 400], [330, 382], [300, 442], [392, 524], [190, 520], [110, 474]].map(([x, y], i) => (
        <Grass key={`${x}-${y}`} x={x} y={y} s={i % 2 ? 0.9 : 1.1} />
      ))}

      <Spot href={SETTINGS_HREF} label="Settings" hint="your profile, email and password">
        <rect x="0" y="366" width="132" height="152" fill="transparent" />
        <g stroke={LINE} strokeWidth="2" strokeLinejoin="round">
          <ellipse cx="52" cy="500" rx="58" ry="7" fill="#2F5A1E" opacity="0.2" stroke="none" />
          <rect x="0" y="430" width="100" height="68" rx="4" fill="#B98A5E" />
          <rect x="0" y="430" width="100" height="16" rx="4" fill="#D1A06C" />
          <path d="M0 462 H100 M0 480 H100" />
        </g>
        {}
        <image href={forkImg} x="20" y="372" width="130" height="130" transform="translate(170 0) scale(-1 1)" className="fm-home__img" aria-hidden="true" />
        <Tag x={64} y={524} text="Settings" />
      </Spot>

      <Spot href={MAIL_HREF} label="Mailbox" hint={mailSub ? `${plural(unread, "new notification", "new notifications")}. open your notifications` : "open your notifications"}>
        <rect x="262" y="366" width="120" height="156" fill="transparent" />
        <ellipse cx="340" cy="490" rx="22" ry="5" fill="#2F5A1E" opacity="0.2" />
        <g transform="translate(-314 85)">
          <g className="fm-home__paper">
            <path d="M598 394 l34 -6 l8 18 l-34 6 z" fill="#FBF6EA" stroke={LINE} strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M606 396 l20 -3 M608 401 l20 -3" stroke={LEAF_D} strokeWidth="1.6" strokeLinecap="round" />
          </g>
        </g>
        <image href={mailboxImg} x="268" y="368" width="120" height="120" className="fm-home__img" aria-hidden="true" />
        <Tag x={322} y={510} text="Mail" sub={mailSub} />
      </Spot>

      <g transform="translate(0 -50) scale(1.6)" stroke={LINE} strokeWidth="2" strokeLinejoin="round">
        <path d="M0 372 L170 396 V412 L0 390 Z" fill={WOOD} />
        <path d="M0 398 L170 424 V440 L0 416 Z" fill="#B58355" />
        <path d="M0 375 L170 399 M0 401 L170 427" stroke={WOOD_L} strokeWidth="1.6" fill="none" opacity="0.8" />
        {[[14, 438, 70], [96, 450, 74], [176, 458, 70]].map(([x, y, h]) => (
          <g key={x}>
            <rect x={x - 12} y={y - h} width="24" height={h} rx="6" fill="#B58355" />
            <rect x={x - 8} y={y - h + 5} width="6" height={h - 12} rx="3" fill={WOOD_L} opacity="0.7" stroke="none" />
          </g>
        ))}
      </g>
    </svg>
  );
}


function useNarrow(query = "(max-width: 1023px), (orientation: portrait) and (max-width: 1100px)") {
  const get = () => typeof window !== "undefined" && window.matchMedia(query).matches;
  const [narrow, setNarrow] = useState(get);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return narrow;
}

export default function Home() {
  const [user, setUser] = useState({ username: "", firstName: "", lastName: "" });
  useEffect(() => {
    getUser()
      .then(setUser)
      .catch(() => {});
  }, []);

 
  const [slots, setSlots] = useState(null);
  const [marks, setMarks] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let live = true;
    getSlots()
      .then((list) => live && setSlots(Array.isArray(list) ? list : []))
      .catch((e) => console.warn("[farme] home slots failed:", e)); 
    getNotificationStates()
      .then((m) => live && setMarks(m))
      .catch((e) => console.warn("[farme] home notifications failed:", e));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const narrow = useNarrow();
  const fields = slots ? slots.length : null;
  const crops = slots ? slots.reduce((n, sl) => n + (sl.plants?.length || 0), 0) : null;
  const unread = slots && marks ? countUnread(slots, marks, now) : null;

  return (
    <div className="min-h-screen bg-[#F1E7D2] text-[#202808] flex flex-col md:flex-row font-body">
      <Sidebar active="home" user={user} />
      <div className="flex-1 min-w-0 p-3 sm:p-5 flex flex-col">
        <section className="fm-card fm-home__scene" aria-label="Your farm">
          <h1 className="fm-home__title font-display">{user.username ? `Hello, ${user.username}` : "Hello"}</h1>
          {narrow ? <SceneMobile fields={fields} crops={crops} unread={unread} /> : <Scene fields={fields} crops={crops} unread={unread} />}
        </section>
      </div>
      <ChatHead context={{ page: "home" }} />
    </div>
  );
}