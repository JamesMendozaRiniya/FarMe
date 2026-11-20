import { useEffect, useRef, useState } from "react";
import "./sprout.css";
import look0 from "../assets/sprout/look-0.png";
import look45 from "../assets/sprout/look-45.png";
import look90 from "../assets/sprout/look-90.png";
import look180 from "../assets/sprout/look-180.png";
import look330 from "../assets/sprout/look-330.png";
import down0 from "../assets/sprout/down-0.png";
import down45 from "../assets/sprout/down-45.png";
import down90 from "../assets/sprout/down-90.png";
import happy from "../assets/sprout/happy.png";
import typing from "../assets/sprout/typing.png";
import coverPeek from "../assets/sprout/cover-peek.png";
import coverFull from "../assets/sprout/cover-full.png";
import shocked from "../assets/sprout/shocked.png";

const ALL = [look0, look45, look90, look180, look330, down0, down45, down90, happy, typing, coverPeek, coverFull, shocked];
const IDLE_MS = 12000; 

const MOODS = {
  shocked: { src: shocked },
  typing: { src: typing },
  cover: { src: coverFull },
  peek: { src: coverPeek },
  happy: { src: happy },
};

const AROUND = {
  0: { src: look330 }, 
  1: { src: down45, flip: true }, 
  2: { src: down0 }, 
  3: { src: down45 }, 
  4: { src: look90 }, 
  "-4": { src: look90 },
  "-3": { src: look45 }, 
  "-2": { src: look0 }, 
  "-1": { src: look180 }, 
};
const FRONT = { src: look0 };

function pick(dx, dy) {
  if (Math.hypot(dx, dy) < 70) return FRONT; 
  return AROUND[Math.round(Math.atan2(dy, dx) / (Math.PI / 4))] || FRONT;
}

export default function Sprout({ mood = "auto" }) {
  const box = useRef(null);
  const [look, setLook] = useState(MOODS.happy); 
  const [hovered, setHovered] = useState(false);
  const [asleep, setAsleep] = useState(false);

  
  useEffect(() => {
    ALL.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  useEffect(() => {
    const area = box.current?.parentElement;
    let frame = 0;
    let sleepTimer = 0;
    const wake = () => {
      setAsleep(false);
      window.clearTimeout(sleepTimer);
      sleepTimer = window.setTimeout(() => setAsleep(true), IDLE_MS);
    };
    const move = (e) => {
      if (e.pointerType === "touch") return;
      if (frame) return;
      const { clientX, clientY } = e;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = box.current?.getBoundingClientRect();
        if (!r) return;
        const next = pick(clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2));
        setLook((cur) => (cur.src === next.src && !cur.flip === !next.flip ? cur : next));
      });
    };
    const leave = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      setLook(MOODS.happy);
    };
    area?.addEventListener("pointermove", move);
    area?.addEventListener("pointerleave", leave);
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    wake();
    return () => {
      area?.removeEventListener("pointermove", move);
      area?.removeEventListener("pointerleave", leave);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
      window.clearTimeout(sleepTimer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const shown = MOODS[mood] || (hovered ? MOODS.happy : asleep ? { src: down90 } : look);
  const cls = ["fm-sprout", mood === "shocked" && "is-shocked", mood === "auto" && hovered && "is-hovered"].filter(Boolean).join(" ");

  return (
    <div
      ref={box}
      className={cls}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <img className="fm-sprout__img" src={shown.src} alt="" draggable={false} style={shown.flip ? { transform: "scaleX(-1)" } : undefined} />
      <span className="fm-sprout__shadow" aria-hidden="true" />
    </div>
  );
}