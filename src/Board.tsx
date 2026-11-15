import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ColorPicker } from "./ColorPicker";
import { Canvas, type EngineApi, type EngineState } from "./engine/Canvas";
import type { AlignMode } from "./engine/geom";
import {
  FILLS,
  INK,
  NONE,
  STROKES,
  headOf,
  isLine,
  type Dash,
  type FillStyle,
  type Font,
  type Head,
  type Shape,
  type Style,
  type TextAlign,
  type Theme,
  type Tool,
} from "./engine/types";
import { Icons, Logo } from "./icons";
import { Minimap } from "./Minimap";
import type { Prefs } from "./prefs";
import {
  VERSION_INTERVAL_MS,
  addVersion,
  loadScene,
  loadVersions,
  saveScene,
} from "./store";

const SAVE_DEBOUNCE_MS = 400;

type Props = {
  sceneId: string;
  theme: Theme;
  apiRef: RefObject<EngineApi | null>;
  onSaved: (sceneId: string) => void;
  onState: (state: EngineState) => void;
  onEditFormula: (shape: Shape) => void;
  /** The canvas colour for this scene. */
  background: string;
  prefs: Prefs;
  onPrefs: (patch: Partial<Prefs>) => void;
  onNotice: (message: string) => void;
  findOpen: boolean;
  onCloseFind: () => void;
};

/**
 * One scene: loads it, shows the canvas with its floating controls, and
 * autosaves every change. Mount with key={sceneId}.
 */
