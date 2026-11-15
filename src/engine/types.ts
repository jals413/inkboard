// The Loosedraw document model. Everything on a board is a Shape.

export type ShapeType =
  | "rect"
  | "ellipse"
  | "diamond"
  | "note"
  | "line"
  | "arrow"
  | "draw"
  | "text"
  | "image"
  | "table"
  | "frame";

export type Head =
  | "none"
  | "arrow"
  | "triangle"
  | "triangleOutline"
  | "dot"
  | "circle"
  | "diamond"
  | "diamondOutline"
  | "bar"
  | "crowfoot";
export type Dash = "solid" | "dashed" | "dotted";
export type FillStyle = "tint" | "hachure" | "solid";
/** Typeface for a shape's text: handwriting (the default), plain or code. */
export type Font = "hand" | "sans" | "mono";
export type TextAlign = "left" | "center" | "right";

export type Shape = {
  id: string;
  type: ShapeType;
  /** Top-left corner. For line/arrow: the start point. */
  x: number;
  y: number;
  /** Size. For line/arrow: the vector to the end point (may be negative). */
  w: number;
  h: number;
  /** A colour, or INK for "the theme's default ink". */
  stroke: string;
  /** A colour drawn as a soft tint, or NONE. */
  fill: string;
  strokeWidth: number;
  opacity: number;
  /** Text content (text shapes) or centred label (box shapes). */
  text: string;
  fontSize: number;
  /** draw: flat [x0, y0, x1, y1, …] relative to x, y. */
  points?: number[];
  /** image: data URL. */
  src?: string;
  /** image: LaTeX source when the image is a rendered formula. */
  latex?: string;
  /** image: height of the source image, to keep the user's scale on re-render. */
  naturalH?: number;
  /** table: cell text by row, then column. */
  cells?: string[][];
  /** table: column widths and row heights. w and h are their sums. */
  cols?: number[];
  rows?: number[];
  /** Shapes that share a groupId select and move as one. */
  groupId?: string;
  /** Rotation about the centre, in radians. Not used by lines or tables. */
  rotation?: number;
  /** line/arrow: ids of the shapes its start and end are attached to. */
  startBind?: string;
  endBind?: string;
  /** line/arrow: what is drawn at each end. Unset means the type's default. */
  startHead?: Head;
  endHead?: Head;
  /**
   * line/arrow: how it travels. Unset goes straight from point to point,
   * "curve" flows smoothly through its points, "elbow" uses right angles.
   */
  route?: "elbow" | "curve";
  /**
   * line/arrow: the points it passes through between its ends, as flat
   * [x0, y0, x1, y1, …] offsets from its start. Not used by elbow lines.
   */
  mid?: number[];
  /** Elbow lines: how far along the turn sits, from 0 (start) to 1 (end). Unset is halfway. */
  elbowAt?: number;
  /**
   * Elbow lines attached to shapes: true to leave sideways, false to leave
   * up or down. Set by the binding step; unset means "decide from the ends".
   */
  elbowAcross?: boolean;
  /** line/arrow: an older way to bow a line; `mid` replaces it once the line is edited. */
  bend?: number;
  /** Outline pattern. Unset is solid. */
  dash?: Dash;
  /** How `fill` is drawn. Unset is a soft tint. */
  fillStyle?: FillStyle;
  /** Typeface. Unset is handwriting. */
  font?: Font;
  /** Unset: free text starts at the left, labels and cells are centred. */
  align?: TextAlign;
  /** Rectangles: rounded corners. */
  round?: boolean;
  /** How hand-drawn the outline is: 0 neat, 1 sketched (the default), 2 scribbled. */
  rough?: 0 | 1 | 2;
  /** A locked shape cannot be moved, edited, erased or deleted. */
  locked?: boolean;
};

export type Doc = { shapes: Shape[] };

/** screen = (world - camera) * z */
export type Camera = { x: number; y: number; z: number };

export type Tool =
  | "select"
  | "hand"
  | "rect"
  | "ellipse"
  | "diamond"
  | "note"
  | "arrow"
  | "line"
  | "draw"
  | "highlight"
  | "text"
  | "frame"
  | "eraser"
  | "laser";

export type Style = Pick<
  Shape,
  "stroke" | "fill" | "strokeWidth" | "fontSize" | "dash" | "fillStyle" | "opacity" | "font" | "align" | "round" | "rough"
>;

/** Settings that only lines and arrows have. */
export type LineStyle = Pick<Shape, "startHead" | "endHead" | "route">;

/** The head actually drawn at an end, after applying the type's default. */
export const headOf = (s: Shape, end: "start" | "end"): Head =>
  (end === "start" ? s.startHead : s.endHead) ??
  (s.type === "arrow" && end === "end" ? "arrow" : "none");

export type Theme = "light" | "dark";

export const INK = "ink";
export const NONE = "none";

export const DEFAULT_STYLE: Style = {
  stroke: INK,
  fill: NONE,
  strokeWidth: 2,
  fontSize: 18,
  opacity: 1,
  round: true,
};

export const STROKES = [INK, "#e03131", "#f08c00", "#2f9e44", "#1c7ed6", "#7048e8"];
export const FILLS = [NONE, INK, "#e03131", "#f08c00", "#2f9e44", "#1c7ed6", "#7048e8"];
export const NOTE_FILL = "#f5b700";

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const isLine = (s: Shape) => s.type === "line" || s.type === "arrow";
/** Shapes that carry a centred label. */
export const hasLabel = (s: Shape) =>
  s.type === "rect" || s.type === "ellipse" || s.type === "diamond" || s.type === "note";
