import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Theme, Tool } from "./engine/types";
import { BACKGROUNDS, type Prefs, type ThemeChoice } from "./prefs";
import { Icons } from "./icons";

const TOOLS: { tool: Tool; label: string; key: string; icon: ReactNode }[] = [
  { tool: "select", label: "Select", key: "V", icon: Icons.cursor },
  { tool: "hand", label: "Pan", key: "H", icon: Icons.hand },
  { tool: "rect", label: "Rectangle", key: "R", icon: Icons.rectangle },
  { tool: "ellipse", label: "Ellipse", key: "O", icon: Icons.ellipse },
  { tool: "diamond", label: "Diamond", key: "D", icon: Icons.diamond },
  { tool: "arrow", label: "Arrow", key: "A", icon: Icons.arrow },
  { tool: "line", label: "Line", key: "L", icon: Icons.line },
  { tool: "draw", label: "Pen", key: "P", icon: Icons.draw },
  { tool: "highlight", label: "Highlighter", key: "M", icon: Icons.highlighter },
  { tool: "text", label: "Text", key: "T", icon: Icons.text },
  { tool: "note", label: "Sticky note", key: "N", icon: Icons.note },
  { tool: "frame", label: "Frame", key: "F", icon: Icons.frame },
  { tool: "eraser", label: "Eraser", key: "E", icon: Icons.eraser },
  { tool: "laser", label: "Laser pointer", key: "K", icon: Icons.laser },
];

type ToolsProps = {
  activeTool: Tool;
  toolLock: boolean;
  onToolLock: () => void;
  disabled: boolean;
  formulaSelected: boolean;
  altKey: string;
  onTool: (tool: Tool) => void;
  libraryOpen: boolean;
  onTable: () => void;
  onImage: (file: File) => void;
  onFormula: () => void;
  onLibrary: () => void;
};