export function Board(props: Props) {
  const { sceneId, theme, apiRef, onSaved, onState, onEditFormula } = props;
  const [initial, setInitial] = useState<Shape[] | null>(null);
  const [state, setState] = useState<EngineState | null>(null);
  const minimap = props.prefs.minimap;
  const pending = useRef<Shape[] | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const lastSnapshotAt = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([loadScene(sceneId), loadVersions(sceneId)]).then(([data, versions]) => {
      if (!alive) return;
      lastSnapshotAt.current = versions.at(-1)?.ts ?? null;
      setInitial(data?.shapes ?? []);
    });
    return () => {
      alive = false;
    };
  }, [sceneId]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const shapes = pending.current;
    if (!shapes) return;
    pending.current = null;
    void saveScene(sceneId, { shapes }).then(() => onSaved(sceneId));
    // Periodic automatic version snapshot.
    const now = Date.now();
    if (
      shapes.length > 0 &&
      (lastSnapshotAt.current === null || now - lastSnapshotAt.current > VERSION_INTERVAL_MS)
    ) {
      lastSnapshotAt.current = now;
      void addVersion(sceneId, shapes);
    }
  }, [sceneId, onSaved]);

  // Flush on unmount (tab switch) and when the page is hidden or closed.
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, [flush]);

  const onChange = useCallback(
    (shapes: Shape[]) => {
      pending.current = shapes;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  const handleState = useCallback(
    (next: EngineState) => {
      setState(next);
      onState(next);
    },
    [onState],
  );

  if (!initial) return <div className="board" />;

  const api = apiRef.current;
  const empty = state !== null && api !== null && api.getShapes().length === 0;

  return (
    <div className="board">
      <div className="board-canvas">
        <Canvas
          ref={apiRef}
          initialShapes={initial}
          theme={theme}
          onChange={onChange}
          onState={handleState}
          onEditFormula={onEditFormula}
          background={props.background}
          prefs={props.prefs}
          onNotice={props.onNotice}
        />
        {empty && state.tool === "select" && (
          <div className="welcome">
            <Logo size={44} />
            <h1>Loosedraw</h1>
            <p>Pick a tool above, or double-click anywhere to type.</p>
          </div>
        )}
        {state && api && (
          <div className="float zoom-bar">
            <button className="icon" title="Undo (⌘Z)" aria-label="Undo" disabled={!state.canUndo} onClick={api.undo}>
              {Icons.undo}
            </button>
            <button className="icon" title="Redo (⇧⌘Z)" aria-label="Redo" disabled={!state.canRedo} onClick={api.redo}>
              {Icons.redo}
            </button>
            <span className="divider" />
            <button className="icon" title="Zoom out" aria-label="Zoom out" onClick={() => api.zoomBy(1 / 1.2)}>
              {Icons.minus}
            </button>
            <button className="zoom-value" title="Reset zoom" onClick={api.resetZoom}>
              {Math.round(state.zoom * 100)}%
            </button>
            <button className="icon" title="Zoom in" aria-label="Zoom in" onClick={() => api.zoomBy(1.2)}>
              {Icons.plus}
            </button>
            <button
              className="icon"
              title="Zoom to fit everything (⇧1)"
              aria-label="Zoom to fit"
              disabled={empty}
              onClick={() => api.zoomToFit()}
            >
              {Icons.fit}
            </button>
            <button
              className={`icon ${minimap ? "on" : ""}`}
              title={minimap ? "Hide the minimap" : "Show the minimap"}
              aria-label="Minimap"
              aria-pressed={minimap}
              onClick={() => props.onPrefs({ minimap: !minimap })}
            >
              {Icons.map}
            </button>
          </div>
        )}
        {api && minimap && !empty && <Minimap api={api} theme={theme} background={props.background} />}
        {api && props.findOpen && <FindBar api={api} onClose={props.onCloseFind} />}
        {state && api && <StylePanel state={state} api={api} />}
      </div>
    </div>
  );
}

/** What a shape says, for searching. */
const textOf = (s: Shape) =>
  [s.text, s.latex ?? "", ...(s.cells?.flat() ?? [])].join(" ").toLowerCase();

/** Find text on the canvas and step through the shapes that hold it. */
function FindBar({ api, onClose }: { api: EngineApi; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const q = query.trim().toLowerCase();
  const matches = q ? api.getShapes().filter((s) => textOf(s).includes(q)) : [];

  const go = (to: number) => {
    if (!matches.length) return;
    const next = (to + matches.length) % matches.length;
    setIndex(next);
    api.focusShape(matches[next].id);
  };

  return (
    <div className="float find-bar" role="search">
      {Icons.search}
      <input
        autoFocus
        placeholder="Find on canvas"
        aria-label="Find on canvas"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") go(index + (e.shiftKey ? -1 : 1));
          else if (e.key === "Escape") onClose();
        }}
      />
      <span className="count">
        {q ? (matches.length ? `${Math.max(index, 0) + (index < 0 ? 0 : 1)} of ${matches.length}` : "No results") : ""}
      </span>
      <button className="icon" title="Previous (⇧Enter)" aria-label="Previous" disabled={!matches.length} onClick={() => go(index - 1)}>
        <span className="turn-up">{Icons.chevron}</span>
      </button>
      <button className="icon" title="Next (Enter)" aria-label="Next" disabled={!matches.length} onClick={() => go(index + 1)}>
        <span className="turn-down">{Icons.chevron}</span>
      </button>
      <button className="icon" title="Close" aria-label="Close find" onClick={onClose}>
        {Icons.x}
      </button>
    </div>
  );
}

const STYLED_TOOLS: Tool[] = ["rect", "ellipse", "diamond", "note", "arrow", "line", "draw", "highlight", "text"];
const WIDTHS = [
  { label: "Thin", value: 2 },
  { label: "Medium", value: 3.5 },
  { label: "Thick", value: 6 },
];
const DASHES: { label: string; value: Dash; sample: string }[] = [
  { label: "Solid", value: "solid", sample: "──" },
  { label: "Dashed", value: "dashed", sample: "╌╌" },
  { label: "Dotted", value: "dotted", sample: "···" },
];
const FILL_STYLES: { label: string; value: FillStyle }[] = [
  { label: "Tint", value: "tint" },
  { label: "Hatch", value: "hachure" },
  { label: "Solid", value: "solid" },
];
const HEADS: { label: string; value: Head }[] = [
  { label: "None", value: "none" },
  { label: "Arrow", value: "arrow" },
  { label: "Triangle", value: "triangle" },
  { label: "Triangle outline", value: "triangleOutline" },
  { label: "Dot", value: "dot" },
  { label: "Circle", value: "circle" },
  { label: "Diamond", value: "diamond" },
  { label: "Diamond outline", value: "diamondOutline" },
  { label: "Bar", value: "bar" },
  { label: "Crow's foot", value: "crowfoot" },
];

