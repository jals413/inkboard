import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { INK } from "./engine/types";

/** The palette: ink, grey, then the hues in rainbow order. */
const BASES = [
  INK, "#868e96", "#846358", "#e03131", "#e64980", "#be4bdb", "#7048e8", "#4263eb",
  "#1c7ed6", "#1098ad", "#0ca678", "#2f9e44", "#74b816", "#f5b700", "#f08c00",
];

const RECENT_KEY = "recent-colors";
const readRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
};

const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

/** Mix a hex colour towards white (amount > 0) or black (amount < 0). */
const shade = (hex: string, amount: number) => {
  const n = parseInt(hex.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const mix = (c: number) => Math.round(c + (target - c) * Math.abs(amount));
  const out = (mix((n >> 16) & 255) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255);
  return `#${out.toString(16).padStart(6, "0")}`;
};
const SHADES = [0.6, 0.3, 0, -0.25, -0.5];

type Props = {
  /** The swatch the picker opens from. */
  anchor: HTMLElement;
  value: string;
  onPick: (color: string) => void;
  onClose: () => void;
};

/**
 * loosedraw's own colour picker: the palette, five shades of whichever
 * colour is picked, recent colours, and a field for an exact hex value.
 */
export function ColorPicker({ anchor, value, onPick, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: 0, top: 0 });
  const [hex, setHex] = useState(isHex(value) ? value : "");
  const [recent, setRecent] = useState(readRecent);
  // Shades are of the colour picked from the palette, not of each shade in turn.
  const [base, setBase] = useState(isHex(value) ? value : "#1c7ed6");

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const height = root.current?.offsetHeight ?? 300;
    setPlace({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 248)),
      top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - height - 8)),
    });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  const pick = (color: string, asBase = false) => {
    onPick(color);
    if (isHex(color)) {
      setHex(color);
      if (asBase) setBase(color);
      const next = [color, ...recent.filter((c) => c !== color)].slice(0, 7);
      setRecent(next);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    }
  };

  const swatch = (color: string, asBase = false) => (
    <button
      key={color}
      className={`swatch ${color.toLowerCase() === value.toLowerCase() ? "on" : ""}`}
      style={{ background: color === INK ? "var(--text)" : color }}
      title={color === INK ? "Ink" : color}
      aria-label={color === INK ? "Ink" : color}
      onClick={() => pick(color, asBase)}
    />
  );

  return (
    <div
      className="color-picker"
      ref={root}
      style={place}
      role="dialog"
      aria-label="Colours"
      // Typing a hex value must not trigger canvas shortcuts.
      onKeyDown={(e) => e.key !== "Escape" && e.stopPropagation()}
    >
      <h3>Colours</h3>
      <div className="swatches">{BASES.map((c) => swatch(c, true))}</div>
      <h3>Shades</h3>
      <div className="swatches">{SHADES.map((amount) => swatch(amount ? shade(base, amount) : base))}</div>
      {recent.length > 0 && (
        <>
          <h3>Recent</h3>
          <div className="swatches">{recent.map((c) => swatch(c))}</div>
        </>
      )}
      <h3>Hex code</h3>
      <label className="hex">
        <span>#</span>
        <input
          aria-label="Hex colour"
          spellCheck={false}
          maxLength={6}
          placeholder="1c7ed6"
          value={hex.replace("#", "")}
          onChange={(e) => {
            const next = `#${e.target.value.replace(/[^0-9a-f]/gi, "")}`;
            setHex(next);
            if (isHex(next)) pick(next.toLowerCase(), true);
          }}
        />
        <i style={{ background: isHex(hex) ? hex : "transparent" }} />
      </label>
    </div>
  );
}
