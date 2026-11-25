import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import "./BgmPlayer.css";

const VIDEO_ID = "_2rnKRoY1tw";


export default function BgmPlayer({ showButton = true, enabled = true }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const userPausedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("fm-bgm-volume"));
      return Number.isFinite(saved) && saved >= 0 && saved <= 100 && localStorage.getItem("fm-bgm-volume") !== null
        ? saved
        : 40;
    } catch {
      return 40;
    }
  });
  const volumeRef = useRef(volume);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let armed = false;

    
    const onGesture = (e) => {
      const t = e.target;
      if (t instanceof Element && t.closest(".fm-bgm")) return; 
      if (userPausedRef.current) return;
      try {
        playerRef.current?.playVideo?.();
      } catch {
        
      }
    };
    const arm = () => {
      if (armed) return;
      armed = true;
      window.addEventListener("click", onGesture);
      window.addEventListener("keydown", onGesture);
    };
    const disarm = () => {
      armed = false;
      window.removeEventListener("click", onGesture);
      window.removeEventListener("keydown", onGesture);
    };

    const create = () => {
      const host = hostRef.current;
      if (cancelled || !host || !window.YT || !window.YT.Player) return;

      host.innerHTML = "";
      const mount = document.createElement("div");
      host.appendChild(mount);

      try {
        playerRef.current = new window.YT.Player(mount, {
          videoId: VIDEO_ID,
          playerVars: { autoplay: 1, loop: 1, playlist: VIDEO_ID, controls: 0 },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              e.target.setVolume(volumeRef.current);
              setReady(true);
              e.target.playVideo(); 
              arm(); 
            },
            onStateChange: (e) => {
              if (cancelled) return;
              const S = window.YT.PlayerState;
              if (e.data === S.ENDED) e.target.playVideo(); 
              if (e.data === S.PLAYING) {
                setPlaying(true);
                disarm();
              }
              if (e.data === S.PAUSED) setPlaying(false);
            },
          },
        });
      } catch (err) {
        console.error("BgmPlayer: could not start the YouTube player", err);
      }
    };

    if (window.YT && window.YT.Player) {
      create();
    } else {
      window.onYouTubeIframeAPIReady = create;
      if (!document.getElementById("yt-iframe-api")) {
        const tag = document.createElement("script");
        tag.id = "yt-iframe-api";
        tag.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(tag);
      }
    }

    return () => {
      cancelled = true;
      disarm();
      try {
        playerRef.current?.destroy?.();
      } catch {
        
      }
      playerRef.current = null;
      setReady(false);
      setPlaying(false);
    };
  }, [enabled]);

  const changeVolume = (e) => {
    const v = Number(e.target.value);
    setVolume(v);
    volumeRef.current = v;
    try {
      localStorage.setItem("fm-bgm-volume", String(v));
    } catch {
      
    }
    try {
      playerRef.current?.setVolume?.(v);
    } catch {
      
    }
  };

  const toggle = () => {
    const p = playerRef.current;
    if (!p || !ready) return;
    if (playing) {
      userPausedRef.current = true; 
      p.pauseVideo();
    } else {
      userPausedRef.current = false;
      p.playVideo();
    }
  };

  if (!enabled) return null;

  return (
    <>
      <div className="fm-bgm__yt" ref={hostRef} />

      {showButton && (
        <div className="fm-bgm-wrap">
          <button
            type="button"
            className={`fm-bgm${playing ? " fm-bgm--on" : ""}`}
            onClick={toggle}
            disabled={!ready}
            aria-label={playing ? "Pause music" : "Play music"}
            aria-pressed={playing}
            title={playing ? "Pause music" : "Play music"}
          >
            {playing ? (
              <Volume2 size={22} strokeWidth={2.4} />
            ) : (
              <VolumeX size={22} strokeWidth={2.4} />
            )}
          </button>

          {}
          <div className="fm-bgm-vol">
            <div className="fm-bgm-vol__pill">
              <input
                className="fm-bgm-vol__range"
                type="range"
                min="0"
                max="100"
                step="1"
                value={volume}
                onChange={changeVolume}
                aria-label="Music volume"
                style={{ "--v": `${volume}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}