/** A small drawing of a line ending in the given head, pointing right. */
function HeadIcon({ kind, flip }: { kind: Head; flip?: boolean }) {
  const filled = kind === "triangle" || kind === "dot" || kind === "diamond";
  const fill = filled ? "currentColor" : "var(--bg)";
  return (
    <svg
      width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d={kind === "none" ? "M2 8h18" : "M2 8h13"} />
      {kind === "arrow" && <path d="M14 3.500 19.500 8 14 12.500M15 8h4.500" />}
      {(kind === "triangle" || kind === "triangleOutline") && <path d="M13.500 3.500 20 8l-6.500 4.500z" fill={fill} />}
      {(kind === "dot" || kind === "circle") && <circle cx="16.500" cy="8" r="3.500" fill={fill} />}
      {(kind === "diamond" || kind === "diamondOutline") && <path d="M12 8l4-3.500L20 8l-4 3.500z" fill={fill} />}
      {kind === "bar" && <path d="M15 8h4M19 3v10" />}
      {kind === "crowfoot" && <path d="M14 8h6M14 8l6-4.500M14 8l6 4.500" />}
    </svg>
  );
}
const ALIGNS: { label: string; value: AlignMode; icon: React.ReactNode }[] = [
  { label: "Align left", value: "left", icon: Icons.alignLeft },
  { label: "Align centres horizontally", value: "centerX", icon: Icons.alignCenterX },
  { label: "Align right", value: "right", icon: Icons.alignRight },
  { label: "Align top", value: "top", icon: Icons.alignTop },
  { label: "Align middles vertically", value: "centerY", icon: Icons.alignCenterY },
  { label: "Align bottom", value: "bottom", icon: Icons.alignBottom },
];
const FONTS: { label: string; value: Font }[] = [
  { label: "Hand", value: "hand" },
  { label: "Plain", value: "sans" },
  { label: "Code", value: "mono" },
];
const TEXT_ALIGNS: { label: string; value: TextAlign; icon: React.ReactNode }[] = [
  { label: "Left", value: "left", icon: Icons.textLeft },
  { label: "Centre", value: "center", icon: Icons.textCenter },
  { label: "Right", value: "right", icon: Icons.textRight },
];
const FONT_SIZES = [
  { label: "S", value: 14 },
  { label: "M", value: 18 },
  { label: "L", value: 26 },
  { label: "XL", value: 38 },
];

const ROUGHS: { label: string; value: 0 | 1 | 2; icon: React.ReactNode }[] = [
  { label: "Neat", value: 0, icon: Icons.roughNeat },
  { label: "Sketched", value: 1, icon: Icons.roughSketch },
  { label: "Scribbled", value: 2, icon: Icons.roughScribble },
];

/**
 * Style for the selection or the active tool. Floats at the left, in the
 * same order every time: colours, stroke, shape, text, lines, opacity,
 * layers, then actions.
 */
