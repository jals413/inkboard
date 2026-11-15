import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  FRAME_TITLE_HEIGHT,
  alignOffsets,
  applyBindings,
  bounds,
  boxCorners,
  boxesIntersect,
  canRotate,
  cellAt,
  cellBox,
  centerOf,
  distributeOffsets,
  frameChildren,
  handlesOf,
  hitShape,
  elbowIsAcross,
  lineMid,
  lineNodes,
  normalizeBox,
  resizeShape,
  rotateHandleOf,
  scaleShape,
  segmentMids,
  snapBox,
  unionBounds,
  type AlignMode,
  type Box,
  type Cell,
  type Guide,
  type Point,
} from "./geom";
import {
  CANVAS_FONT,
  CELL_PADDING,
  ERASER_FADE_MS,
  LABEL_PADDING,
  LASER_FADE_MS,
  fitLabel,
  lineHoldsLabel,
  lineLabelWidth,
  labelHeight,
  LINE_HEIGHT,
  ROTATE_HANDLE_OFFSET,
  drawScene,
  drawShape,
  fontOf,
  measureText,
  preloadImages,
  resolveColor,
  wrapText,
} from "./render";
import { looksLikeMermaid, mermaidToShapes } from "./mermaid";
import { SvgContext, handFontCss } from "./svg";
import { applyTableOp, layoutTable, parseCells, setCell, type TableOp } from "./table";
import {
  DEFAULT_STYLE,
  INK,
  NONE,
  NOTE_FILL,
  hasLabel,
  isLine,
  uid,
  type Camera,
  type LineStyle,
  type Shape,
  type ShapeType,
  type Style,
  type Theme,
  type Tool,
} from "./types";

export type EngineState = {
  tool: Tool;
  selected: Shape[];
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  style: Style;
  lineStyle: LineStyle;
  /** The drawing tool stays picked after each shape. */
  toolLock: boolean;
  /** Text is being typed into a shape right now. */
  editing: boolean;
};

export type ExportOptions = {
  format: "png" | "svg";
  /** Paint the canvas colour behind the drawing; off leaves it transparent. */
  background: boolean;
  /** PNG only: pixels per canvas unit. */
  scale: number;
  selectionOnly: boolean;
};

export type Direction = "left" | "right" | "up" | "down";

export type ImageInput = { src: string; w: number; h: number; latex?: string; font?: Shape["font"] };

export type EngineApi = {
  setTool: (tool: Tool) => void;
  undo: () => void;
  redo: () => void;
  getShapes: () => Shape[];
  /** Replace the whole board as one undoable step. */
  loadShapes: (shapes: Shape[]) => void;
  /**
   * Restyle the selection and make it the style for new shapes. `live` is
   * for a slider mid-drag: it shows the change without an undo step, and
   * commitStyle() records one when the drag ends.
   */
  applyStyle: (patch: Partial<Style>, live?: boolean) => void;
  commitStyle: () => void;
  selectAll: () => void;
  /** Lock the selection, or unlock it if it is locked. */
  toggleLock: () => void;
  toggleToolLock: () => void;
  /** Fit the whole board, or just the selection, in the view. */
  zoomToFit: (selectionOnly?: boolean) => void;
  /** The part of the board on screen, in board units. */
  getView: () => Box;
  /** Move the view so this board point is at its centre. */
  centerOn: (x: number, y: number) => void;
  /** Scroll the view by this many screen pixels. */
  panBy: (dx: number, dy: number) => void;
  /** Select one shape and bring it into view. */
  focusShape: (id: string) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  reorder: (to: "front" | "back" | "forward" | "backward") => void;
  /** Mirror the selection left-to-right ("x") or top-to-bottom ("y"). */
  flip: (axis: "x" | "y") => void;
  copyStyle: () => void;
  pasteStyle: () => void;
  insertImage: (image: ImageInput) => void;
  updateImage: (id: string, image: ImageInput) => void;
  /** Insert a table sized to its content at the centre of the view. */
  insertTable: (cells: string[][]) => void;
  tableOp: (op: TableOp) => void;
  /**
   * Insert ready-made shapes centred in view: a library item as one group,
   * or a generated diagram left as separate shapes.
   */
  insertShapes: (templates: Shape[], group?: boolean, at?: Point) => void;
  /** Add a connected copy of the selected box on that side of it. */
  quickCreate: (direction: Direction) => void;
  group: () => void;
  ungroup: () => void;
  /** Change the ends or route of selected lines, and of lines drawn next. */
  applyLineStyle: (patch: LineStyle) => void;
  align: (mode: AlignMode) => void;
  distribute: (axis: "x" | "y") => void;
  zoomBy: (factor: number) => void;
  resetZoom: () => void;
  exportImage: (options: ExportOptions) => Promise<Blob | null>;
};

/** The editor preferences the engine acts on. */
export type EnginePrefs = {
  snap: boolean;
  grid: boolean;
  binding: boolean;
  selectOn: "overlap" | "wrap";
  input: "trackpad" | "mouse";
};

type Props = {
  initialShapes: Shape[];
  theme: Theme;
  /** The canvas colour. */
  background: string;
  prefs: EnginePrefs;
  onChange: (shapes: Shape[]) => void;
  onState: (state: EngineState) => void;
  /** Double-click on a formula image. */
  onEditFormula: (shape: Shape) => void;
  /** A short message for the person, such as why something was refused. */
  onNotice?: (message: string) => void;
};

type Drag =
  | { kind: "pan"; sx: number; sy: number; camera: Camera }
  | { kind: "move"; start: Point; originals: Map<string, Shape>; box: Box; moved: boolean }
  | { kind: "resize"; handle: number; original: Shape }
  | { kind: "rotate"; original: Shape }
  /** Dragging one of a line's in-between points; `index` counts those points. */
  | { kind: "node"; original: Shape; index: number }
  /** Sliding an elbow line's jog along the line. */
  | { kind: "elbow"; original: Shape }
  /** Several shapes scaled together about the fixed corner `anchor`. */
  | { kind: "scale"; anchor: Point; corner: Point; originals: Map<string, Shape> }
  /** `locked` is the locked shape the drag began on: a plain click picks it. */
  | { kind: "marquee"; start: Point; box: Box; locked?: string }
  | { kind: "create"; id: string; start: Point }
  | { kind: "draw"; id: string; pts: number[] }
  | { kind: "text"; at: Point }
  | { kind: "erase" }
  | { kind: "laser" };

/** The data-transfer type a library item carries while it is dragged. */
export const LIBRARY_DRAG_TYPE = "application/x-loosedraw-item";

const SHAPE_TOOLS: Partial<Record<Tool, ShapeType>> = {
  rect: "rect",
  ellipse: "ellipse",
  diamond: "diamond",
  note: "note",
  arrow: "arrow",
  line: "line",
  frame: "frame",
};

const KEY_TOOLS: Record<string, Tool> = {
  v: "select", h: "hand", r: "rect", o: "ellipse", d: "diamond", n: "note",
  a: "arrow", l: "line", p: "draw", t: "text", e: "eraser", k: "laser", f: "frame", m: "highlight",
};

/** Number keys pick tools too, in the order people know from Excalidraw. */
const DIGIT_TOOLS: Record<string, Tool> = {
  Digit1: "select", Digit2: "rect", Digit3: "diamond", Digit4: "ellipse", Digit5: "arrow",
  Digit6: "line", Digit7: "draw", Digit8: "text", Digit9: "note", Digit0: "eraser",
};