/** The one toolbar: every drawing and insert tool. */
export function Tools(p: ToolsProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="tools" role="toolbar" aria-label="Tools">
      <button
        className={`icon ${p.toolLock ? "on" : ""}`}
        title={`${p.toolLock ? "Tool stays picked after drawing" : "Keep the tool picked after drawing"} (Q)`}
        aria-label="Keep tool picked"
        aria-pressed={p.toolLock}
        disabled={p.disabled}
        onClick={p.onToolLock}
      >
        {p.toolLock ? Icons.lock : Icons.unlock}
        <span className="key" aria-hidden="true">Q</span>
      </button>
      <span className="divider" />
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          className={`icon ${p.activeTool === t.tool ? "on" : ""}`}
          title={`${t.label} (${t.key})`}
          aria-label={t.label}
          aria-pressed={p.activeTool === t.tool}
          disabled={p.disabled}
          onClick={() => p.onTool(t.tool)}
        >
          {t.icon}
          <span className="key" aria-hidden="true">{t.key}</span>
        </button>
      ))}
      <span className="divider" />
      <button
        className="icon"
        title={`Table (${p.altKey}T)`}
        aria-label="Insert table"
        disabled={p.disabled}
        onClick={p.onTable}
      >
        {Icons.table}
      </button>
      <button
        className="icon"
        title="Image"
        aria-label="Insert image"
        disabled={p.disabled}
        onClick={() => fileInput.current?.click()}
      >
        {Icons.image}
      </button>
      <button
        className={`icon ${p.formulaSelected ? "on" : ""}`}
        title={`${p.formulaSelected ? "Edit selected formula" : "Formula (LaTeX)"} (${p.altKey}M)`}
        aria-label={p.formulaSelected ? "Edit formula" : "Insert formula"}
        disabled={p.disabled}
        onClick={p.onFormula}
      >
        {Icons.sigma}
      </button>
      <button
        className={`icon ${p.libraryOpen ? "on" : ""}`}
        title="Shape library"
        aria-label="Shape library"
        aria-pressed={p.libraryOpen}
        disabled={p.disabled}
        onClick={p.onLibrary}
      >
        {Icons.library}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) p.onImage(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

type MoreProps = {
  disabled: boolean;
  theme: Theme;
  themeChoice: ThemeChoice;
  onTheme: (choice: ThemeChoice) => void;
  prefs: Prefs;
  onPrefs: (patch: Partial<Prefs>) => void;
  /** This scene's canvas background: a preset key or a hex colour. */
  background: string | undefined;
  onBackground: (choice: string) => void;
  toolLock: boolean;
  onToolLock: () => void;
  onSaveFile: () => void;
  onExportImage: () => void;
  onCopyImage: () => void;
  onHistory: () => void;
  onMermaid: () => void;
  onFind: () => void;
  onCommands: () => void;
  onShortcuts: () => void;
  mod: string;
  onClear: () => void;
};

/** The one overflow menu: file, view, preferences and canvas actions. */
export function MoreMenu(p: MoreProps) {
  const [open, setOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = (icon: ReactNode, label: string, action: () => void, needsScene = true, keys = "") => (
    <button
      role="menuitem"
      disabled={needsScene && p.disabled}
      onClick={() => {
        setOpen(false);
        action();
      }}
    >
      {icon}
      <span>{label}</span>
      {keys && <kbd>{keys}</kbd>}
    </button>
  );

  /** A preference that is on or off. The menu stays open, to set several. */
  const toggle = (label: string, on: boolean, flip: () => void, keys = "") => (
    <button role="menuitemcheckbox" aria-checked={on} className="check-item" onClick={flip}>
      <span className="tick">{on ? "✓" : ""}</span>
      <span>{label}</span>
      {keys && <kbd>{keys}</kbd>}
    </button>
  );

  /** A preference with two named choices. */
  const choice = <T extends string>(label: string, value: T, options: [T, string][], set: (v: T) => void) => (
    <div className="menu-row">
      <span>{label}</span>
      <div className="segmented">
        {options.map(([key, text]) => (
          <button key={key} className={value === key ? "on" : ""} onClick={() => set(key)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="more" ref={root}>
      <button
        className={`icon ${open ? "on" : ""}`}
        title="More"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {Icons.more}
      </button>
      {open && (
        <div className="menu" role="menu">
          {item(Icons.download, "Save to file", p.onSaveFile)}
          {item(Icons.image, "Export image…", p.onExportImage, true, `⇧${p.mod}E`)}
          {item(Icons.clipboard, "Copy as image", p.onCopyImage)}
          {item(Icons.history, "Version history", p.onHistory)}
          <hr />
          {item(Icons.flow, "Mermaid to diagram", p.onMermaid)}
          <hr />
          {item(Icons.search, "Find on canvas", p.onFind, true, `${p.mod}F`)}
          {item(Icons.command, "All commands", p.onCommands, false, `${p.mod}/`)}
          {item(Icons.keyboard, "Keyboard shortcuts", p.onShortcuts, false, "?")}
          <hr />
          <button role="menuitem" aria-expanded={prefsOpen} onClick={() => setPrefsOpen((o) => !o)}>
            {Icons.sliders}
            <span>Preferences</span>
            <span className={`chevron ${prefsOpen ? "open" : ""}`}>{Icons.chevron}</span>
          </button>
          {prefsOpen && (
            <div className="menu-prefs">
              {choice("Select on", p.prefs.selectOn, [["overlap", "Overlap"], ["wrap", "Wrap"]], (selectOn) => p.onPrefs({ selectOn }))}
              {choice("Input", p.prefs.input, [["trackpad", "Trackpad"], ["mouse", "Mouse"]], (input) => p.onPrefs({ input }))}
              {toggle("Tool lock", p.toolLock, p.onToolLock, "Q")}
              {toggle("Snap to objects", p.prefs.snap, () => p.onPrefs({ snap: !p.prefs.snap }))}
              {toggle("Dot grid", p.prefs.grid, () => p.onPrefs({ grid: !p.prefs.grid }))}
              {toggle("Arrow binding", p.prefs.binding, () => p.onPrefs({ binding: !p.prefs.binding }))}
              {toggle("Minimap", p.prefs.minimap, () => p.onPrefs({ minimap: !p.prefs.minimap }))}
              {toggle("Toolbar hints", p.prefs.hints, () => p.onPrefs({ hints: !p.prefs.hints }))}
            </div>
          )}
          {choice(
            "Theme",
            p.themeChoice,
            [["light", "Light"], ["dark", "Dark"], ["system", "Auto"]],
            p.onTheme,
          )}
          {!p.disabled && (
            <div className="menu-block">
              <span>Canvas background</span>
              <div className="swatches">
                {BACKGROUNDS.map((b) => (
                  <button
                    key={b.key}
                    className={`swatch ${(p.background ?? "default") === b.key ? "on" : ""}`}
                    style={{ background: b[p.theme] }}
                    title={b.name}
                    aria-label={`${b.name} background`}
                    onClick={() => p.onBackground(b.key)}
                  />
                ))}
              </div>
            </div>
          )}
          <hr />
          {item(Icons.trash, "Clear canvas", p.onClear)}
        </div>
      )}
    </div>
  );
}
