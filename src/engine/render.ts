import {
  bounds,
  boxCorners,
  FRAME_TITLE_HEIGHT,
  canRotate,
  cellBox,
  centerOf,
  curveControl,
  endAngle,
  handlesOf,
  lineLength,
  lineMid,
  lineNodes,
  linePath,
  rotateHandleOf,
  segmentMids,
  splinePoints,
  type Box,
  type Cell,
  type Guide,
} from "./geom";
import { withFormulaFont } from "./formulaFont";
import {
  INK,
  NONE,
  hasLabel,
  headOf,
  isLine,
  type Font,
  type Head,
  type Camera,
  type Shape,
  type TextAlign,
  type Theme,
} from "./types";

export const LINE_HEIGHT = 1.3;
export const LABEL_PADDING = 12;
/** A label on a line or arrow wraps at this width. */
export const LINE_LABEL_WIDTH = 220;

/** A line shorter than this cannot take a label at all. */
export const MIN_LABELLED_LINE = 90;

/** Whether a line is long enough to carry a label. */
export const lineHoldsLabel = (s: Shape) => lineLength(s) >= MIN_LABELLED_LINE;

/**
 * How wide a line's label may be before it wraps: never wider than the
 * line can carry, so a label is always narrower than its line.
 */
export const lineLabelWidth = (s: Shape) =>
  Math.max(44, Math.min(LINE_LABEL_WIDTH, lineLength(s) - 44));

/** A box made at least tall enough for its label. */
export const fitLabel = (s: Shape): Shape => {
  if (!hasLabel(s) || !s.text) return s;
  const needed = labelHeight(s, s.text);
  return needed > s.h ? { ...s, h: needed } : s;
};

