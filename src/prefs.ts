// Preferences: how the editor behaves on this device. Stored in the
// browser, not in scenes, so they follow the person rather than the drawing.

import type { Theme } from "./engine/types";

export type Prefs = {
  /** Line shapes up with their neighbours while they are moved. */
  snap: boolean;
  /** Show the dot grid. */
  grid: boolean;
  /** Arrows attach to the shapes they are drawn onto. */
  binding: boolean;
  /** Show the one-line tip under the toolbar. */
  hints: boolean;
  minimap: boolean;
  /** A dragged selection box picks shapes it touches, or only ones it surrounds. */
  selectOn: "overlap" | "wrap";
  /** With a mouse, the wheel zooms; with a trackpad, it scrolls. */
  input: "trackpad" | "mouse";
};

export const DEFAULT_PREFS: Prefs = {
  snap: true,
  grid: true,
  binding: true,
  hints: true,
  minimap: true,
  selectOn: "overlap",
  input: "trackpad",
};

export const loadPrefs = (): Prefs => {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem("prefs") ?? "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
};

export const savePrefs = (prefs: Prefs) => localStorage.setItem("prefs", JSON.stringify(prefs));

export type ThemeChoice = Theme | "system";

/** Canvas backgrounds a scene can pick, each with a light and a dark version. */
export const BACKGROUNDS: { key: string; name: string; light: string; dark: string }[] = [
  { key: "default", name: "Default", light: "#fbfbfc", dark: "#111317" },
  { key: "paper", name: "Paper", light: "#f3f4f6", dark: "#191b20" },
  { key: "sky", name: "Sky", light: "#f1f7ff", dark: "#0f1826" },
  { key: "cream", name: "Cream", light: "#fffbe9", dark: "#1c1a10" },
  { key: "rose", name: "Rose", light: "#fdf4f2", dark: "#201615" },
];

/** The colour to paint for a scene's background choice: a preset key or a hex colour. */
export const backgroundColor = (choice: string | undefined, theme: Theme) => {
  if (choice?.startsWith("#")) return choice;
  const preset = BACKGROUNDS.find((b) => b.key === choice) ?? BACKGROUNDS[0];
  return preset[theme];
};