// Each tool has its own pointer, so the active tool is visible on the canvas.
const svgCursor = (body: string, x: number, y: number, fallback: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${body}</svg>`,
  )}") ${x} ${y}, ${fallback}`;

const CURSORS: Partial<Record<Tool, string>> = {
  select: "default",
  hand: "grab",
  text: "text",
  draw: svgCursor(
    "<path d='M3 21l1.5-5.5L16.5 3.5l4 4L8.5 19.5z' fill='#fff' stroke='#111' stroke-width='1.5' stroke-linejoin='round'/><path d='M3 21l1.5-5.5 4 4z' fill='#111'/>",
    3, 21, "crosshair",
  ),
  highlight: svgCursor(
    "<path d='M4 20l2-6L16 4l4 4L10 18z' fill='#ffe14d' stroke='#111' stroke-width='1.5' stroke-linejoin='round'/><path d='M3 22h8' stroke='#ffe14d' stroke-width='3' stroke-linecap='round'/>",
    4, 20, "crosshair",
  ),
  eraser: svgCursor(
    "<circle cx='12' cy='12' r='8' fill='rgba(255,255,255,0.55)' stroke='#111' stroke-width='1.5'/><circle cx='12' cy='12' r='9.5' fill='none' stroke='#fff' stroke-width='1'/>",
    12, 12, "cell",
  ),
  laser: svgCursor(
    "<circle cx='12' cy='12' r='9' fill='rgba(255,59,59,0.25)'/><circle cx='12' cy='12' r='4.5' fill='#ff3b3b' stroke='#fff' stroke-width='1.5'/>",
    12, 12, "crosshair",
  ),
  note: svgCursor(
    "<path d='M12 3v18M3 12h18' stroke='#fff' stroke-width='3.5'/><path d='M12 3v18M3 12h18' stroke='#111' stroke-width='1.5'/><rect x='15' y='15' width='8' height='8' rx='1.5' fill='#f5b700' stroke='#111' stroke-width='1'/>",
    12, 12, "crosshair",
  ),
};
const cursorFor = (tool: Tool) => CURSORS[tool] ?? "crosshair";

const HIGHLIGHT_WIDTH = 18;
const HIGHLIGHT_COLOR = "#ffd43b";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const HISTORY_LIMIT = 200;

export const Canvas = forwardRef<EngineApi, Props>(function Canvas(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // All engine state lives in one mutable object: pointer moves must not
  // go through React.
  const engine = useRef({
    shapes: props.initialShapes,
    committed: props.initialShapes,
    past: [] as Shape[][],
    future: [] as Shape[][],
    camera: { x: 0, y: 0, z: 1 } as Camera,
    selection: new Set<string>(),
    tool: "select" as Tool,
    style: { ...DEFAULT_STYLE } as Style,
    lineStyle: {} as LineStyle,
    drag: null as Drag | null,
    laser: [] as { x: number; y: number; t: number }[],
    eraser: [] as { x: number; y: number; t: number }[],
    spaceDown: false,
    toolLock: false,
    copiedStyle: null as Partial<Style> | null,
    bindTarget: null as Shape | null,
    guides: [] as Guide[],
    /** Active pointers in screen space: two of them make a pinch. */
    pointers: new Map<number, Point>(),
    pinch: null as { dist: number; mid: Point; camera: Camera } | null,
    width: 0,
    height: 0,
    frame: 0,
    centered: false,
  }).current;

  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRef = useRef<string | null>(null);
  /** When the edited shape is a table: which cell. */
  const cellRef = useRef<Cell | null>(null);
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");
  const [, repaintOverlay] = useReducer((n: number) => n + 1, 0);

  /* ------------------------------ Core helpers ----------------------------- */

  const selectedShapes = () => engine.shapes.filter((s) => engine.selection.has(s.id));

  const emitState = useCallback(() => {
    propsRef.current.onState({
      tool: engine.tool,
      selected: selectedShapes(),
      zoom: engine.camera.z,
      canUndo: engine.past.length > 0,
      canRedo: engine.future.length > 0,
      style: engine.style,
      lineStyle: engine.lineStyle,
      toolLock: engine.toolLock,
      editing: editingRef.current !== null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const render = useCallback(() => {
    if (engine.frame) return;
    engine.frame = requestAnimationFrame(() => {
      engine.frame = 0;
      paint();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Draw now. Most callers want render(), which waits for the next frame. */
  const paint = useCallback(() => {
    {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const now = performance.now();
      engine.laser = engine.laser.filter((p) => now - p.t < LASER_FADE_MS);
      engine.eraser = engine.eraser.filter((p) => now - p.t < ERASER_FADE_MS);
      drawScene(
        ctx,
        engine.width,
        engine.height,
        window.devicePixelRatio || 1,
        engine.camera,
        engine.shapes,
        {
          selected: editingRef.current ? [] : selectedShapes(),
          bindTarget: engine.bindTarget,
          guides: engine.guides,
          marquee: engine.drag?.kind === "marquee" ? engine.drag.box : null,
          quick: (() => {
            const source = engine.drag || editingRef.current ? null : quickSource();
            return source ? quickHandles(source) : [];
          })(),
          laser: engine.laser,
          eraser: engine.eraser,
          now,
        },
        {
          theme: propsRef.current.theme,
          bg: propsRef.current.background,
          grid: propsRef.current.prefs.grid,
          editingId: editingRef.current,
          editingCell: cellRef.current,
          onImageLoad: render,
        },
      );
      if (engine.laser.length || engine.eraser.length) render();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setShapes = (next: Shape[]) => {
    // Arrows attached to shapes follow them on every change.
    engine.shapes = applyBindings(next);
    render();
  };

  /** Record the current shapes as one undo step and report the change. */
  const commit = () => {
    if (engine.shapes === engine.committed) return;
    engine.past.push(engine.committed);
    if (engine.past.length > HISTORY_LIMIT) engine.past.shift();
    engine.future = [];
    engine.committed = engine.shapes;
    propsRef.current.onChange(engine.shapes);
    emitState();
  };

  const select = (ids: Iterable<string>) => {
    const picked = new Set(ids);
    // Picking any member of a group picks the whole group.
    const groups = new Set<string>();
    for (const s of engine.shapes) if (picked.has(s.id) && s.groupId) groups.add(s.groupId);
    if (groups.size) {
      for (const s of engine.shapes) if (s.groupId && groups.has(s.groupId)) picked.add(s.id);
    }
    engine.selection = picked;
    emitState();
    render();
  };

  const setTool = (tool: Tool) => {
    engine.tool = tool;
    if (canvasRef.current) canvasRef.current.style.cursor = cursorFor(tool);
    if (tool !== "select") engine.selection = new Set();
    emitState();
    render();
  };

  const travel = (from: Shape[][], to: Shape[][]) => {
    const target = from.pop();
    if (!target) return;
    to.push(engine.committed);
    engine.committed = target;
    engine.selection = new Set();
    setShapes(target);
    propsRef.current.onChange(target);
    emitState();
  };
  const undo = () => travel(engine.past, engine.future);
  const redo = () => travel(engine.future, engine.past);

  const worldOf = (ev: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) / engine.camera.z + engine.camera.x,
      y: (ev.clientY - rect.top) / engine.camera.z + engine.camera.y,
    };
  };

  const topShapeAt = (p: Point, skipLocked = false) => {
    const tol = 6 / engine.camera.z;
    for (let i = engine.shapes.length - 1; i >= 0; i--) {
      const s = engine.shapes[i];
      if (skipLocked && s.locked) continue;
      if (hitShape(s, p.x, p.y, tol)) return s;
    }
    return null;
  };

  /** Move and zoom the camera so `box` fills the view, clear of the toolbar. */
  const fitBox = (box: Box, maxZoom: number) => {
    const margin = 72;
    const z = Math.min(
      maxZoom,
      Math.max(
        MIN_ZOOM,
        Math.min(
          (engine.width - margin * 2) / Math.max(box.w, 1),
          (engine.height - margin * 2) / Math.max(box.h, 1),
        ),
      ),
    );
    engine.camera = {
      z,
      x: box.x + box.w / 2 - engine.width / z / 2,
      y: box.y + box.h / 2 - engine.height / z / 2,
    };
    emitState();
    repaintOverlay();
    render();
  };

  const zoomAt = (sx: number, sy: number, factor: number) => {
    const { camera } = engine;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.z * factor));
    const wx = sx / camera.z + camera.x;
    const wy = sy / camera.z + camera.y;
    engine.camera = { x: wx - sx / z, y: wy - sy / z, z };
    emitState();
    repaintOverlay();
    render();
  };

  const newShape = (type: ShapeType, p: Point): Shape => {
    const shape: Shape = {
      id: uid(),
      type,
      x: p.x,
      y: p.y,
      w: 0,
      h: 0,
      ...engine.style,
      fill: type === "note" ? (engine.style.fill === NONE ? NOTE_FILL : engine.style.fill) : engine.style.fill,
      text: "",
    };
    if (type === "line" || type === "arrow") return { ...shape, ...engine.lineStyle };
    // A frame is plain structure: it ignores the current fill and pattern.
    if (type === "frame") return { ...shape, fill: NONE, dash: undefined, fillStyle: undefined, text: "Frame" };
    return shape;
  };

  /* ------------------------------ Quick-create ----------------------------- */

  /** The one selected box that a connected shape can grow from, if any. */
  const quickSource = () => {
    if (engine.tool !== "select" || engine.selection.size !== 1) return null;
    const shape = selectedShapes()[0];
    return shape && hasLabel(shape) && !shape.locked ? shape : null;
  };

  /** Where the four "add a connected shape" buttons sit around a box. */
  const quickHandles = (shape: Shape): { dir: Direction; x: number; y: number }[] => {
    const b = bounds(shape);
    const out = 30 / engine.camera.z;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    return [
      { dir: "right", x: b.x + b.w + out, y: cy },
      { dir: "down", x: cx, y: b.y + b.h + out },
      { dir: "left", x: b.x - out, y: cy },
      // Clear of the rotate handle, which also sits above the shape.
      { dir: "up", x: cx, y: b.y - out - ROTATE_HANDLE_OFFSET / engine.camera.z },
    ];
  };

  const quickCreate = (dir: Direction) => {
    const source = quickSource();
    if (!source) return;
    const b = bounds(source);
    const gap = 90;
    const sideways = dir === "left" || dir === "right";
    let x = dir === "right" ? b.x + b.w + gap : dir === "left" ? b.x - gap - source.w : b.x + (b.w - source.w) / 2;
    let y = dir === "down" ? b.y + b.h + gap : dir === "up" ? b.y - gap - source.h : b.y + (b.h - source.h) / 2;
    // If something is already there, step along until there is room: a
    // second branch lands beside the first instead of on top of it.
    const taken = () =>
      engine.shapes.some(
        (s) =>
          !isLine(s) && s.type !== "frame" && s.type !== "draw" &&
          boxesIntersect(bounds(s), { x: x - 12, y: y - 12, w: source.w + 24, h: source.h + 24 }),
      );
    for (let tries = 0; tries < 30 && taken(); tries++) {
      if (sideways) y += source.h + 36;
      else x += source.w + 36;
    }
    const node: Shape = { ...source, id: uid(), x, y, text: "", rotation: undefined, groupId: undefined };
    const from = centerOf(b);
    const arrow: Shape = {
      ...newShape("arrow", from),
      w: x + source.w / 2 - from.x,
      h: y + source.h / 2 - from.y,
      startBind: source.id,
      endBind: node.id,
    };
    setShapes([...engine.shapes, node, arrow]);
    commit();
    select([node.id]);
    // Keep the new shape on screen.
    const { camera, width, height } = engine;
    const margin = 80 / camera.z;
    const left = Math.min(0, x - margin - camera.x);
    const right = Math.max(0, x + source.w + margin - (camera.x + width / camera.z));
    const top = Math.min(0, y - margin - camera.y);
    const bottom = Math.max(0, y + source.h + margin - (camera.y + height / camera.z));
    engine.camera = { ...camera, x: camera.x + (left || right), y: camera.y + (top || bottom) };
    repaintOverlay();
    render();
  };

  /* ------------------------------ Text editing ----------------------------- */

  const startEdit = (shape: Shape, cell: Cell | null = null) => {
    const text = cell ? (shape.cells?.[cell.r]?.[cell.c] ?? "") : shape.text;
    editingRef.current = shape.id;
    cellRef.current = cell;
    draftRef.current = text;
    setDraft(text);
    setEditingId(shape.id);
    select([shape.id]);
    emitState();
  };

  const commitEdit = () => {
    const id = editingRef.current;
    if (!id) return;
    const cell = cellRef.current;
    editingRef.current = null;
    cellRef.current = null;
    setEditingId(null);
    const text = draftRef.current.replace(/\s+$/, "");
    const shape = engine.shapes.find((s) => s.id === id);
    if (!shape) return;
    if (shape.type === "table") {
      if (cell && text !== (shape.cells?.[cell.r]?.[cell.c] ?? "")) {
        setShapes(engine.shapes.map((s) => (s.id === id ? setCell(s, cell.r, cell.c, text) : s)));
      }
    } else if (shape.type === "text") {
      if (!text) {
        setShapes(engine.shapes.filter((s) => s.id !== id));
        engine.selection = new Set();
      } else {
        const size = measureText(text, shape.fontSize, shape.font);
        setShapes(engine.shapes.map((s) => (s.id === id ? { ...s, text, ...size } : s)));
      }
    } else if (text !== shape.text) {
      setShapes(engine.shapes.map((s) => (s.id === id ? fitLabel({ ...s, text }) : s)));
    }
    commit();
    emitState();
    render();
  };

  /* ------------------------------ Pointer input ---------------------------- */

  /** The topmost shape an arrow end can attach to at this point. */
  const bindableAt = (p: Point, exclude?: string) => {
    if (!propsRef.current.prefs.binding) return null;
    const tol = 4 / engine.camera.z;
    for (let i = engine.shapes.length - 1; i >= 0; i--) {
      const s = engine.shapes[i];
      if (isLine(s) || s.type === "draw" || s.id === exclude) continue;
      if (hitShape(s, p.x, p.y, tol)) return s;
    }
    return null;
  };

  const screenOf = (ev: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  };

  /** Two fingers down: describe the pinch from the two tracked pointers. */
  const pinchNow = () => {
    const [a, b] = [...engine.pointers.values()];
    return {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const onPointerDown = (ev: React.PointerEvent) => {
    if (editingRef.current) commitEdit();
    const canvas = canvasRef.current!;
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch {
      // Capture is a convenience; a pointer that cannot be captured still works.
    }
    engine.pointers.set(ev.pointerId, screenOf(ev));

    if (engine.pointers.size === 2) {
      // A second finger turns whatever was happening into a pinch.
      engine.drag = null;
      engine.bindTarget = null;
      engine.guides = [];
      setShapes(engine.committed);
      engine.pinch = { ...pinchNow(), camera: engine.camera };
      return;
    }
    if (engine.pointers.size > 2) return;

    const p = worldOf(ev);
    const { tool } = engine;

    if (ev.button === 1 || tool === "hand" || engine.spaceDown) {
      engine.drag = { kind: "pan", sx: ev.clientX, sy: ev.clientY, camera: engine.camera };
      canvas.style.cursor = "grabbing";
      return;
    }
    if (ev.button !== 0) return;

    if (tool === "select") {
      const picked = selectedShapes();
      if (picked.some((s) => s.locked)) {
        // Nothing to grab on a locked selection.
      } else if (picked.length === 1) {
        const shape = picked[0];
        const reach = 11 / engine.camera.z;
        const near = (h: Point) => Math.hypot(h.x - p.x, h.y - p.y) <= reach;
        const quick = quickSource() ? quickHandles(shape).find(near) : undefined;
        if (quick) {
          quickCreate(quick.dir);
          return;
        }
        if (canRotate(shape) && near(rotateHandleOf(shape, ROTATE_HANDLE_OFFSET / engine.camera.z))) {
          engine.drag = { kind: "rotate", original: shape };
          return;
        }
        const handle = handlesOf(shape).findIndex(near);
        if (handle >= 0) {
          engine.drag = { kind: "resize", handle, original: shape };
          return;
        }
        if (isLine(shape) && shape.route === "elbow" && near(lineMid(shape))) {
          engine.drag = { kind: "elbow", original: shape };
          return;
        }
        if (isLine(shape) && shape.route !== "elbow") {
          // An existing in-between point: drag it.
          const node = lineNodes(shape).slice(1, -1).findIndex(near);
          if (node >= 0) {
            engine.drag = { kind: "node", original: shape, index: node };
            return;
          }
          // The middle of a stretch: pull a new point out of the line there.
          const mids = segmentMids(shape);
          const at = mids.findIndex(near);
          if (at >= 0) {
            const mid = [...(shape.mid ?? [])];
            mid.splice(at * 2, 0, mids[at].x - shape.x, mids[at].y - shape.y);
            // An old-style bowed line becomes a curve through the new point.
            const original: Shape = shape.bend
              ? { ...shape, mid, bend: undefined, route: "curve" }
              : { ...shape, mid };
            replace(shape.id, () => original);
            engine.drag = { kind: "node", original, index: at };
            return;
          }
        }
      } else if (picked.length > 1) {
        // Corner of the box around the whole selection: scale it as one.
        const box = unionBounds(picked)!;
        const pad = 8 / engine.camera.z;
        const outer = boxCorners({ x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 });
        const corner = outer.findIndex((h) => Math.hypot(h.x - p.x, h.y - p.y) <= 11 / engine.camera.z);
        if (corner >= 0) {
          const inner = boxCorners(box);
          engine.drag = {
            kind: "scale",
            anchor: inner[(corner + 2) % 4],
            corner: inner[corner],
            originals: new Map(picked.map((s) => [s.id, s])),
          };
          return;
        }
      }
      const hit = topShapeAt(p);
      if (!hit || hit.locked) {
        // A locked shape behaves like empty canvas under a drag, so a locked
        // background never gets in the way of selecting what is on it.
        if (!ev.shiftKey) select([]);
        engine.drag = {
          kind: "marquee",
          start: p,
          box: { x: p.x, y: p.y, w: 0, h: 0 },
          locked: hit?.id,
        };
        return;
      }
      if (ev.shiftKey) {
        const next = new Set(engine.selection);
        if (next.has(hit.id)) next.delete(hit.id);
        else next.add(hit.id);
        select(next);
      } else if (!engine.selection.has(hit.id)) {
        select([hit.id]);
      }
      const moving = selectedShapes().filter((s) => !s.locked);
      // A frame carries the shapes inside it.
      for (const frame of moving.filter((s) => s.type === "frame")) {
        for (const child of frameChildren(frame, engine.shapes)) {
          if (!moving.includes(child) && !child.locked) moving.push(child);
        }
      }
      const carried = new Set(moving.map((s) => s.id));
      // An arrow dragged away from a shape it is attached to lets go of it.
      const originals = new Map(
        moving.map((s) => [
          s.id,
          isLine(s)
            ? {
                ...s,
                startBind: s.startBind && carried.has(s.startBind) ? s.startBind : undefined,
                endBind: s.endBind && carried.has(s.endBind) ? s.endBind : undefined,
              }
            : s,
        ]),
      );
      engine.drag = {
        kind: "move",
        start: p,
        originals,
        box: unionBounds(moving) ?? { x: p.x, y: p.y, w: 0, h: 0 },
        moved: false,
      };
      return;
    }

    if (tool === "text") {
      // The editor opens on release: opening it now would lose focus to
      // this very click.
      engine.drag = { kind: "text", at: p };
      return;
    }

    if (tool === "draw" || tool === "highlight") {
      const shape: Shape = { ...newShape("draw", p), fill: NONE, points: [0, 0] };
      if (tool === "highlight") {
        // A highlighter is a broad, see-through pen: yellow unless a colour
        // has been picked. It is an ordinary pen stroke afterwards.
        shape.strokeWidth = HIGHLIGHT_WIDTH;
        shape.opacity = 0.38;
        shape.dash = undefined;
        if (shape.stroke === INK) shape.stroke = HIGHLIGHT_COLOR;
      }
      setShapes([...engine.shapes, shape]);
      engine.drag = { kind: "draw", id: shape.id, pts: [p.x, p.y] };
      return;
    }

    if (tool === "eraser") {
      engine.drag = { kind: "erase" };
      eraseAt(p);
      return;
    }

    if (tool === "laser") {
      engine.drag = { kind: "laser" };
      engine.laser.push({ ...p, t: performance.now() });
      render();
      return;
    }

    const type = SHAPE_TOOLS[tool];
    if (type) {
      const shape = newShape(type, p);
      // An arrow that starts on a shape is attached to it.
      if (isLine(shape)) shape.startBind = bindableAt(p)?.id;
      // A frame sits behind what it holds.
      setShapes(type === "frame" ? [shape, ...engine.shapes] : [...engine.shapes, shape]);
      engine.drag = { kind: "create", id: shape.id, start: p };
    }
  };

  const eraseAt = (p: Point) => {
    engine.eraser.push({ ...p, t: performance.now() });
    const hit = topShapeAt(p, true);
    if (hit) setShapes(engine.shapes.filter((s) => s.id !== hit.id));
    else render();
  };

  const replace = (id: string, fn: (s: Shape) => Shape) =>
    setShapes(engine.shapes.map((s) => (s.id === id ? fn(s) : s)));

  const onPointerMove = (ev: React.PointerEvent) => {
    if (engine.pointers.has(ev.pointerId)) engine.pointers.set(ev.pointerId, screenOf(ev));
    if (engine.pinch) {
      if (engine.pointers.size < 2) return;
      // Zoom by the change in finger distance; keep the world point that
      // was between the fingers under them as they move.
      const start = engine.pinch;
      const now = pinchNow();
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, start.camera.z * (now.dist / start.dist)));
      engine.camera = {
        z,
        x: start.mid.x / start.camera.z + start.camera.x - now.mid.x / z,
        y: start.mid.y / start.camera.z + start.camera.y - now.mid.y / z,
      };
      emitState();
      render();
      return;
    }
    const drag = engine.drag;
    if (!drag) return;
    const p = worldOf(ev);
    switch (drag.kind) {
      case "pan": {
        const z = drag.camera.z;
        engine.camera = {
          z,
          x: drag.camera.x - (ev.clientX - drag.sx) / z,
          y: drag.camera.y - (ev.clientY - drag.sy) / z,
        };
        render();
        break;
      }
      case "move": {
        let dx = p.x - drag.start.x;
        let dy = p.y - drag.start.y;
        if (!drag.moved && Math.hypot(dx, dy) * engine.camera.z < 3) break;
        drag.moved = true;
        engine.guides = [];
        // Snap to other shapes' edges and centres; hold ⌘/Ctrl to move freely.
        if (propsRef.current.prefs.snap && !ev.metaKey && !ev.ctrlKey) {
          const others = engine.shapes
            .filter((s) => !drag.originals.has(s.id) && !s.startBind && !s.endBind)
            .map(bounds);
          const moving = { ...drag.box, x: drag.box.x + dx, y: drag.box.y + dy };
          const snap = snapBox(moving, others, 6 / engine.camera.z);
          dx += snap.dx;
          dy += snap.dy;
          engine.guides = snap.guides;
        }
        setShapes(
          engine.shapes.map((s) => {
            const o = drag.originals.get(s.id);
            return o ? { ...o, x: o.x + dx, y: o.y + dy } : s;
          }),
        );
        break;
      }
      case "resize": {
        const o = drag.original;
        if (!isLine(o)) {
          // A box cannot be made too short for the text inside it.
          replace(o.id, () => fitLabel(resizeShape(o, drag.handle, p.x, p.y, ev.shiftKey)));
          break;
        }
        // Dragging an arrow end over a shape attaches it; elsewhere frees it.
        const otherEnd = drag.handle === 0 ? o.endBind : o.startBind;
        const target = bindableAt(p, otherEnd);
        engine.bindTarget = target;
        replace(o.id, () => ({
          ...resizeShape(o, drag.handle, p.x, p.y, false),
          [drag.handle === 0 ? "startBind" : "endBind"]: target?.id,
        }));
        break;
      }
      case "node": {
        const o = drag.original;
        const mid = [...(o.mid ?? [])];
        mid[drag.index * 2] = p.x - o.x;
        mid[drag.index * 2 + 1] = p.y - o.y;
        replace(o.id, () => ({ ...o, mid }));
        break;
      }
      case "elbow": {
        const o = drag.original;
        const span = elbowIsAcross(o) ? o.w : o.h;
        const along = elbowIsAcross(o) ? p.x - o.x : p.y - o.y;
        const at = Math.abs(span) < 1 ? 0.5 : Math.min(0.92, Math.max(0.08, along / span));
        // Close to the middle snaps back to the middle.
        replace(o.id, () => ({ ...o, elbowAt: Math.abs(at - 0.5) < 0.03 ? undefined : at }));
        break;
      }
      case "rotate": {
        const c = centerOf(drag.original);
        let angle = Math.atan2(p.y - c.y, p.x - c.x) + Math.PI / 2;
        // Shift turns in 15° steps.
        if (ev.shiftKey) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
        const rotation = Math.abs(angle % (Math.PI * 2)) < 0.001 ? undefined : angle;
        replace(drag.original.id, () => ({ ...drag.original, rotation }));
        break;
      }
      case "scale": {
        const ax = drag.corner.x - drag.anchor.x;
        const ay = drag.corner.y - drag.anchor.y;
        const along = ((p.x - drag.anchor.x) * ax + (p.y - drag.anchor.y) * ay) / (ax * ax + ay * ay || 1);
        const scale = Math.max(0.05, along);
        setShapes(
          engine.shapes.map((s) => {
            const o = drag.originals.get(s.id);
            return o ? scaleShape(o, drag.anchor, scale) : s;
          }),
        );
        break;
      }
      case "marquee":
        drag.box = normalizeBox(drag.start.x, drag.start.y, p.x, p.y);
        render();
        break;
      case "create":
        replace(drag.id, (s) => {
          if (!isLine(s)) return { ...s, ...normalizeBox(drag.start.x, drag.start.y, p.x, p.y) };
          const target = bindableAt(p, s.startBind);
          engine.bindTarget = target;
          return { ...s, w: p.x - s.x, h: p.y - s.y, endBind: target?.id };
        });
        break;
      case "draw": {
        const pts = drag.pts;
        const lx = pts[pts.length - 2];
        const ly = pts[pts.length - 1];
        if (Math.hypot(p.x - lx, p.y - ly) * engine.camera.z < 1.5) break;
        pts.push(p.x, p.y);
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (let i = 0; i < pts.length; i += 2) {
          x1 = Math.min(x1, pts[i]);
          y1 = Math.min(y1, pts[i + 1]);
          x2 = Math.max(x2, pts[i]);
          y2 = Math.max(y2, pts[i + 1]);
        }
        replace(drag.id, (s) => ({
          ...s,
          x: x1,
          y: y1,
          w: x2 - x1,
          h: y2 - y1,
          points: pts.map((v, i) => v - (i % 2 === 0 ? x1 : y1)),
        }));
        break;
      }
      case "erase":
        eraseAt(p);
        break;
      case "laser":
        engine.laser.push({ ...p, t: performance.now() });
        render();
        break;
    }
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
    engine.pointers.delete(ev.pointerId);
    if (engine.pinch) {
      // The pinch ends when either finger lifts; the other finger does nothing more.
      if (engine.pointers.size === 0) engine.pinch = null;
      repaintOverlay();
      return;
    }
    const drag = engine.drag;
    engine.drag = null;
    engine.bindTarget = null;
    engine.guides = [];
    if (!drag) return;
    switch (drag.kind) {
      case "pan":
        canvas.style.cursor = cursorFor(engine.tool);
        emitState();
        repaintOverlay();
        break;
      case "marquee": {
        const inside = (b: Box) =>
          b.x >= drag.box.x && b.y >= drag.box.y &&
          b.x + b.w <= drag.box.x + drag.box.w && b.y + b.h <= drag.box.y + drag.box.h;
        // A frame is picked only when the marquee surrounds it, so dragging
        // across its contents does not grab the frame too.
        const clicked = Math.hypot(drag.box.w, drag.box.h) * engine.camera.z < 4;
        if (clicked && drag.locked) {
          // A plain click on a locked shape picks it, so it can be unlocked.
          select([drag.locked]);
          break;
        }
        // "Wrap" picks only what the box surrounds; "overlap" what it touches.
        const wrap = propsRef.current.prefs.selectOn === "wrap";
        const hits = engine.shapes.filter(
          (s) =>
            !s.locked &&
            (wrap || s.type === "frame" ? inside(bounds(s)) : boxesIntersect(bounds(s), drag.box)),
        );
        const keep = ev.shiftKey ? [...engine.selection] : [];
        select([...keep, ...hits.map((s) => s.id)]);
        break;
      }
      case "create": {
        const shape = engine.shapes.find((s) => s.id === drag.id);
        if (!shape) break;
        const tiny = Math.hypot(shape.w, shape.h) * engine.camera.z < 6;
        if (tiny && shape.type !== "note") {
          // A plain click draws nothing: shapes are made by dragging.
          setShapes(engine.shapes.filter((s) => s.id !== shape.id));
          break;
        }
        if (tiny) {
          // Sticky notes are the exception: a click sticks one down.
          const size = { w: 180, h: 180 };
          replace(shape.id, (s) => ({
            ...s,
            ...size,
            x: drag.start.x - size.w / 2,
            y: drag.start.y - size.h / 2,
          }));
        }
        commit();
        // With the tool locked, stay on it ready for the next shape.
        if (!engine.toolLock) {
          setTool("select");
          select([shape.id]);
        }
        if (shape.type === "note") {
          const created = engine.shapes.find((s) => s.id === shape.id);
          if (created) startEdit(created);
        }
        break;
      }
      case "text": {
        const shape = newShape("text", drag.at);
        setShapes([...engine.shapes, shape]);
        if (!engine.toolLock) setTool("select");
        startEdit(shape);
        break;
      }
      case "node": {
        // A point dropped back onto the straight path between its
        // neighbours is not doing anything: remove it.
        const line = engine.shapes.find((s) => s.id === drag.original.id);
        if (line) {
          const nodes = lineNodes(line);
          const [a, b, c] = [nodes[drag.index], nodes[drag.index + 1], nodes[drag.index + 2]];
          const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
          const off = Math.abs((c.x - a.x) * (a.y - b.y) - (a.x - b.x) * (c.y - a.y)) / len;
          if (off * engine.camera.z < 6) {
            const mid = [...(line.mid ?? [])];
            mid.splice(drag.index * 2, 2);
            replace(line.id, (s) => ({ ...s, mid: mid.length ? mid : undefined }));
          }
        }
        commit();
        emitState();
        break;
      }
      default:
        commit();
        emitState();
    }
    render();
  };

  /** Start typing a line's label, if the line is long enough to carry one. */
  const editLineLabel = (line: Shape) => {
    if (lineHoldsLabel(line)) return startEdit(line);
    propsRef.current.onNotice?.("This line is too short for a label. Make it longer first.");
  };

  const onDoubleClick = (ev: React.MouseEvent) => {
    if (engine.tool !== "select") return;
    const p = worldOf(ev);
    const hit = topShapeAt(p);
    if (hit?.locked) return;
    if (!hit) {
      const shape = newShape("text", p);
      setShapes([...engine.shapes, shape]);
      startEdit(shape);
    } else if (hit.type === "table") {
      const cell = cellAt(hit, p.x, p.y);
      if (cell) startEdit(hit, cell);
    } else if (hit.type === "image" && hit.latex) {
      propsRef.current.onEditFormula(hit);
    } else if (isLine(hit)) {
      editLineLabel(hit);
    } else if (hasLabel(hit) || hit.type === "text" || hit.type === "frame") {
      startEdit(hit);
    }
  };

  /* ------------------------------- Commands -------------------------------- */

  const deleteSelection = () => {
    const kept = engine.shapes.filter((s) => s.locked || !engine.selection.has(s.id));
    if (kept.length === engine.shapes.length) return;
    setShapes(kept);
    // Locked shapes survive, and stay selected.
    engine.selection = new Set(engine.shapes.filter((s) => engine.selection.has(s.id)).map((s) => s.id));
    commit();
    emitState();
  };

  const addCopies = (sources: Shape[], offset: number) => {
    if (!sources.length) return;
    const groupIds = new Map<string, string>();
    const regroup = (g?: string) =>
      g ? (groupIds.get(g) ?? groupIds.set(g, uid()).get(g)) : undefined;
    // A copied arrow stays attached only to shapes copied along with it.
    const ids = new Map(sources.map((s) => [s.id, uid()]));
    const copies = sources.map((s) => ({
      ...s,
      id: ids.get(s.id)!,
      groupId: regroup(s.groupId),
      locked: undefined,
      startBind: s.startBind && ids.get(s.startBind),
      endBind: s.endBind && ids.get(s.endBind),
      x: s.x + offset,
      y: s.y + offset,
    }));
    setShapes([...engine.shapes, ...copies]);
    commit();
    select(copies.map((s) => s.id));
  };

  const api: EngineApi = {
    setTool,
    undo,
    redo,
    getShapes: () => engine.shapes,
    loadShapes: (shapes) => {
      engine.selection = new Set();
      setShapes(shapes);
      commit();
      emitState();
    },
    applyStyle: (patch, live = false) => {
      engine.style = { ...engine.style, ...patch };
      if (engine.selection.size) {
        setShapes(
          engine.shapes.map((s) => {
            if (!engine.selection.has(s.id) || s.locked) return s;
            const next = { ...s, ...patch };
            // Free text is sized to its content: re-measure when its face
            // changes. A box grows if its label no longer fits.
            return s.type === "text" && (patch.fontSize || patch.font)
              ? { ...next, ...measureText(s.text, next.fontSize, next.font) }
              : fitLabel(next);
          }),
        );
        if (!live) commit();
      }
      emitState();
    },
    commitStyle: () => {
      commit();
      emitState();
    },
    selectAll: () => {
      setTool("select");
      select(engine.shapes.filter((s) => !s.locked).map((s) => s.id));
    },
    toggleLock: () => {
      const picked = selectedShapes();
      if (!picked.length) return;
      const locked = picked.every((s) => s.locked) ? undefined : true;
      setShapes(engine.shapes.map((s) => (engine.selection.has(s.id) ? { ...s, locked } : s)));
      commit();
      emitState();
    },
    toggleToolLock: () => {
      engine.toolLock = !engine.toolLock;
      emitState();
    },
    zoomToFit: (selectionOnly = false) => {
      const picked = selectedShapes();
      const box = unionBounds(selectionOnly && picked.length ? picked : engine.shapes);
      if (box) fitBox(box, selectionOnly ? 2 : 1);
    },
    getView: () => ({
      x: engine.camera.x,
      y: engine.camera.y,
      w: engine.width / engine.camera.z,
      h: engine.height / engine.camera.z,
    }),
    centerOn: (x, y) => {
      const { camera, width, height } = engine;
      engine.camera = { ...camera, x: x - width / camera.z / 2, y: y - height / camera.z / 2 };
      repaintOverlay();
      render();
    },
    panBy: (dx, dy) => {
      const { camera } = engine;
      engine.camera = { ...camera, x: camera.x + dx / camera.z, y: camera.y + dy / camera.z };
      repaintOverlay();
      render();
    },
    focusShape: (id) => {
      const shape = engine.shapes.find((s) => s.id === id);
      if (!shape) return;
      if (engine.tool !== "select") setTool("select");
      select([id]);
      const b = bounds(shape);
      const { camera, width, height } = engine;
      const fits = b.w * camera.z < width - 144 && b.h * camera.z < height - 144;
      if (!fits) return fitBox(b, 1);
      engine.camera = {
        ...camera,
        x: b.x + b.w / 2 - width / camera.z / 2,
        y: b.y + b.h / 2 - height / camera.z / 2,
      };
      repaintOverlay();
      render();
    },
    deleteSelection,
    duplicateSelection: () => addCopies(selectedShapes(), 24),
    reorder: (to) => {
      const picked = selectedShapes();
      if (!picked.length) return;
      const on = (s: Shape) => engine.selection.has(s.id);
      if (to === "front" || to === "back") {
        const rest = engine.shapes.filter((s) => !on(s));
        setShapes(to === "front" ? [...rest, ...picked] : [...picked, ...rest]);
      } else {
        // One step: each selected shape trades places with its neighbour.
        const next = [...engine.shapes];
        if (to === "forward") {
          for (let i = next.length - 2; i >= 0; i--) {
            if (on(next[i]) && !on(next[i + 1])) [next[i], next[i + 1]] = [next[i + 1], next[i]];
          }
        } else {
          for (let i = 1; i < next.length; i++) {
            if (on(next[i]) && !on(next[i - 1])) [next[i], next[i - 1]] = [next[i - 1], next[i]];
          }
        }
        setShapes(next);
      }
      commit();
    },
    flip: (axis) => {
      const picked = selectedShapes().filter((s) => !s.locked);
      const box = unionBounds(picked);
      if (!box) return;
      const ids = new Set(picked.map((s) => s.id));
      setShapes(
        engine.shapes.map((s) => {
          if (!ids.has(s.id)) return s;
          if (axis === "x") {
            const x = box.x * 2 + box.w - s.x - (isLine(s) ? 0 : s.w);
            if (isLine(s)) {
              return { ...s, x, w: -s.w, bend: s.bend && -s.bend, mid: s.mid?.map((v, i) => (i % 2 === 0 ? -v : v)) };
            }
            return {
              ...s,
              x,
              rotation: s.rotation && -s.rotation,
              points: s.points?.map((v, i) => (i % 2 === 0 ? s.w - v : v)),
            };
          }
          const y = box.y * 2 + box.h - s.y - (isLine(s) ? 0 : s.h);
          if (isLine(s)) {
            return { ...s, y, h: -s.h, bend: s.bend && -s.bend, mid: s.mid?.map((v, i) => (i % 2 === 1 ? -v : v)) };
          }
          return {
            ...s,
            y,
            rotation: s.rotation && -s.rotation,
            points: s.points?.map((v, i) => (i % 2 === 1 ? s.h - v : v)),
          };
        }),
      );
      commit();
      emitState();
    },
    copyStyle: () => {
      const s = selectedShapes()[0];
      if (!s) return;
      engine.copiedStyle = {
        stroke: s.stroke, fill: s.fill, strokeWidth: s.strokeWidth, fontSize: s.fontSize, dash: s.dash,
        fillStyle: s.fillStyle, opacity: s.opacity, font: s.font, align: s.align, round: s.round, rough: s.rough,
      };
    },
    pasteStyle: () => {
      if (engine.copiedStyle) apiRef.current.applyStyle(engine.copiedStyle);
    },
    insertImage: (image) => {
      const { camera, width, height } = engine;
      const shape: Shape = {
        ...newShape("image", {
          x: camera.x + width / camera.z / 2 - image.w / 2,
          y: camera.y + height / camera.z / 2 - image.h / 2,
        }),
        ...image,
        naturalH: image.h,
        fill: NONE,
      };
      setShapes([...engine.shapes, shape]);
      commit();
      setTool("select");
      select([shape.id]);
    },
    updateImage: (id, image) => {
      replace(id, (s) => {
        // Keep the on-canvas scale the user gave the old image.
        const scale = s.naturalH ? s.h / s.naturalH : 1;
        return { ...s, ...image, w: image.w * scale, h: image.h * scale, naturalH: image.h };
      });
      commit();
      emitState();
    },
    insertTable: (cells) => {
      const base = newShape("table", { x: 0, y: 0 });
      const { camera, width, height } = engine;
      const laid = layoutTable(cells, base.fontSize, base.font);
      const w = laid.cols.reduce((a, b) => a + b, 0);
      const h = laid.rows.reduce((a, b) => a + b, 0);
      const shape: Shape = {
        ...base,
        ...laid,
        cells,
        w,
        h,
        fill: NONE,
        x: camera.x + width / camera.z / 2 - w / 2,
        y: camera.y + height / camera.z / 2 - h / 2,
      };
      setShapes([...engine.shapes, shape]);
      commit();
      setTool("select");
      select([shape.id]);
    },
    tableOp: (op) => {
      const table = selectedShapes().find((s) => s.type === "table");
      if (!table) return;
      replace(table.id, (s) => applyTableOp(s, op));
      commit();
      emitState();
    },
    quickCreate,
    insertShapes: (templates, group = true, at) => {
      const box = unionBounds(templates);
      if (!box) return;
      const { camera, width, height } = engine;
      const centre = at ?? { x: camera.x + width / camera.z / 2, y: camera.y + height / camera.z / 2 };
      const dx = centre.x - (box.x + box.w / 2);
      const dy = centre.y - (box.y + box.h / 2);
      const groupId = group && templates.length > 1 ? uid() : undefined;
      // Fresh ids, with arrows still attached to the shapes that came with them.
      const ids = new Map(templates.map((t) => [t.id, uid()]));
      // Left ungrouped, shapes keep whatever groups they came with.
      const groups = new Map<string, string>();
      const regroup = (g?: string) => (g ? (groups.get(g) ?? groups.set(g, uid()).get(g)) : undefined);
      const added = templates.map((t) => ({
        ...t,
        id: ids.get(t.id)!,
        groupId: group ? groupId : regroup(t.groupId),
        locked: undefined,
        startBind: t.startBind && ids.get(t.startBind),
        endBind: t.endBind && ids.get(t.endBind),
        x: t.x + dx,
        y: t.y + dy,
      }));
      setShapes([...engine.shapes, ...added]);
      commit();
      setTool("select");
      select(added.map((s) => s.id));
    },
    group: () => {
      if (engine.selection.size < 2) return;
      const groupId = uid();
      setShapes(engine.shapes.map((s) => (engine.selection.has(s.id) ? { ...s, groupId } : s)));
      commit();
      emitState();
    },
    ungroup: () => {
      setShapes(
        engine.shapes.map((s) =>
          engine.selection.has(s.id) && s.groupId ? { ...s, groupId: undefined } : s,
        ),
      );
      commit();
      emitState();
    },
    applyLineStyle: (patch) => {
      engine.lineStyle = { ...engine.lineStyle, ...patch };
      if (selectedShapes().some(isLine)) {
        setShapes(
          engine.shapes.map((s) => {
            if (!engine.selection.has(s.id) || !isLine(s)) return s;
            if (!("route" in patch) || patch.route === s.route) return { ...s, ...patch };
            // Changing how the line travels. An elbow keeps no in-between
            // points; an old-style bow becomes a real point first.
            if (patch.route === "elbow") return { ...s, ...patch, mid: undefined, bend: undefined };
            const mid = s.bend && !s.mid?.length ? [lineMid(s).x - s.x, lineMid(s).y - s.y] : s.mid;
            return { ...s, ...patch, mid, bend: undefined, elbowAt: undefined };
          }),
        );
        commit();
      }
      emitState();
    },
    align: (mode) => {
      const picked = selectedShapes();
      if (picked.length < 2) return;
      const offsets = alignOffsets(picked, mode);
      setShapes(
        engine.shapes.map((s) => {
          const d = offsets.get(s.id);
          return d ? { ...s, x: s.x + d.x, y: s.y + d.y } : s;
        }),
      );
      commit();
      emitState();
    },
    distribute: (axis) => {
      const offsets = distributeOffsets(selectedShapes(), axis);
      if (!offsets.size) return;
      setShapes(
        engine.shapes.map((s) => {
          const d = offsets.get(s.id);
          return d ? { ...s, x: s.x + d.x, y: s.y + d.y } : s;
        }),
      );
      commit();
      emitState();
    },
    zoomBy: (factor) => zoomAt(engine.width / 2, engine.height / 2, factor),
    resetZoom: () => zoomAt(engine.width / 2, engine.height / 2, 1 / engine.camera.z),
    exportImage: async ({ format, background, scale, selectionOnly }) => {
      const picked = selectedShapes();
      const shapes = selectionOnly && picked.length ? picked : engine.shapes;
      const box = unionBounds(shapes);
      if (!box) return null;
      await preloadImages(shapes);
      const pad = 32;
      const width = box.w + pad * 2;
      const height = box.h + pad * 2;
      const theme = propsRef.current.theme;
      const paper = propsRef.current.background;
      const options = { theme, bg: paper, onImageLoad: () => {} };

      if (format === "svg") {
        const svg = new SvgContext();
        if (background) {
          svg.fillStyle = paper;
          svg.fillRect(0, 0, width, height);
        }
        svg.translate(pad - box.x, pad - box.y);
        const ctx = svg as unknown as CanvasRenderingContext2D;
        for (const s of shapes) drawShape(ctx, s, options);
        const fontCss = svg.usesHandFont ? await handFontCss() : "";
        return new Blob([svg.finish(width, height, fontCss)], { type: "image/svg+xml" });
      }

      const out = document.createElement("canvas");
      out.width = Math.round(width * scale);
      out.height = Math.round(height * scale);
      const ctx = out.getContext("2d")!;
      if (background) {
        ctx.fillStyle = paper;
        ctx.fillRect(0, 0, out.width, out.height);
      }
      ctx.setTransform(scale, 0, 0, scale, (pad - box.x) * scale, (pad - box.y) * scale);
      for (const s of shapes) drawShape(ctx, s, options);
      return new Promise((resolve) => out.toBlob(resolve, "image/png"));
    },
  };
  useImperativeHandle(ref, () => api);
  const apiRef = useRef(api);
  apiRef.current = api;
  // In development the engine is reachable from the console, for testing.
  if (import.meta.env.DEV) (window as unknown as { loosedraw?: EngineApi }).loosedraw = api;

  /* ------------------------- Keyboard, wheel, resize ----------------------- */

  useEffect(() => {
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

    const onKeyDown = (ev: KeyboardEvent) => {
      if (typing(ev.target) || document.querySelector(".modal-backdrop")) return;
      const mod = ev.metaKey || ev.ctrlKey;
      const key = ev.key.toLowerCase();
      let handled = true;
      if (ev.code === "Space") {
        engine.spaceDown = true;
      } else if (mod && key === "z") {
        if (ev.shiftKey) redo();
        else undo();
      } else if (mod && key === "y") {
        redo();
      } else if (mod && ev.altKey && ev.code === "KeyC") {
        apiRef.current.copyStyle();
      } else if (mod && ev.altKey && ev.code === "KeyV") {
        apiRef.current.pasteStyle();
      } else if (mod && (ev.code === "BracketRight" || ev.code === "BracketLeft")) {
        const up = ev.code === "BracketRight";
        apiRef.current.reorder(ev.shiftKey ? (up ? "front" : "back") : up ? "forward" : "backward");
      } else if (mod && (key === "=" || key === "+")) {
        apiRef.current.zoomBy(1.2);
      } else if (mod && key === "-") {
        apiRef.current.zoomBy(1 / 1.2);
      } else if (mod && key === "0") {
        apiRef.current.resetZoom();
      } else if (ev.shiftKey && !mod && !ev.altKey && key === "h" && engine.selection.size) {
        apiRef.current.flip("x");
      } else if (ev.shiftKey && !mod && !ev.altKey && key === "v" && engine.selection.size) {
        apiRef.current.flip("y");
      } else if (!mod && !ev.altKey && !ev.shiftKey && DIGIT_TOOLS[ev.code]) {
        setTool(DIGIT_TOOLS[ev.code]);
      } else if (mod && key === "a") {
        apiRef.current.selectAll();
      } else if (mod && ev.shiftKey && key === "l") {
        apiRef.current.toggleLock();
      } else if (ev.shiftKey && !mod && ev.code === "Digit1") {
        apiRef.current.zoomToFit();
      } else if (ev.shiftKey && !mod && ev.code === "Digit2") {
        apiRef.current.zoomToFit(true);
      } else if (!mod && !ev.altKey && key === "q") {
        apiRef.current.toggleToolLock();
      } else if (mod && key === "d") {
        apiRef.current.duplicateSelection();
      } else if (mod && key === "g") {
        if (ev.shiftKey) apiRef.current.ungroup();
        else apiRef.current.group();
      } else if (key === "delete" || key === "backspace") {
        deleteSelection();
      } else if (key === "escape") {
        setTool("select");
        select([]);
      } else if (mod && key.startsWith("arrow") && quickSource()) {
        quickCreate(key.slice(5) as Direction);
      } else if (key === "enter" && !mod && engine.selection.size === 1) {
        // Enter starts typing in the selected shape.
        const shape = selectedShapes()[0];
        if (shape.locked) handled = false;
        else if (shape.type === "table") startEdit(shape, { r: 0, c: 0 });
        else if (isLine(shape)) editLineLabel(shape);
        else if (hasLabel(shape) || shape.type === "text" || shape.type === "frame") startEdit(shape);
        else handled = false;
      } else if (key.startsWith("arrow") && engine.selection.size) {
        const step = ev.shiftKey ? 10 : 1;
        const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
        const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
        setShapes(
          engine.shapes.map((s) =>
            engine.selection.has(s.id) && !s.locked ? { ...s, x: s.x + dx, y: s.y + dy } : s,
          ),
        );
        commit();
      } else if (!mod && !ev.altKey && KEY_TOOLS[key]) {
        setTool(KEY_TOOLS[key]);
      } else {
        handled = false;
      }
      if (handled) ev.preventDefault();
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.code === "Space") engine.spaceDown = false;
    };

    // Clipboard. Shapes travel as JSON under our own type, so they paste
    // between scenes and tabs; plain text and images come in from anywhere.
    const SHAPES_MIME = "application/x-loosedraw-shapes";
    const busy = (ev: Event) =>
      typing(ev.target) || !!document.querySelector(".modal-backdrop");
    const onCopy = (ev: ClipboardEvent) => {
      const picked = selectedShapes();
      if (busy(ev) || !picked.length || !ev.clipboardData) return;
      ev.clipboardData.setData(SHAPES_MIME, JSON.stringify(picked));
      ev.clipboardData.setData("text/plain", picked.map((s) => s.text).filter(Boolean).join("\n"));
      ev.preventDefault();
      if (ev.type === "cut") deleteSelection();
    };
    const onPaste = (ev: ClipboardEvent) => {
      const data = ev.clipboardData;
      if (busy(ev) || !data) return;
      ev.preventDefault();
      const json = data.getData(SHAPES_MIME);
      if (json) {
        try {
          addCopies(JSON.parse(json) as Shape[], 24);
        } catch {
          /* not ours after all */
        }
        return;
      }
      const image = [...data.files].find((f) => f.type.startsWith("image/"));
      if (image) {
        const reader = new FileReader();
        reader.onload = () => {
          const src = String(reader.result);
          const img = new Image();
          img.onload = () => {
            const scale = Math.min(1, 480 / img.naturalWidth);
            apiRef.current.insertImage({ src, w: img.naturalWidth * scale, h: img.naturalHeight * scale });
          };
          img.src = src;
        };
        reader.readAsDataURL(image);
        return;
      }
      const text = data.getData("text/plain").trim();
      if (!text) return;
      if (looksLikeMermaid(text)) {
        // A pasted Mermaid flowchart becomes a diagram; if it does not
        // parse, it falls through and is pasted as plain text.
        try {
          apiRef.current.insertShapes(mermaidToShapes(text), false);
          return;
        } catch {
          /* not a flowchart we can read */
        }
      }
      const cells = parseCells(text);
      if (cells) {
        apiRef.current.insertTable(cells);
        return;
      }
      // Plain text becomes a text shape in the middle of the view.
      const { camera, width, height } = engine;
      const size = measureText(text, engine.style.fontSize, engine.style.font);
      const shape: Shape = {
        ...newShape("text", {
          x: camera.x + width / camera.z / 2 - size.w / 2,
          y: camera.y + height / camera.z / 2 - size.h / 2,
        }),
        ...size,
        text,
      };
      setShapes([...engine.shapes, shape]);
      commit();
      setTool("select");
      select([shape.id]);
    };

    const canvas = canvasRef.current!;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      if (editingRef.current) commitEdit();
      // A mouse wheel zooms; a trackpad scrolls and pinches to zoom.
      const mouse = propsRef.current.prefs.input === "mouse";
      if (ev.ctrlKey || ev.metaKey || (mouse && !ev.shiftKey)) {
        const rect = canvas.getBoundingClientRect();
        zoomAt(ev.clientX - rect.left, ev.clientY - rect.top, Math.exp(-ev.deltaY * 0.01));
      } else {
        const { camera } = engine;
        engine.camera = {
          ...camera,
          x: camera.x + ev.deltaX / camera.z,
          y: camera.y + ev.deltaY / camera.z,
        };
        render();
      }
    };

    const observer = new ResizeObserver(() => {
      const wrap = wrapRef.current!;
      const dpr = window.devicePixelRatio || 1;
      engine.width = wrap.clientWidth;
      engine.height = wrap.clientHeight;
      canvas.width = Math.round(engine.width * dpr);
      canvas.height = Math.round(engine.height * dpr);
      if (!engine.centered && engine.width > 0) {
        // First layout: centre existing content, or put the origin mid-screen.
        engine.centered = true;
        const box = unionBounds(engine.shapes);
        const cx = box ? box.x + box.w / 2 : 0;
        const cy = box ? box.y + box.h / 2 : 0;
        engine.camera = { x: cx - engine.width / 2, y: cy - engine.height / 2, z: 1 };
      }
      // Draw at once: a resized canvas is blank until it is painted.
      paint();
    });
    observer.observe(wrapRef.current!);

    // Canvas text cannot wait for a web font: redraw once it has arrived.
    void document.fonts.load(`16px "${CANVAS_FONT}"`).then(render);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCopy);
    window.addEventListener("paste", onPaste);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    emitState();
    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCopy);
      window.removeEventListener("paste", onPaste);
      canvas.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(engine.frame);
      engine.frame = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(render, [props.theme, props.background, props.prefs.grid, editingId, render]);

  /* ------------------------------ Text overlay ----------------------------- */

  const editing = editingId ? engine.shapes.find((s) => s.id === editingId) : null;
  let editorStyle: React.CSSProperties | undefined;
  if (editing) {
    const { camera } = engine;
    const z = camera.z;
    const fontSize = editing.fontSize * z;
    const base: React.CSSProperties = {
      // Turn the editor with its shape, about the shape's centre.
      transform: editing.rotation ? `rotate(${editing.rotation}rad)` : undefined,
      transformOrigin: `${(editing.w * z) / 2}px ${(editing.h * z) / 2}px`,
      font: fontOf(fontSize, editing.font),
      lineHeight: LINE_HEIGHT,
      color: editing.type === "note" ? "#2b2410" : resolveColor(editing.stroke, props.theme),
    };
    if (isLine(editing)) {
      // A label is typed where it will sit: centred on the line's middle.
      // It wraps exactly as the finished label will.
      const mid = lineMid(editing);
      const lines = wrapText(draft || " ", editing.fontSize, lineLabelWidth(editing), editing.font);
      const widest = Math.max(...lines.map((l) => measureText(l, editing.fontSize, editing.font).w));
      const width = Math.max(48, widest + editing.fontSize);
      const height = lines.length * editing.fontSize * LINE_HEIGHT;
      editorStyle = {
        ...base,
        transform: undefined,
        left: (mid.x - width / 2 - camera.x) * z,
        top: (mid.y - height / 2 - camera.y) * z,
        width: width * z,
        height: height * z,
        textAlign: "center",
        whiteSpace: "pre-wrap",
        background: props.background,
      };
    } else if (editing.type === "frame") {
      editorStyle = {
        ...base,
        font: fontOf(14 * z, editing.font),
        left: (editing.x + 2 - camera.x) * z,
        top: (editing.y - FRAME_TITLE_HEIGHT - camera.y) * z,
        width: Math.max(160, Math.min(editing.w, 320)) * z,
        height: FRAME_TITLE_HEIGHT * z,
        lineHeight: `${FRAME_TITLE_HEIGHT * z}px`,
      };
    } else if (editing.type === "text") {
      const size = measureText(draft || " ", editing.fontSize, editing.font);
      // Extra room to type into, placed on the side the text grows towards.
      const room = editing.fontSize;
      const align = editing.align ?? "left";
      const shift = align === "right" ? editing.w - size.w - room : align === "center" ? (editing.w - size.w - room) / 2 : 0;
      editorStyle = {
        ...base,
        left: (editing.x + shift - camera.x) * z,
        top: (editing.y - camera.y) * z,
        width: (size.w + room) * z,
        height: size.h * z,
        textAlign: align,
      };
    } else {
      // A label fills its shape; a table cell fills just that cell.
      const cell = editing.type === "table" ? cellRef.current : null;
      const box = cell ? cellBox(editing, cell) : editing;
      const pad = cell ? CELL_PADDING : LABEL_PADDING;
      const lines = wrapText(draft || " ", editing.fontSize, Math.max(10, box.w - pad * 2), editing.font);
      const textHeight = lines.length * fontSize * LINE_HEIGHT;
      editorStyle = {
        ...base,
        left: (box.x - camera.x) * z,
        top: (box.y - camera.y) * z,
        width: box.w * z,
        height: box.h * z,
        textAlign: editing.align ?? "center",
        padding: `${Math.max(0, (box.h * z - textHeight) / 2)}px ${pad * z}px 0`,
        whiteSpace: "pre-wrap",
      };
    }
  }

  return (
    <div
      className="ink-canvas"
      ref={wrapRef}
      // The browser scrolls this box to keep a caret in view, which would
      // slide the canvas off its own frame. The camera does that job here.
      onScroll={(ev) => {
        ev.currentTarget.scrollTop = 0;
        ev.currentTarget.scrollLeft = 0;
      }}
      // A library item dragged from the panel lands where it is dropped.
      onDragOver={(ev) => {
        if (ev.dataTransfer.types.includes(LIBRARY_DRAG_TYPE)) ev.preventDefault();
      }}
      onDrop={(ev) => {
        const json = ev.dataTransfer.getData(LIBRARY_DRAG_TYPE);
        if (!json) return;
        ev.preventDefault();
        try {
          api.insertShapes(JSON.parse(json) as Shape[], true, worldOf(ev));
        } catch {
          /* not a library item */
        }
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(ev) => ev.preventDefault()}
      />
      {editing && (
        <textarea
          key={`${editing.id}:${cellRef.current?.r ?? ""}:${cellRef.current?.c ?? ""}`}
          className="ink-editor"
          style={editorStyle}
          autoFocus
          spellCheck={false}
          value={draft}
          onFocus={(ev) => ev.target.setSelectionRange(draft.length, draft.length)}
          onChange={(ev) => {
            draftRef.current = ev.target.value;
            setDraft(ev.target.value);
            // A box grows downwards to hold what is typed into it.
            let bottom = editing.y + editing.h;
            if (hasLabel(editing)) {
              const needed = labelHeight(editing, ev.target.value);
              if (needed > editing.h) {
                replace(editing.id, (s) => ({ ...s, h: needed }));
                bottom = editing.y + needed;
              }
            } else if (editing.type === "text") {
              bottom = editing.y + measureText(ev.target.value || " ", editing.fontSize, editing.font).h;
            }
            // Follow the text if it runs off the bottom of the view.
            const { camera, height } = engine;
            const over = bottom + 40 / camera.z - (camera.y + height / camera.z);
            if (over > 0) {
              engine.camera = { ...camera, y: camera.y + over };
              render();
            }
          }}
          onBlur={commitEdit}
          onKeyDown={(ev) => {
            if (ev.key === "Escape" || (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey))) {
              ev.preventDefault();
              commitEdit();
            } else if (ev.key === "Tab" && cellRef.current && editing.type === "table") {
              // Tab walks through the cells, like a spreadsheet.
              ev.preventDefault();
              const { r, c } = cellRef.current;
              const columns = editing.cols?.length ?? 0;
              const total = (editing.rows?.length ?? 0) * columns;
              const index = r * columns + c + (ev.shiftKey ? -1 : 1);
              const id = editing.id;
              commitEdit();
              const table = engine.shapes.find((s) => s.id === id);
              if (table && index >= 0 && index < total) {
                startEdit(table, { r: Math.floor(index / columns), c: index % columns });
              }
            }
          }}
        />
      )}
    </div>
  );
});