/** The height a box needs for its label to fit inside it. */
export const labelHeight = (s: Shape, text: string) => {
  const lines = wrapText(text, s.fontSize, Math.max(20, s.w - LABEL_PADDING * 2), s.font).length;
  const room = s.type === "diamond" ? 1.6 : s.type === "ellipse" ? 1.25 : 1;
  return (lines * s.fontSize * LINE_HEIGHT + LABEL_PADDING * 2) * room;
};
export const CELL_PADDING = 10;
/** Everything written on the canvas uses the handwriting face. */
export const CANVAS_FONT = "Shantell Sans";
export const FONT_FAMILIES: Record<Font, string> = {
  hand: `"${CANVAS_FONT}", "Comic Sans MS", "Segoe Print", cursive`,
  sans: `Inter, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`,
  mono: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`,
};
export const fontOf = (size: number, font: Font = "hand") =>
  `400 ${size}px ${FONT_FAMILIES[font]}`;

export const CANVAS_BG: Record<Theme, string> = { light: "#fbfbfc", dark: "#111317" };
const INK_COLOR: Record<Theme, string> = { light: "#1b1f2a", dark: "#e8eaf0" };
const ACCENT: Record<Theme, string> = { light: "#2563eb", dark: "#8ab4ff" };

export const resolveColor = (color: string, theme: Theme) =>
  color === INK ? INK_COLOR[theme] : color;

/* ---------------------------------- Text ---------------------------------- */

let measureCtx: CanvasRenderingContext2D | null = null;
const measurer = () =>
  (measureCtx ??= document.createElement("canvas").getContext("2d")!);

/** Size of unwrapped text: used for free text shapes. */
export const measureText = (text: string, fontSize: number, font?: Font) => {
  const ctx = measurer();
  ctx.font = fontOf(fontSize, font);
  const lines = text.split("\n");
  return {
    w: Math.max(2, ...lines.map((l) => ctx.measureText(l).width)),
    h: lines.length * fontSize * LINE_HEIGHT,
  };
};

/** Greedy word wrap: used for labels inside shapes. */
export const wrapText = (text: string, fontSize: number, maxWidth: number, font?: Font): string[] => {
  const ctx = measurer();
  ctx.font = fontOf(fontSize, font);
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (let word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
      // A single word wider than the space is broken across lines.
      while (line === word && word.length > 1 && ctx.measureText(word).width > maxWidth) {
        let cut = word.length - 1;
        while (cut > 1 && ctx.measureText(word.slice(0, cut)).width > maxWidth) cut--;
        out.push(word.slice(0, cut));
        word = word.slice(cut);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
};

/* --------------------------------- Images --------------------------------- */

const images = new Map<string, HTMLImageElement>();

const imageFor = (src: string, onLoad: () => void) => {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.onload = onLoad;
    images.set(src, img);
    // A formula needs its font added before it can be drawn.
    const image = img;
    void withFormulaFont(src).then((ready) => (image.src = ready));
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
};

/** Wait for every image on the board, so an export never misses one. */
export const preloadImages = (shapes: readonly Shape[]) =>
  Promise.all(
    shapes
      .filter((s) => s.type === "image" && s.src)
      .map(
        (s) =>
          new Promise<void>((resolve) => {
            if (imageFor(s.src!, resolve)) return resolve();
            const img = images.get(s.src!)!;
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
  );

/* ------------------------------ Hand-drawn lines ------------------------------ */

// Each shape's wobble comes from a random sequence seeded by its id, so a
// shape looks the same on every frame instead of shimmering.

const hashId = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Rand = () => number;

/** How far outlines stray, set per shape from its sloppiness. */
let rough = 1;
const ROUGH = [0.28, 1, 2.2];

/** A sketched line: two passes, each a little off-target and gently bowed. */
const sketchLine = (
  ctx: CanvasRenderingContext2D, rand: Rand,
  x1: number, y1: number, x2: number, y2: number, passes = 2,
) => {
  const wobble = Math.min(2.4, Math.max(0.5, Math.hypot(x2 - x1, y2 - y1) / 60)) * rough;
  const jitter = (scale = 1) => (rand() - 0.5) * 2 * wobble * scale;
  for (let pass = 0; pass < passes; pass++) {
    ctx.moveTo(x1 + jitter(), y1 + jitter());
    ctx.bezierCurveTo(
      x1 + (x2 - x1) * 0.33 + jitter(1.6), y1 + (y2 - y1) * 0.33 + jitter(1.6),
      x1 + (x2 - x1) * 0.66 + jitter(1.6), y1 + (y2 - y1) * 0.66 + jitter(1.6),
      x2 + jitter(), y2 + jitter(),
    );
  }
};

/** A sketched ellipse: two loops that start anywhere and slightly overshoot. */
const sketchEllipse = (
  ctx: CanvasRenderingContext2D, rand: Rand,
  cx: number, cy: number, rx: number, ry: number, passes = 2,
) => {
  const steps = 16;
  const wobble = Math.min(0.06, 1.8 / Math.max(rx, ry, 1)) * rough;
  for (let pass = 0; pass < passes; pass++) {
    const start = rand() * Math.PI * 2;
    const pts: number[] = [];
    for (let i = 0; i <= steps + 2; i++) {
      const angle = start + (i / steps) * Math.PI * 2;
      const r = 1 + (rand() - 0.5) * 2 * wobble;
      pts.push(cx + Math.cos(angle) * rx * r, cy + Math.sin(angle) * ry * r);
    }
    ctx.moveTo((pts[0] + pts[2]) / 2, (pts[1] + pts[3]) / 2);
    for (let i = 2; i + 3 < pts.length; i += 2) {
      ctx.quadraticCurveTo(pts[i], pts[i + 1], (pts[i] + pts[i + 2]) / 2, (pts[i + 1] + pts[i + 3]) / 2);
    }
  }
};

const sketchPolygon = (
  ctx: CanvasRenderingContext2D, rand: Rand, corners: number[], passes = 2,
) => {
  for (let i = 0; i < corners.length; i += 2) {
    const j = (i + 2) % corners.length;
    sketchLine(ctx, rand, corners[i], corners[i + 1], corners[j], corners[j + 1], passes);
  }
};

/** A sketched rectangle with rounded corners: four sides, joined by short turns. */
const sketchRoundRect = (
  ctx: CanvasRenderingContext2D, rand: Rand, b: Box, radius: number, passes = 2,
) => {
  const { x, y, w, h } = b;
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const sides = [
    [x + r, y, x + w - r, y],
    [x + w, y + r, x + w, y + h - r],
    [x + w - r, y + h, x + r, y + h],
    [x, y + h - r, x, y + r],
  ];
  const corners = [[x + w, y], [x + w, y + h], [x, y + h], [x, y]];
  const jitter = () => (rand() - 0.5) * 1.2 * rough;
  for (let pass = 0; pass < passes; pass++) {
    sides.forEach(([x1, y1, x2, y2], i) => {
      sketchLine(ctx, rand, x1, y1, x2, y2, 1);
      const next = sides[(i + 1) % 4];
      ctx.moveTo(x2 + jitter(), y2 + jitter());
      ctx.quadraticCurveTo(corners[i][0] + jitter(), corners[i][1] + jitter(), next[0] + jitter(), next[1] + jitter());
    });
  }
};

/** Corner radius of a rectangle: gentle when rounded, barely there when sharp. */
const cornerRadius = (s: Shape) => (s.round ? Math.min(32, Math.min(s.w, s.h) * 0.25) : 3);

/** A sketched bow: like sketchLine, but through one control point. */
const sketchCurve = (
  ctx: CanvasRenderingContext2D, rand: Rand,
  x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, passes = 2,
) => {
  const wobble = Math.min(2.4, Math.max(0.5, Math.hypot(x2 - x1, y2 - y1) / 60)) * rough;
  const jitter = (scale = 1) => (rand() - 0.5) * 2 * wobble * scale;
  for (let pass = 0; pass < passes; pass++) {
    ctx.moveTo(x1 + jitter(), y1 + jitter());
    ctx.quadraticCurveTo(cx + jitter(2), cy + jitter(2), x2 + jitter(), y2 + jitter());
  }
};

/** Diagonal sketched strokes across a box; the caller clips them to the shape. */
const hachure = (ctx: CanvasRenderingContext2D, rand: Rand, b: Box, gap: number) => {
  ctx.beginPath();
  for (let k = gap / 2; k < b.w + b.h; k += gap) {
    sketchLine(ctx, rand, b.x + k, b.y, b.x + k - b.h, b.y + b.h, 1);
  }
  ctx.stroke();
};

/**
 * What is drawn at the end of a line, with its tip at (x, y). Outlined heads
 * are filled with `paper`, the canvas colour, so the line does not show through.
 */
const drawHead = (
  ctx: CanvasRenderingContext2D, rand: Rand, kind: Head,
  x: number, y: number, angle: number, size: number, paper: string,
) => {
  if (kind === "none") return;
  const at = (side: number, spread: number, length = size) => ({
    x: x - length * Math.cos(angle + side * spread),
    y: y - length * Math.sin(angle + side * spread),
  });
  const back = (length: number) => ({ x: x - length * Math.cos(angle), y: y - length * Math.sin(angle) });
  const hollow = kind === "triangleOutline" || kind === "circle" || kind === "diamondOutline";
  const ink = ctx.fillStyle;
  ctx.beginPath();
  switch (kind) {
    case "arrow":
      for (const side of [-1, 1]) {
        const p = at(side, 0.45);
        sketchLine(ctx, rand, x, y, p.x, p.y);
      }
      ctx.stroke();
      return;
    case "bar": {
      const half = size * 0.55;
      sketchLine(
        ctx, rand,
        x + half * Math.cos(angle + Math.PI / 2), y + half * Math.sin(angle + Math.PI / 2),
        x - half * Math.cos(angle + Math.PI / 2), y - half * Math.sin(angle + Math.PI / 2),
      );
      ctx.stroke();
      return;
    }
    case "crowfoot": {
      // "Many" in a data model: three toes spreading onto the shape.
      const heel = back(size);
      for (const side of [-1, 0, 1]) {
        const half = size * 0.6 * side;
        sketchLine(
          ctx, rand, heel.x, heel.y,
          x + half * Math.cos(angle + Math.PI / 2), y + half * Math.sin(angle + Math.PI / 2),
        );
      }
      ctx.stroke();
      return;
    }
    case "triangle":
    case "triangleOutline": {
      const a = at(-1, 0.42);
      const b = at(1, 0.42);
      ctx.moveTo(x, y);
      ctx.lineTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.closePath();
      break;
    }
    case "diamond":
    case "diamondOutline": {
      const a = at(-1, 0.5, size * 0.62);
      const b = at(1, 0.5, size * 0.62);
      const tail = back(size * 1.1);
      ctx.moveTo(x, y);
      ctx.lineTo(a.x, a.y);
      ctx.lineTo(tail.x, tail.y);
      ctx.lineTo(b.x, b.y);
      ctx.closePath();
      break;
    }
    case "dot":
    case "circle": {
      const r = size * 0.34;
      const c = back(r);
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      break;
    }
  }
  if (hollow) ctx.fillStyle = paper;
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.stroke();
};

const DASHES = {
  dashed: (w: number) => [w * 4 + 4, w * 2.5 + 4],
  dotted: (w: number) => [0.1, w * 2.4 + 2],
};

/* --------------------------------- Shapes --------------------------------- */

const roundedRect = (ctx: CanvasRenderingContext2D, b: Box, radius: number) => {
  const r = Math.max(0, Math.min(radius, b.w / 2, b.h / 2));
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, r);
};

const tracePath = (ctx: CanvasRenderingContext2D, s: Shape) => {
  switch (s.type) {
    case "rect":
      roundedRect(ctx, s, cornerRadius(s));
      break;
    case "ellipse":
      ctx.beginPath();
      ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
      break;
    case "diamond":
      ctx.beginPath();
      ctx.moveTo(s.x + s.w / 2, s.y);
      ctx.lineTo(s.x + s.w, s.y + s.h / 2);
      ctx.lineTo(s.x + s.w / 2, s.y + s.h);
      ctx.lineTo(s.x, s.y + s.h / 2);
      ctx.closePath();
      break;
  }
};

/** Set the context's alignment and return the x to draw text at inside `box`. */
const alignText = (
  ctx: CanvasRenderingContext2D, box: Box, align: TextAlign, pad: number,
) => {
  ctx.textAlign = align;
  return align === "left" ? box.x + pad : align === "right" ? box.x + box.w - pad : box.x + box.w / 2;
};

const drawLabel = (ctx: CanvasRenderingContext2D, s: Shape, theme: Theme) => {
  if (!s.text) return;
  const lines = wrapText(s.text, s.fontSize, Math.max(20, s.w - LABEL_PADDING * 2), s.font);
  const lineHeight = s.fontSize * LINE_HEIGHT;
  ctx.font = fontOf(s.fontSize, s.font);
  ctx.textBaseline = "middle";
  ctx.fillStyle = s.type === "note" ? "#2b2410" : resolveColor(s.stroke, theme);
  const x = alignText(ctx, s, s.align ?? "center", LABEL_PADDING);
  const top = s.y + s.h / 2 - (lines.length * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, x, top + lineHeight * (i + 0.5)));
};

export type DrawOptions = {
  theme: Theme;
  /** The canvas colour behind the shapes. Left out, the theme's default. */
  bg?: string;
  /** Draw the dot grid. Left out, it is drawn. */
  grid?: boolean;
  /** The shape whose text is being edited in the overlay: skip drawing it. */
  editingId?: string | null;
  /** For a table being edited: the one cell whose text to skip. */
  editingCell?: Cell | null;
  onImageLoad: () => void;
};

export const drawShape = (ctx: CanvasRenderingContext2D, s: Shape, o: DrawOptions) => {
  const stroke = resolveColor(s.stroke, o.theme);
  const rand = seeded(hashId(s.id));
  ctx.save();
  ctx.globalAlpha = s.opacity;
  // Sketched outlines are drawn twice, so each pass is a little lighter.
  ctx.lineWidth = s.type === "draw" ? s.strokeWidth : s.strokeWidth * 0.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  rough = ROUGH[s.rough ?? 1];
  // A dashed outline is drawn once: two overlapping passes would fill the
  // gaps. A neat outline is one clean pass too.
  const dashed = s.dash === "dashed" || s.dash === "dotted";
  const passes = dashed || s.rough === 0 ? 1 : 2;
  if (passes === 1 && s.type !== "draw") ctx.lineWidth = s.strokeWidth;
  if (dashed) ctx.setLineDash(DASHES[s.dash as "dashed" | "dotted"](s.strokeWidth));
  if (s.rotation && !isLine(s)) {
    const c = centerOf(s);
    ctx.translate(c.x, c.y);
    ctx.rotate(s.rotation);
    ctx.translate(-c.x, -c.y);
  }

  switch (s.type) {
    case "rect":
    case "ellipse":
    case "diamond": {
      tracePath(ctx, s);
      if (s.fill !== NONE) {
        const color = resolveColor(s.fill, o.theme);
        ctx.save();
        ctx.setLineDash([]);
        if (s.fillStyle === "hachure") {
          // Hatching: sketched diagonals, clipped to the clean shape.
          ctx.clip();
          ctx.strokeStyle = color;
          ctx.globalAlpha = s.opacity * 0.75;
          ctx.lineWidth = Math.max(1, s.strokeWidth * 0.55);
          hachure(ctx, seeded(hashId(s.id) ^ 0x9e3779b9), s, 7 + s.strokeWidth * 1.5);
        } else {
          const soft = o.theme === "dark" ? 0.3 : 0.16;
          ctx.globalAlpha = s.opacity * (s.fillStyle === "solid" ? 0.85 : soft);
          ctx.fillStyle = color;
          ctx.fill();
        }
        ctx.restore();
      }
      // The outline is sketched; the fill above used the clean shape.
      ctx.beginPath();
      if (s.type === "rect" && s.round) {
        sketchRoundRect(ctx, rand, s, cornerRadius(s), passes);
      } else if (s.type === "rect") {
        sketchPolygon(ctx, rand, [s.x, s.y, s.x + s.w, s.y, s.x + s.w, s.y + s.h, s.x, s.y + s.h], passes);
      } else if (s.type === "diamond") {
        sketchPolygon(ctx, rand, [
          s.x + s.w / 2, s.y, s.x + s.w, s.y + s.h / 2,
          s.x + s.w / 2, s.y + s.h, s.x, s.y + s.h / 2,
        ], passes);
      } else {
        sketchEllipse(ctx, rand, s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, passes);
      }
      ctx.stroke();
      if (o.editingId !== s.id) drawLabel(ctx, s, o.theme);
      break;
    }
    case "note": {
      // A paper square lifting off the board: a soft shadow that is deeper
      // underneath, and a bottom corner curling up.
      const fold = Math.max(8, Math.min(26, Math.min(s.w, s.h) * 0.16));
      const paper = s.fill === NONE ? "#ffe066" : mixWithWhite(s.fill);
      const right = s.x + s.w;
      const bottom = s.y + s.h;
      const sheet = () => {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(right, s.y);
        ctx.lineTo(right, bottom - fold);
        ctx.lineTo(right - fold, bottom);
        ctx.lineTo(s.x, bottom);
        ctx.closePath();
      };
      sheet();
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.26)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 9;
      ctx.fillStyle = paper;
      ctx.fill();
      ctx.restore();

      // Paper, not plastic: a darker strip where the glue is, light falling
      // off towards the bottom, and a grain of specks and short fibres. The
      // grain is seeded by the note's id, so each note has its own and it
      // never shimmers.
      ctx.save();
      sheet();
      ctx.clip();
      const tint = (alpha: number, color: string) => {
        ctx.globalAlpha = s.opacity * alpha;
        ctx.fillStyle = color;
      };
      tint(0.055, "#000");
      ctx.fillRect(s.x, s.y, s.w, Math.min(24, s.h * 0.15));
      for (let band = 0; band < 4; band++) {
        tint(0.014, "#000");
        ctx.fillRect(s.x, s.y + s.h * (0.55 + band * 0.11), s.w, s.h);
      }
      tint(0.1, "#fff");
      ctx.fillRect(s.x, s.y, s.w, 1.2);
      const grain = seeded(hashId(s.id) ^ 0x51ed27);
      const specks = Math.min(260, Math.round((s.w * s.h) / 190));
      for (let i = 0; i < specks; i++) {
        const gx = s.x + grain() * s.w;
        const gy = s.y + grain() * s.h;
        tint(0.04 + grain() * 0.06, grain() < 0.6 ? "#000" : "#fff");
        // Most are specks; about one in five is a short fibre.
        if (grain() < 0.2) ctx.fillRect(gx, gy, 3 + grain() * 6, 0.7);
        else ctx.fillRect(gx, gy, 0.8 + grain(), 0.8 + grain());
      }
      ctx.restore();
      // The curled corner: the back of the paper, a shade darker.
      ctx.beginPath();
      ctx.moveTo(right - fold, bottom);
      ctx.lineTo(right, bottom - fold);
      ctx.lineTo(right - fold * 0.82, bottom - fold * 0.82);
      ctx.closePath();
      ctx.save();
      ctx.fillStyle = paper;
      ctx.fill();
      ctx.globalAlpha = s.opacity * 0.16;
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.restore();
      if (o.editingId !== s.id) drawLabel(ctx, s, o.theme);
      break;
    }
    case "line":
    case "arrow": {
      const ex = s.x + s.w;
      const ey = s.y + s.h;
      ctx.beginPath();
      if (s.route === "curve" && s.mid?.length) {
        // A flowing line: each pass runs smoothly through slightly
        // different points, so the two passes part and meet like a pen's.
        const nodes = lineNodes(s);
        const wobble = 1.3 * rough;
        for (let pass = 0; pass < passes; pass++) {
          const pts = splinePoints(
            nodes.map((n) => ({ x: n.x + (rand() - 0.5) * 2 * wobble, y: n.y + (rand() - 0.5) * 2 * wobble })),
          );
          pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        }
      } else if (s.route !== "elbow" && s.bend && !s.mid?.length) {
        const c = curveControl(s);
        sketchCurve(ctx, rand, s.x, s.y, c.x, c.y, ex, ey, passes);
      } else {
        const pts = linePath(s);
        for (let i = 0; i + 1 < pts.length; i++) {
          sketchLine(ctx, rand, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, passes);
        }
      }
      ctx.stroke();

      // Ends are always drawn solid, whatever the line's own pattern.
      ctx.setLineDash([]);
      ctx.lineWidth = s.strokeWidth * 0.8;
      const size = Math.min(10 + s.strokeWidth * 3, Math.hypot(s.w, s.h) * 0.6);
      const paper = o.bg ?? CANVAS_BG[o.theme];
      drawHead(ctx, rand, headOf(s, "end"), ex, ey, endAngle(s, "end"), size, paper);
      drawHead(ctx, rand, headOf(s, "start"), s.x, s.y, endAngle(s, "start"), size, paper);

      if (s.text && o.editingId !== s.id && lineHoldsLabel(s)) {
        // The label sits on the line, on a patch of canvas colour.
        const mid = lineMid(s);
        const lines = wrapText(s.text, s.fontSize, lineLabelWidth(s), s.font);
        const lineHeight = s.fontSize * LINE_HEIGHT;
        ctx.font = fontOf(s.fontSize, s.font);
        const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const height = lines.length * lineHeight;
        ctx.fillStyle = o.bg ?? CANVAS_BG[o.theme];
        ctx.fillRect(mid.x - width / 2 - 6, mid.y - height / 2 - 2, width + 12, height + 4);
        ctx.fillStyle = stroke;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        lines.forEach((line, i) =>
          ctx.fillText(line, mid.x, mid.y - height / 2 + lineHeight * (i + 0.5)),
        );
      }
      break;
    }
    case "frame": {
      // A frame is a calm, clean outline: it organises, it is not content.
      ctx.setLineDash([]);
      ctx.globalAlpha = s.opacity * 0.55;
      ctx.lineWidth = 1.5;
      roundedRect(ctx, s, 8);
      ctx.stroke();
      if (o.editingId !== s.id) {
        ctx.globalAlpha = s.opacity * 0.8;
        ctx.font = fontOf(14);
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(s.text || "Frame", s.x + 2, s.y - FRAME_TITLE_HEIGHT / 2);
      }
      break;
    }
    case "draw": {
      const p = s.points ?? [];
      if (p.length < 2) break;
      ctx.beginPath();
      if (p.length === 2) {
        ctx.arc(s.x + p[0], s.y + p[1], s.strokeWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = stroke;
        ctx.fill();
        break;
      }
      // A broad stroke is a highlighter: flat-ended, like a chisel tip.
      if (s.strokeWidth >= 14) ctx.lineCap = "butt";
      ctx.moveTo(s.x + p[0], s.y + p[1]);
      // Smooth the stroke: curve through the midpoints of consecutive samples.
      for (let i = 2; i + 3 < p.length; i += 2) {
        const mx = (p[i] + p[i + 2]) / 2;
        const my = (p[i + 1] + p[i + 3]) / 2;
        ctx.quadraticCurveTo(s.x + p[i], s.y + p[i + 1], s.x + mx, s.y + my);
      }
      ctx.lineTo(s.x + p[p.length - 2], s.y + p[p.length - 1]);
      ctx.stroke();
      break;
    }
    case "text": {
      if (o.editingId === s.id) break;
      const lineHeight = s.fontSize * LINE_HEIGHT;
      ctx.font = fontOf(s.fontSize, s.font);
      ctx.textBaseline = "middle";
      ctx.fillStyle = stroke;
      const x = alignText(ctx, s, s.align ?? "left", 0);
      s.text.split("\n").forEach((line, i) => ctx.fillText(line, x, s.y + lineHeight * (i + 0.5)));
      break;
    }
    case "table": {
      const cols = s.cols ?? [];
      const rows = s.rows ?? [];
      if (!cols.length || !rows.length) break;
      // Header row: a soft band of the table's own colour.
      ctx.save();
      ctx.globalAlpha = s.opacity * (o.theme === "dark" ? 0.22 : 0.1);
      ctx.fillStyle = stroke;
      ctx.fillRect(s.x, s.y, s.w, rows[0]);
      if (s.fill !== NONE) {
        ctx.fillStyle = resolveColor(s.fill, o.theme);
        ctx.fillRect(s.x, s.y, s.w, s.h);
      }
      ctx.restore();

      ctx.beginPath();
      sketchPolygon(ctx, rand, [s.x, s.y, s.x + s.w, s.y, s.x + s.w, s.y + s.h, s.x, s.y + s.h], passes);
      let x = s.x;
      for (let c = 0; c < cols.length - 1; c++) {
        x += cols[c];
        sketchLine(ctx, rand, x, s.y, x, s.y + s.h);
      }
      let y = s.y;
      for (let r = 0; r < rows.length - 1; r++) {
        y += rows[r];
        sketchLine(ctx, rand, s.x, y, s.x + s.w, y);
      }
      ctx.stroke();

      const lineHeight = s.fontSize * LINE_HEIGHT;
      ctx.font = fontOf(s.fontSize, s.font);
      ctx.textBaseline = "middle";
      ctx.fillStyle = stroke;
      const editing = o.editingId === s.id ? o.editingCell : null;
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < cols.length; c++) {
          const text = s.cells?.[r]?.[c];
          if (!text || (editing && editing.r === r && editing.c === c)) continue;
          const box = cellBox(s, { r, c });
          const lines = wrapText(text, s.fontSize, Math.max(10, box.w - CELL_PADDING * 2), s.font);
          const top = box.y + box.h / 2 - (lines.length * lineHeight) / 2;
          const tx = alignText(ctx, box, s.align ?? "center", CELL_PADDING);
          lines.forEach((line, i) => ctx.fillText(line, tx, top + lineHeight * (i + 0.5)));
        }
      }
      break;
    }
    case "image": {
      const img = s.src ? imageFor(s.src, o.onImageLoad) : null;
      if (!img) {
        roundedRect(ctx, s, 6);
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1;
        ctx.stroke();
        break;
      }
      // Formulas are rendered in dark ink: flip them on a dark canvas.
      if (s.latex && o.theme === "dark") ctx.filter = "invert(1) hue-rotate(180deg)";
      ctx.drawImage(img, s.x, s.y, s.w, s.h);
      break;
    }
  }
  ctx.restore();
};

/** Sticky notes use a pastel of their colour. */
const mixWithWhite = (hex: string) => {
  if (hex === INK) return "#e9ecf1";
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.55);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
};

/* ---------------------------------- Scene --------------------------------- */

export type SceneOverlay = {
  selected: readonly Shape[];
  /** A shape an arrow end is about to attach to. */
  bindTarget: Shape | null;
  /** Alignment lines shown while a move is snapping. */
  guides: readonly Guide[];
  marquee: Box | null;
  /** "Add a connected shape" buttons around the selected box. */
  quick: readonly { x: number; y: number }[];
  laser: TrailPoint[];
  /** Where the eraser has just been. */
  eraser: TrailPoint[];
  now: number;
};

export type TrailPoint = { x: number; y: number; t: number };

export const LASER_FADE_MS = 900;
export const ERASER_FADE_MS = 280;

/**
 * A fading stroke that follows the pointer. It is drawn as one smooth curve
 * through the midpoints of the samples, thinning towards its tail.
 */
const drawTrail = (
  ctx: CanvasRenderingContext2D, trail: TrailPoint[], now: number, fade: number, z: number,
  color: string, width: number, glow: number,
) => {
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  const mid = (a: TrailPoint, b: TrailPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  for (let i = 1; i < trail.length; i++) {
    const life = 1 - (now - trail[i].t) / fade;
    if (life <= 0) continue;
    // Each piece runs between two midpoints and bends at the sample itself.
    const from = i === 1 ? trail[0] : mid(trail[i - 2], trail[i - 1]);
    const to = i === trail.length - 1 ? trail[i] : mid(trail[i - 1], trail[i]);
    ctx.globalAlpha = Math.min(1, life * 1.4);
    ctx.lineWidth = (width * (0.35 + 0.65 * life)) / z;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    if (i === 1) ctx.lineTo(to.x, to.y);
    else ctx.quadraticCurveTo(trail[i - 1].x, trail[i - 1].y, to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
};
/** How far above a shape its rotate handle sits, in screen pixels. */
export const ROTATE_HANDLE_OFFSET = 26;

export const drawScene = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  camera: Camera,
  shapes: readonly Shape[],
  overlay: SceneOverlay,
  o: DrawOptions,
) => {
  const { z } = camera;
  const paper = o.bg ?? CANVAS_BG[o.theme];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);

  // Dot grid, in screen space so the dots stay crisp.
  const step = 24 * z;
  if (step >= 12 && o.grid !== false) {
    ctx.fillStyle = o.theme === "dark" ? "rgba(255,255,255,0.09)" : "rgba(20,30,50,0.11)";
    const ox = ((-camera.x * z) % step + step) % step;
    const oy = ((-camera.y * z) % step + step) % step;
    for (let x = ox; x < width; x += step) {
      for (let y = oy; y < height; y += step) ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
    }
  }

  ctx.setTransform(dpr * z, 0, 0, dpr * z, -camera.x * z * dpr, -camera.y * z * dpr);

  const view: Box = { x: camera.x, y: camera.y, w: width / z, h: height / z };
  for (const s of shapes) {
    const b = bounds(s);
    const pad = s.strokeWidth + 20;
    if (
      b.x - pad > view.x + view.w || b.x + b.w + pad < view.x ||
      b.y - pad > view.y + view.h || b.y + b.h + pad < view.y
    ) {
      continue;
    }
    drawShape(ctx, s, o);
  }

  // Selection outlines and handles.
  const accent = ACCENT[o.theme];
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5 / z;
  const pad = 4 / z;
  const outline = (s: Shape, grow: number) => {
    const c = centerOf(s);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(s.rotation ?? 0);
    ctx.strokeRect(-s.w / 2 - grow, -s.h / 2 - grow, s.w + grow * 2, s.h + grow * 2);
    ctx.restore();
  };
  const knob = (x: number, y: number, round: boolean) => {
    const size = 9 / z;
    ctx.beginPath();
    ctx.roundRect(x - size / 2, y - size / 2, size, size, round ? size / 2 : 2 / z);
    ctx.fill();
    ctx.stroke();
  };

  if (overlay.bindTarget) {
    ctx.save();
    ctx.lineWidth = 3 / z;
    ctx.globalAlpha = 0.6;
    outline(overlay.bindTarget, 6 / z);
    ctx.restore();
  }

  for (const s of overlay.selected) if (!isLine(s)) outline(s, pad);
  ctx.fillStyle = paper;
  if (overlay.selected.some((s) => s.locked)) {
    // Locked: outlined only, with nothing to grab.
  } else if (overlay.selected.length === 1) {
    const s = overlay.selected[0];
    if (canRotate(s)) {
      // Rotate handle on a short stem above the shape.
      const top = rotateHandleOf(s, pad);
      const grip = rotateHandleOf(s, ROTATE_HANDLE_OFFSET / z);
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(grip.x, grip.y);
      ctx.stroke();
      knob(grip.x, grip.y, true);
    }
    for (const h of isLine(s) ? lineNodes(s) : handlesOf(s)) knob(h.x, h.y, isLine(s));
    if (isLine(s)) {
      // Small dots mark where the line can be pulled: between two points
      // to add a new one, or on an elbow's jog to slide it.
      ctx.save();
      ctx.fillStyle = accent;
      for (const mid of s.route === "elbow" ? [lineMid(s)] : segmentMids(s)) {
        ctx.beginPath();
        ctx.arc(mid.x, mid.y, 4 / z, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  } else if (overlay.selected.length > 1) {
    // Several shapes: one box around them all, resized as a whole.
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const s of overlay.selected) {
      const b = bounds(s);
      x1 = Math.min(x1, b.x);
      y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.w);
      y2 = Math.max(y2, b.y + b.h);
    }
    const box = { x: x1 - pad * 2, y: y1 - pad * 2, w: x2 - x1 + pad * 4, h: y2 - y1 + pad * 4 };
    ctx.setLineDash([5 / z, 4 / z]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.setLineDash([]);
    for (const h of boxCorners(box)) knob(h.x, h.y, false);
  }

  for (const q of overlay.quick) {
    const r = 8 / z;
    const arm = 3.5 / z;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = paper;
    ctx.lineWidth = 1.2 / z;
    ctx.beginPath();
    ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(q.x - arm, q.y);
    ctx.lineTo(q.x + arm, q.y);
    ctx.moveTo(q.x, q.y - arm);
    ctx.lineTo(q.x, q.y + arm);
    ctx.stroke();
    ctx.restore();
  }

  if (overlay.guides.length) {
    ctx.save();
    ctx.strokeStyle = "#f0468a";
    ctx.lineWidth = 1 / z;
    ctx.beginPath();
    for (const g of overlay.guides) {
      ctx.moveTo(g.x1, g.y1);
      ctx.lineTo(g.x2, g.y2);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (overlay.marquee) {
    ctx.fillStyle = o.theme === "dark" ? "rgba(138,180,255,0.12)" : "rgba(37,99,235,0.08)";
    ctx.fillRect(overlay.marquee.x, overlay.marquee.y, overlay.marquee.w, overlay.marquee.h);
    ctx.strokeRect(overlay.marquee.x, overlay.marquee.y, overlay.marquee.w, overlay.marquee.h);
  }

  // Pointer trails: they fade out and are never saved.
  drawTrail(
    ctx, overlay.eraser, overlay.now, ERASER_FADE_MS, z,
    o.theme === "dark" ? "rgba(255,255,255,0.35)" : "rgba(30,40,60,0.28)", 9, 0,
  );
  drawTrail(ctx, overlay.laser, overlay.now, LASER_FADE_MS, z, "#ff3b3b", 5, 8);
};

export { hasLabel };
