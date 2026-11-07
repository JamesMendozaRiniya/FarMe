// the avatar maker on the register page. it only edits the avatar object (see avatar.js):
//   <AvatarStudio avatar={avatar} onChange={setAvatar} onRemove={() => setAvatar(null)} />
// the big preview is the farmer card next to the form, so this part shows small style pictures only.
import { Shuffle, Trash2, Check } from "lucide-react";
import { AVATAR_STYLES, AVATAR_BACKGROUNDS, newSeed, useAvatarUri } from "./avatar";
import "./avatar-studio.css";

// one style, drawn with the current seed and background so you see what you would get
function StyleButton({ style, avatar, onPick }) {
  const uri = useAvatarUri({ ...avatar, style: style.key });
  const on = avatar.style === style.key;
  return (
    <button type="button" onClick={() => onPick(style.key)} aria-pressed={on} className="fm-av-style">
      <span className="fm-av-style__thumb">{uri && <img src={uri} alt="" draggable={false} />}</span>
      {style.label}
    </button>
  );
}

export default function AvatarStudio({ avatar, onChange, onRemove }) {
  const set = (patch) => onChange({ ...avatar, ...patch });

  return (
    <div className="fm-av-studio">
      <div role="group" aria-labelledby="av-style-label">
        <p id="av-style-label" className="font-bold mb-2">
          Style
        </p>
        <div className="fm-av-styles">
          {AVATAR_STYLES.map((s) => (
            <StyleButton key={s.key} style={s} avatar={avatar} onPick={(style) => set({ style })} />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => set({ seed: newSeed() })}
        aria-label="Shuffle: get a new random look"
        className="fm-btn fm-btn--accent self-start flex items-center gap-2"
      >
        <Shuffle size={16} aria-hidden="true" /> Shuffle
      </button>

      <div role="group" aria-labelledby="av-bg-label">
        <p id="av-bg-label" className="font-bold mb-2">
          Background
        </p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_BACKGROUNDS.map((b) => {
            const on = (avatar.background || null) === b.value;
            return (
              <button
                key={b.label}
                type="button"
                onClick={() => set({ background: b.value })}
                aria-pressed={on}
                aria-label={b.label}
                title={b.label}
                className={`fm-av-swatch${b.value ? "" : " fm-av-swatch--none"}`}
                style={b.value ? { background: `#${b.value}` } : undefined}
              >
                {on && <Check size={18} strokeWidth={3} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={onRemove} className="fm-btn fm-btn--danger-light !min-h-[38px] flex items-center gap-2">
          <Trash2 size={15} aria-hidden="true" /> Remove avatar
        </button>
      </div>
    </div>
  );
}