function StylePanel({ state, api }: { state: EngineState; api: EngineApi }) {
  const { selected, tool } = state;
  /** Which arrowhead list is open, if any. */
  const [headsFor, setHeadsFor] = useState<"start" | "end" | null>(null);
  /** The colour picker: which colour it sets, and the swatch it opened from. */
  const [picking, setPicking] = useState<{ kind: "stroke" | "fill"; anchor: HTMLElement } | null>(null);
  // Only while there is something to style.
  if (selected.length === 0 && !STYLED_TOOLS.includes(tool)) return null;

  if (selected.some((s) => s.locked)) {
    return (
      <aside className="float style-panel">
        <section>
          <p className="panel-note">Locked. It cannot be moved or changed until it is unlocked.</p>
          <button className="outline wide" onClick={api.toggleLock}>
            {Icons.unlock} Unlock
          </button>
        </section>
      </aside>
    );
  }

  const style: Style = selected.length === 1 ? selected[0] : state.style;
  const types = selected.length ? selected.map((s) => s.type) : [tool];
  const any = (...wanted: string[]) => types.some((t) => wanted.includes(t));
  const only = (...wanted: string[]) => types.every((t) => wanted.includes(t));
  const align: TextAlign = style.align ?? (only("text") ? "left" : "center");
  const showFill = any("rect", "ellipse", "diamond", "note");
  const showWidth = any("rect", "ellipse", "diamond", "arrow", "line", "draw", "table");
  const showSketch = any("rect", "ellipse", "diamond", "arrow", "line", "table");
  // Text settings appear only when there is text to set: a text or table
  // tool or shape, a shape that already has a label, or one being typed in.
  const showFont =
    any("text", "table") ||
    (state.editing && selected.length > 0) ||
    selected.some((s) => s.text.trim() !== "");
  const showStroke = !only("image", "note");
  const lines = selected.filter(isLine);
  const showLines = lines.length > 0 || tool === "arrow" || tool === "line";
  // Line settings shown: the first selected line's, or what the next line will get.
  const sampleLine: Shape | null = lines[0] ?? null;
  const headAt = (end: "start" | "end"): Head =>
    sampleLine
      ? headOf(sampleLine, end)
      : ((end === "start" ? state.lineStyle.startHead : state.lineStyle.endHead) ??
        (tool === "arrow" && end === "end" ? "arrow" : "none"));
  const route = sampleLine ? sampleLine.route : state.lineStyle.route;

  /** A swatch that opens the colour picker for more colours. */
  const custom = (current: string, presets: string[], kind: "stroke" | "fill") => {
    const active = !presets.includes(current);
    return (
      <button
        className={`swatch custom ${active ? "on" : ""}`}
        style={active ? { background: current } : undefined}
        title="More colours"
        aria-label="More colours"
        aria-expanded={picking?.kind === kind}
        onClick={(e) => setPicking(picking?.kind === kind ? null : { kind, anchor: e.currentTarget })}
      />
    );
  };

  const swatch = (color: string, active: boolean, onPick: () => void) => (
    <button
      key={color}
      className={`swatch ${active ? "on" : ""} ${color === NONE ? "none" : ""}`}
      style={color === NONE ? undefined : { background: color === INK ? "var(--text)" : color }}
      title={color === NONE ? "No fill" : color === INK ? "Ink" : color}
      aria-label={color === NONE ? "No fill" : color === INK ? "Ink" : color}
      aria-pressed={active}
      onClick={onPick}
    />
  );

  /** One square button in a row of choices. */
  const tile = (key: string, label: string, content: React.ReactNode, on: boolean, onPick: () => void) => (
    <button key={key} className={on ? "on" : ""} title={label} aria-label={label} aria-pressed={on} onClick={onPick}>
      {content}
    </button>
  );
  const action = (label: string, icon: React.ReactNode, run: () => void, disabled = false) => (
    <button key={label} title={label} aria-label={label} disabled={disabled} onClick={run}>
      {icon}
    </button>
  );

  return (
    <aside className="float style-panel">
      {showStroke && (
        <section>
          <h3>Stroke</h3>
          <div className="swatches">
            {STROKES.map((c) => swatch(c, style.stroke === c, () => api.applyStyle({ stroke: c })))}
            {custom(style.stroke, STROKES, "stroke")}
          </div>
        </section>
      )}
      {showFill && (
        <section>
          <h3>Background</h3>
          <div className="swatches">
            {FILLS.map((c) => swatch(c, style.fill === c, () => api.applyStyle({ fill: c })))}
            {custom(style.fill, FILLS, "fill")}
          </div>
        </section>
      )}
      {showFill && style.fill !== NONE && !only("note") && (
        <section>
          <h3>Fill</h3>
          <div className="tiles wide">
            {FILL_STYLES.map((f) =>
              tile(f.value, `${f.label} fill`, f.label, (style.fillStyle ?? "tint") === f.value, () =>
                api.applyStyle({ fillStyle: f.value }),
              ),
            )}
          </div>
        </section>
      )}
      {showWidth && (
        <section>
          <h3>Stroke width</h3>
          <div className="tiles">
            {WIDTHS.map((w) =>
              tile(
                String(w.value),
                `${w.label} stroke`,
                <span className="stroke-sample" style={{ height: w.value }} />,
                style.strokeWidth === w.value,
                () => api.applyStyle({ strokeWidth: w.value }),
              ),
            )}
          </div>
        </section>
      )}
      {showWidth && (
        <section>
          <h3>Stroke style</h3>
          <div className="tiles">
            {DASHES.map((d) =>
              tile(d.value, `${d.label} line`, d.sample, (style.dash ?? "solid") === d.value, () =>
                api.applyStyle({ dash: d.value }),
              ),
            )}
          </div>
        </section>
      )}
      {showSketch && (
        <section>
          <h3>Sloppiness</h3>
          <div className="tiles">
            {ROUGHS.map((r) =>
              tile(String(r.value), r.label, r.icon, (style.rough ?? 1) === r.value, () => api.applyStyle({ rough: r.value })),
            )}
          </div>
        </section>
      )}
      {any("rect") && (
        <section>
          <h3>Edges</h3>
          <div className="tiles">
            {tile("sharp", "Sharp corners", Icons.edgeSharp, !style.round, () => api.applyStyle({ round: false }))}
            {tile("round", "Round corners", Icons.edgeRound, !!style.round, () => api.applyStyle({ round: true }))}
          </div>
        </section>
      )}
      {showFont && (
        <section>
          <h3>Font size</h3>
          <div className="tiles">
            {FONT_SIZES.map((f) =>
              tile(f.label, `Text size ${f.label}`, f.label, Math.round(style.fontSize) === f.value, () =>
                api.applyStyle({ fontSize: f.value }),
              ),
            )}
          </div>
        </section>
      )}
      {showFont && (
        <section>
          <h3>Font family</h3>
          <div className="tiles wide">
            {FONTS.map((f) => (
              <button
                key={f.value}
                className={`font-${f.value} ${(style.font ?? "hand") === f.value ? "on" : ""}`}
                title={`${f.label} font`}
                aria-pressed={(style.font ?? "hand") === f.value}
                onClick={() => api.applyStyle({ font: f.value })}
              >
                {f.label}
              </button>
            ))}
          </div>
        </section>
      )}
      {/* A line's label always sits centred on the line. */}
      {showFont && !only("arrow", "line") && (
        <section>
          <h3>Text align</h3>
          <div className="tiles">
            {TEXT_ALIGNS.map((a) =>
              tile(a.value, `Align text ${a.label.toLowerCase()}`, a.icon, align === a.value, () =>
                api.applyStyle({ align: a.value }),
              ),
            )}
          </div>
        </section>
      )}
      {showLines && (
        <section>
          <h3>Arrow type</h3>
          <div className="tiles wide">
            {tile("sharp", "Straight between points", "Sharp", route === undefined, () => api.applyLineStyle({ route: undefined }))}
            {tile("curve", "Curves through its points", "Curved", route === "curve", () => api.applyLineStyle({ route: "curve" }))}
            {tile("elbow", "Right angles", "Elbow", route === "elbow", () => api.applyLineStyle({ route: "elbow" }))}
          </div>
        </section>
      )}
      {showLines && (
        <section>
          <h3>Arrowheads</h3>
          <div className="tiles wide">
            {(["start", "end"] as const).map((end) => (
              <button
                key={end}
                className={headsFor === end ? "on" : ""}
                title={`Choose the ${end} arrowhead`}
                aria-expanded={headsFor === end}
                onClick={() => setHeadsFor(headsFor === end ? null : end)}
              >
                {end === "start" ? "Start" : "End"}
                <HeadIcon kind={headAt(end)} flip={end === "start"} />
              </button>
            ))}
          </div>
          {headsFor && (
            <div className="tiles dense">
              {HEADS.map((h) =>
                tile(
                  h.value,
                  `${h.label} at ${headsFor}`,
                  <HeadIcon kind={h.value} flip={headsFor === "start"} />,
                  headAt(headsFor) === h.value,
                  () => api.applyLineStyle(headsFor === "start" ? { startHead: h.value } : { endHead: h.value }),
                ),
              )}
            </div>
          )}
        </section>
      )}
      <section>
        <h3>Opacity</h3>
        <input
          type="range"
          className="slider"
          aria-label="Opacity"
          min={0}
          max={100}
          step={5}
          value={Math.round((style.opacity ?? 1) * 100)}
          onChange={(e) => api.applyStyle({ opacity: Number(e.target.value) / 100 }, true)}
          onPointerUp={api.commitStyle}
          onKeyUp={api.commitStyle}
          onBlur={api.commitStyle}
        />
        <div className="slider-scale">
          <span>0</span>
          <span className="value">{Math.round((style.opacity ?? 1) * 100)}</span>
          <span>100</span>
        </div>
      </section>
      {selected.length > 0 && (
        <section>
          <h3>Layers</h3>
          <div className="tiles">
            {action("Send to back (⇧⌘[)", Icons.layerBack, () => api.reorder("back"))}
            {action("Send backward (⌘[)", Icons.layerDown, () => api.reorder("backward"))}
            {action("Bring forward (⌘])", Icons.layerUp, () => api.reorder("forward"))}
            {action("Bring to front (⇧⌘])", Icons.layerFront, () => api.reorder("front"))}
          </div>
        </section>
      )}
      {selected.length > 1 && (
        <section>
          <h3>Align</h3>
          <div className="tiles dense">
            {ALIGNS.map((a) => action(a.label, a.icon, () => api.align(a.value)))}
          </div>
          {selected.length > 2 && (
            <div className="tiles dense">
              {action("Space evenly across", Icons.distributeX, () => api.distribute("x"))}
              {action("Space evenly down", Icons.distributeY, () => api.distribute("y"))}
            </div>
          )}
        </section>
      )}
      {selected.length === 1 && selected[0].type === "table" && (
        <section>
          <h3>Table</h3>
          <div className="tiles wide">
            <button title="Add row" onClick={() => api.tableOp("addRow")}>+ Row</button>
            <button title="Remove last row" onClick={() => api.tableOp("removeRow")}>− Row</button>
          </div>
          <div className="tiles wide">
            <button title="Add column" onClick={() => api.tableOp("addCol")}>+ Col</button>
            <button title="Remove last column" onClick={() => api.tableOp("removeCol")}>− Col</button>
          </div>
        </section>
      )}
      {selected.length > 0 && (
        <section>
          <h3>Actions</h3>
          <div className="tiles">
            {action("Duplicate (⌘D)", Icons.copy, api.duplicateSelection)}
            {action("Delete", Icons.trash, api.deleteSelection)}
            {action("Lock (⇧⌘L)", Icons.lock, api.toggleLock)}
            {selected.length > 1 && action("Group (⌘G)", Icons.group, api.group)}
            {selected.some((sh) => sh.groupId) && action("Ungroup (⇧⌘G)", Icons.ungroup, api.ungroup)}
          </div>
        </section>
      )}
      {picking && (
        <ColorPicker
          anchor={picking.anchor}
          value={picking.kind === "stroke" ? style.stroke : style.fill}
          onPick={(c) => api.applyStyle(picking.kind === "stroke" ? { stroke: c } : { fill: c })}
          onClose={() => setPicking(null)}
        />
      )}
    </aside>
  );
}
