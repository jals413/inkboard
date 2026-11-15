import { isLine, type Shape } from "./types";

export type Box = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

export const centerOf = (s: Box): Point => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });

export const rotatePoint = (p: Point, c: Point, angle: number): Point => {
  if (!angle) return p;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
};

/** A world point expressed in the shape's own unrotated frame. */
export const toLocal = (s: Shape, p: Point): Point =>
  s.rotation ? rotatePoint(p, centerOf(s), -s.rotation) : p;

const cornersOf = (s: Shape): Point[] => {
  const c = centerOf(s);
  return [
    { x: s.x, y: s.y },
    { x: s.x + s.w, y: s.y },
    { x: s.x + s.w, y: s.y + s.h },
    { x: s.x, y: s.y + s.h },
  ].map((p) => rotatePoint(p, c, s.rotation ?? 0));
};

/** Axis-aligned bounds with positive size (the outer box of a rotated shape). */
export const bounds = (s: Shape): Box => {
  if (isLine(s)) {
    if (!s.bend && !s.mid?.length) {
      return {
        x: Math.min(s.x, s.x + s.w),
        y: Math.min(s.y, s.y + s.h),
        w: Math.abs(s.w),
        h: Math.abs(s.h),
      };
    }
    const pts = linePath(s);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (!s.rotation) return { x: s.x, y: s.y, w: s.w, h: s.h };
  const pts = cornersOf(s);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

export const unionBounds = (shapes: readonly Shape[]): Box | null => {
  if (shapes.length === 0) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const s of shapes) {
    const b = bounds(s);
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
};

export const boxesIntersect = (a: Box, b: Box) =>
  a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;

export const normalizeBox = (x1: number, y1: number, x2: number, y2: number): Box => ({
  x: Math.min(x1, x2),
  y: Math.min(y1, y2),
  w: Math.abs(x2 - x1),
  h: Math.abs(y2 - y1),
});

export const boxCorners = (b: Box): Point[] => [
  { x: b.x, y: b.y },
  { x: b.x + b.w, y: b.y },
  { x: b.x + b.w, y: b.y + b.h },
  { x: b.x, y: b.y + b.h },
];

export const distToSegment = (
  px: number, py: number, x1: number, y1: number, x2: number, y2: number,
) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
};

/** Is the world point on the shape? `tol` is in world units. */
export const hitShape = (s: Shape, wx: number, wy: number, tol: number): boolean => {
  if (isLine(s)) {
    const pts = linePath(s);
    const reach = tol + s.strokeWidth / 2;
    for (let i = 0; i + 1 < pts.length; i++) {
      if (distToSegment(wx, wy, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= reach) return true;
    }
    return false;
  }
  if (s.type === "frame") {
    // A frame is hollow: only its border and its title pick it, so shapes
    // inside stay clickable.
    const onTitle =
      wx >= s.x && wx <= s.x + Math.min(s.w, 220) && wy >= s.y - FRAME_TITLE_HEIGHT && wy <= s.y;
    const inOuter = wx >= s.x - tol && wx <= s.x + s.w + tol && wy >= s.y - tol && wy <= s.y + s.h + tol;
    const inInner = wx > s.x + tol && wx < s.x + s.w - tol && wy > s.y + tol && wy < s.y + s.h - tol;
    return onTitle || (inOuter && !inInner);
  }
  const { x: px, y: py } = toLocal(s, { x: wx, y: wy });
  if (px < s.x - tol || px > s.x + s.w + tol || py < s.y - tol || py > s.y + s.h + tol) {
    return false;
  }
  const hw = s.w / 2 || 1;
  const hh = s.h / 2 || 1;
  const dx = (px - (s.x + s.w / 2)) / (hw + tol);
  const dy = (py - (s.y + s.h / 2)) / (hh + tol);
  switch (s.type) {
    case "ellipse":
      return dx * dx + dy * dy <= 1;
    case "diamond":
      return Math.abs(dx) + Math.abs(dy) <= 1;
    case "draw": {
      const p = s.points ?? [];
      const reach = tol + s.strokeWidth / 2;
      if (p.length === 2) return Math.hypot(px - s.x - p[0], py - s.y - p[1]) <= reach;
      for (let i = 0; i + 3 < p.length; i += 2) {
        if (
          distToSegment(px, py, s.x + p[i], s.y + p[i + 1], s.x + p[i + 2], s.y + p[i + 3]) <= reach
        ) {
          return true;
        }
      }
      return false;
    }
    default:
      return true;
  }
};

/**
 * Resize handles in world space. Box shapes: nw, ne, se, sw (rotated with
 * the shape). Lines: start, end.
 */
export const handlesOf = (s: Shape): Point[] =>
  isLine(s)
    ? [
        { x: s.x, y: s.y },
        { x: s.x + s.w, y: s.y + s.h },
      ]
    : cornersOf(s);

/** Tables and frames stay upright, so they do not rotate. */
export const canRotate = (s: Shape) => !isLine(s) && s.type !== "table" && s.type !== "frame";

/** Where the rotate handle sits: above the top edge, `offset` world units out. */
export const rotateHandleOf = (s: Shape, offset: number): Point =>
  rotatePoint({ x: s.x + s.w / 2, y: s.y - offset }, centerOf(s), s.rotation ?? 0);

/** Scale the size-dependent parts of a shape from `original` to w × h. */
const scaleContents = (original: Shape, next: Shape) => {
  if (original.w <= 0 || original.h <= 0) return;
  const sx = next.w / original.w;
  const sy = next.h / original.h;
  if (original.type === "draw" && original.points) {
    next.points = original.points.map((v, i) => (i % 2 === 0 ? v * sx : v * sy));
  }
  if (original.type === "table") {
    next.cols = original.cols?.map((v) => v * sx);
    next.rows = original.rows?.map((v) => v * sy);
  }
  if (original.type === "text") next.fontSize = Math.max(6, original.fontSize * sy);
};

/** The shape resized by dragging `handle` to the world point (px, py). */
export const resizeShape = (
  original: Shape, handle: number, px: number, py: number, keepAspect: boolean,
): Shape => {
  if (isLine(original)) {
    if (handle !== 0) return { ...original, w: px - original.x, h: py - original.y };
    // Moving the start: the points in between stay where they are.
    return {
      ...original,
      x: px,
      y: py,
      w: original.x + original.w - px,
      h: original.y + original.h - py,
      mid: shiftMid(original.mid, original.x - px, original.y - py),
    };
  }
  // The corner opposite the dragged one stays put, in world space. Work in
  // the shape's own axes so this is the same for rotated shapes.
  const angle = original.rotation ?? 0;
  const opposite = handlesOf(original)[(handle + 2) % 4];
  const v = rotatePoint({ x: px - opposite.x, y: py - opposite.y }, { x: 0, y: 0 }, -angle);
  let w = Math.abs(v.x);
  let h = Math.abs(v.y);
  if ((keepAspect || original.type === "text") && original.w > 0 && original.h > 0) {
    const scale = Math.max(w / original.w, h / original.h, 0.05);
    w = original.w * scale;
    h = original.h * scale;
  }
  w = Math.max(w, 4);
  h = Math.max(h, 4);
  const half = rotatePoint(
    { x: (Math.sign(v.x) || 1) * w / 2, y: (Math.sign(v.y) || 1) * h / 2 },
    { x: 0, y: 0 },
    angle,
  );
  const cx = opposite.x + half.x;
  const cy = opposite.y + half.y;
  const next: Shape = { ...original, x: cx - w / 2, y: cy - h / 2, w, h };
  scaleContents(original, next);
  return next;
};

/**
 * Scale a shape uniformly by `scale` about the fixed world point `anchor`.
 * Used to resize a group or multi-selection as one.
 */
export const scaleShape = (original: Shape, anchor: Point, scale: number): Shape => {
  const next: Shape = {
    ...original,
    x: anchor.x + (original.x - anchor.x) * scale,
    y: anchor.y + (original.y - anchor.y) * scale,
    w: original.w * scale,
    h: original.h * scale,
  };
  if (isLine(original)) {
    if (original.bend) next.bend = original.bend * scale;
    if (original.mid) next.mid = original.mid.map((v) => v * scale);
    return next;
  }
  scaleContents(original, next);
  if (original.type !== "text") next.fontSize = Math.max(6, original.fontSize * scale);
  return next;
};

/* ------------------------------ Arrow binding ----------------------------- */

/**
 * The point on a shape's outline facing `toward`, pushed `gap` units out.
 * This is where an arrow attached to the shape should end.
 */
export const edgePoint = (s: Shape, toward: Point, gap: number): Point => {
  const c = centerOf(s);
  const local = toLocal(s, toward);
  let dx = local.x - c.x;
  let dy = local.y - c.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) {
    dx = 1;
    dy = 0;
  } else {
    dx /= len;
    dy /= len;
  }
  const hw = Math.max(s.w / 2, 1);
  const hh = Math.max(s.h / 2, 1);
  let t: number;
  if (s.type === "ellipse") {
    t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  } else if (s.type === "diamond") {
    t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  } else {
    t = Math.min(hw / (Math.abs(dx) || 1e-9), hh / (Math.abs(dy) || 1e-9));
  }
  const out = { x: c.x + dx * (t + gap), y: c.y + dy * (t + gap) };
  return rotatePoint(out, c, s.rotation ?? 0);
};

const BIND_GAP = 6;

/**
 * Re-aim every bound arrow at its shapes. Returns the same array when
 * nothing moved, so callers can cheaply tell.
 */
export const applyBindings = (shapes: Shape[]): Shape[] => {
  if (!shapes.some((s) => s.startBind || s.endBind || s.elbowAcross !== undefined)) return shapes;
  const byId = new Map(shapes.map((s) => [s.id, s]));
  let changed = false;
  const next = shapes.map((s) => {
    if (!s.startBind && !s.endBind) {
      // A line that has let go of its shapes routes by its own ends again.
      if (s.elbowAcross === undefined) return s;
      changed = true;
      return { ...s, elbowAcross: undefined };
    }
    const from = s.startBind ? byId.get(s.startBind) : undefined;
    const to = s.endBind ? byId.get(s.endBind) : undefined;
    // A binding to a shape that no longer exists is dropped.
    const startBind = from ? s.startBind : undefined;
    const endBind = to ? s.endBind : undefined;
    let start = { x: s.x, y: s.y };
    let end = { x: s.x + s.w, y: s.y + s.h };
    // Each end aims at the next point along the line: the far end, or the
    // nearest point in between when there are any.
    const nodes = lineNodes(s);
    const inner = s.route !== "elbow" && nodes.length > 2;
    const a = inner ? nodes[nodes.length - 2] : from ? centerOf(from) : start;
    const b = inner ? nodes[1] : to ? centerOf(to) : end;
    let elbowAcross: boolean | undefined;
    if (s.route === "elbow") {
      // A right-angled arrow leaves and arrives square-on, at the middle of
      // a side, rather than aiming at the other shape's centre.
      const far = 1e6;
      const across = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
      elbowAcross = from || to ? across : undefined;
      const dir = across
        ? { x: Math.sign(b.x - a.x) || 1, y: 0 }
        : { x: 0, y: Math.sign(b.y - a.y) || 1 };
      if (from) start = edgePoint(from, { x: a.x + dir.x * far, y: a.y + dir.y * far }, BIND_GAP);
      if (to) end = edgePoint(to, { x: b.x - dir.x * far, y: b.y - dir.y * far }, BIND_GAP);
    } else {
      if (from) start = edgePoint(from, b, BIND_GAP);
      if (to) end = edgePoint(to, a, BIND_GAP);
    }
    const moved =
      Math.abs(start.x - s.x) > 0.01 || Math.abs(start.y - s.y) > 0.01 ||
      Math.abs(end.x - (s.x + s.w)) > 0.01 || Math.abs(end.y - (s.y + s.h)) > 0.01;
    if (
      !moved && startBind === s.startBind && endBind === s.endBind &&
      elbowAcross === s.elbowAcross
    ) {
      return s;
    }
    changed = true;
    return {
      ...s, startBind, endBind, elbowAcross,
      x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y,
      mid: shiftMid(s.mid, s.x - start.x, s.y - start.y),
    };
  });
  return changed ? next : shapes;
};

/* --------------------------------- Snapping -------------------------------- */

export type Guide = { x1: number; y1: number; x2: number; y2: number };

/**
 * Nudge a moving box so its edges or centre line up with nearby shapes.
 * Returns the correction to add to the move, and the guide lines to show.
 */
export const snapBox = (moving: Box, others: readonly Box[], threshold: number) => {
  const guides: Guide[] = [];
  const axis = (horizontal: boolean) => {
    const pos = (b: Box) => (horizontal ? [b.x, b.x + b.w / 2, b.x + b.w] : [b.y, b.y + b.h / 2, b.y + b.h]);
    let best = threshold;
    let fix = 0;
    let match: { at: number; other: Box } | null = null;
    for (const other of others) {
      for (const target of pos(other)) {
        for (const mine of pos(moving)) {
          const diff = target - mine;
          if (Math.abs(diff) < best) {
            best = Math.abs(diff);
            fix = diff;
            match = { at: target, other };
          }
        }
      }
    }
    if (match) {
      const o = match.other;
      if (horizontal) {
        guides.push({
          x1: match.at, x2: match.at,
          y1: Math.min(o.y, moving.y), y2: Math.max(o.y + o.h, moving.y + moving.h),
        });
      } else {
        guides.push({
          y1: match.at, y2: match.at,
          x1: Math.min(o.x, moving.x), x2: Math.max(o.x + o.w, moving.x + moving.w),
        });
      }
    }
    return fix;
  };
  return { dx: axis(true), dy: axis(false), guides };
};

/* --------------------------------- Tables --------------------------------- */

export type Cell = { r: number; c: number };

const offsetOf = (sizes: readonly number[], index: number) => {
  let at = 0;
  for (let i = 0; i < index; i++) at += sizes[i];
  return at;
};

/** The box of one table cell, in world space. */
export const cellBox = (s: Shape, cell: Cell): Box => ({
  x: s.x + offsetOf(s.cols ?? [], cell.c),
  y: s.y + offsetOf(s.rows ?? [], cell.r),
  w: s.cols?.[cell.c] ?? 0,
  h: s.rows?.[cell.r] ?? 0,
});

/** Which cell of the table is under the world point, if any. */
export const cellAt = (s: Shape, px: number, py: number): Cell | null => {
  const find = (sizes: readonly number[], offset: number) => {
    let at = 0;
    for (let i = 0; i < sizes.length; i++) {
      at += sizes[i];
      if (offset <= at) return i;
    }
    return -1;
  };
  const c = find(s.cols ?? [], px - s.x);
  const r = find(s.rows ?? [], py - s.y);
  return px >= s.x && py >= s.y && r >= 0 && c >= 0 ? { r, c } : null;
};

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

/** Recompute a table's overall size from its columns and rows. */
export const fitTable = (s: Shape): Shape => ({ ...s, w: sum(s.cols ?? []), h: sum(s.rows ?? []) });

/* ------------------------------- Line routes ------------------------------ */

const CURVE_STEPS = 18;

/** Unit normal of a line's start-to-end direction. */
const normalOf = (s: Shape): Point => {
  const len = Math.hypot(s.w, s.h) || 1;
  return { x: -s.h / len, y: s.w / len };
};

/** Control point of a bowed line: the curve passes `bend` to the side of its middle. */
export const curveControl = (s: Shape): Point => {
  const n = normalOf(s);
  const bend = s.bend ?? 0;
  return { x: s.x + s.w / 2 + n.x * bend * 2, y: s.y + s.h / 2 + n.y * bend * 2 };
};

/** In-between points moved by (dx, dy): used when a line's start moves under them. */
const shiftMid = (mid: number[] | undefined, dx: number, dy: number) =>
  mid?.length && (dx || dy) ? mid.map((v, i) => v + (i % 2 === 0 ? dx : dy)) : mid;

/** The points a line is defined by: its start, any points in between, its end. */
export const lineNodes = (s: Shape): Point[] => {
  const nodes: Point[] = [{ x: s.x, y: s.y }];
  const mid = s.route === "elbow" ? [] : (s.mid ?? []);
  for (let i = 0; i + 1 < mid.length; i += 2) nodes.push({ x: s.x + mid[i], y: s.y + mid[i + 1] });
  nodes.push({ x: s.x + s.w, y: s.y + s.h });
  return nodes;
};

const SPLINE_STEPS = 12;

/** A smooth curve through every node (Catmull-Rom), as closely spaced points. */
export const splinePoints = (nodes: readonly Point[]): Point[] => {
  if (nodes.length < 3) return [...nodes];
  const out: Point[] = [nodes[0]];
  for (let i = 0; i + 1 < nodes.length; i++) {
    const p0 = nodes[Math.max(0, i - 1)];
    const p1 = nodes[i];
    const p2 = nodes[i + 1];
    const p3 = nodes[Math.min(nodes.length - 1, i + 2)];
    for (let step = 1; step <= SPLINE_STEPS; step++) {
      const t = step / SPLINE_STEPS;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (p2.x - p0.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (p2.y - p0.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
};

/** The points a line passes through, whatever its route. */
export const linePath = (s: Shape): Point[] => {
  const start = { x: s.x, y: s.y };
  const end = { x: s.x + s.w, y: s.y + s.h };
  if (s.route === "elbow") {
    // Leave and arrive along the longer axis, with one jog between: halfway
    // unless the jog has been dragged somewhere else.
    const at = s.elbowAt ?? 0.5;
    if (elbowIsAcross(s)) {
      const mx = s.x + s.w * at;
      return [start, { x: mx, y: start.y }, { x: mx, y: end.y }, end];
    }
    const my = s.y + s.h * at;
    return [start, { x: start.x, y: my }, { x: end.x, y: my }, end];
  }
  if (s.mid?.length) return s.route === "curve" ? splinePoints(lineNodes(s)) : lineNodes(s);
  if (!s.bend) return [start, end];
  const c = curveControl(s);
  const pts: Point[] = [];
  for (let i = 0; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    pts.push({
      x: u * u * start.x + 2 * u * t * c.x + t * t * end.x,
      y: u * u * start.y + 2 * u * t * c.y + t * t * end.y,
    });
  }
  return pts;
};

/** Whether an elbow line leaves sideways (true) or up and down (false). */
export const elbowIsAcross = (s: Shape) => s.elbowAcross ?? Math.abs(s.w) >= Math.abs(s.h);

/** How long a line is, measured along its route. */
export const lineLength = (s: Shape) => {
  const pts = linePath(s);
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return total;
};

/** The point halfway along a run of points. */
const halfway = (pts: readonly Point[]): Point => {
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  let left = total / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (left <= len && len > 0) {
      const t = left / len;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
    }
    left -= len;
  }
  return pts[pts.length - 1];
};

/** The middle of a line along its route: where its label sits. */
export const lineMid = (s: Shape): Point => {
  const pts = linePath(s);
  if (s.route === "elbow") return { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 };
  return halfway(pts);
};

/**
 * The middle of each stretch between two neighbouring nodes: where a new
 * point can be pulled out of the line.
 */
export const segmentMids = (s: Shape): Point[] => {
  if (s.route === "elbow") return [];
  const nodes = lineNodes(s);
  if (s.bend && nodes.length === 2) return [lineMid(s)];
  if (s.route !== "curve" || nodes.length < 3) {
    return nodes.slice(1).map((n, i) => ({ x: (nodes[i].x + n.x) / 2, y: (nodes[i].y + n.y) / 2 }));
  }
  const pts = splinePoints(nodes);
  return nodes.slice(1).map((_, i) => halfway(pts.slice(i * SPLINE_STEPS, (i + 1) * SPLINE_STEPS + 1)));
};

/** The bend a line needs for its middle to pass through the world point. */
export const bendToward = (s: Shape, p: Point): number => {
  const n = normalOf(s);
  return (p.x - (s.x + s.w / 2)) * n.x + (p.y - (s.y + s.h / 2)) * n.y;
};

/** The direction a line is travelling as it reaches an end, in radians. */
export const endAngle = (s: Shape, end: "start" | "end"): number => {
  const pts = linePath(s);
  const ordered = end === "end" ? pts : [...pts].reverse();
  const tip = ordered[ordered.length - 1];
  // Walk back to the first point far enough away to give a stable direction.
  for (let i = ordered.length - 2; i >= 0; i--) {
    const dx = tip.x - ordered[i].x;
    const dy = tip.y - ordered[i].y;
    if (Math.hypot(dx, dy) > 0.5) return Math.atan2(dy, dx);
  }
  return 0;
};

/* --------------------------------- Frames --------------------------------- */

export const FRAME_TITLE_HEIGHT = 26;

/** The shapes a frame carries with it: those whose centre lies inside it. */
export const frameChildren = (frame: Shape, shapes: readonly Shape[]): Shape[] =>
  shapes.filter((s) => {
    if (s.id === frame.id || s.type === "frame") return false;
    const c = centerOf(bounds(s));
    return c.x >= frame.x && c.x <= frame.x + frame.w && c.y >= frame.y && c.y <= frame.y + frame.h;
  });

/* --------------------------- Align and distribute -------------------------- */

export type AlignMode = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

/** How far each shape must move to line up; keyed by shape id. */
export const alignOffsets = (shapes: readonly Shape[], mode: AlignMode) => {
  const all = unionBounds(shapes)!;
  const out = new Map<string, Point>();
  for (const s of shapes) {
    const b = bounds(s);
    let dx = 0;
    let dy = 0;
    if (mode === "left") dx = all.x - b.x;
    if (mode === "right") dx = all.x + all.w - (b.x + b.w);
    if (mode === "centerX") dx = all.x + all.w / 2 - (b.x + b.w / 2);
    if (mode === "top") dy = all.y - b.y;
    if (mode === "bottom") dy = all.y + all.h - (b.y + b.h);
    if (mode === "centerY") dy = all.y + all.h / 2 - (b.y + b.h / 2);
    out.set(s.id, { x: dx, y: dy });
  }
  return out;
};

/** Offsets that space shapes evenly between the outermost two. */
export const distributeOffsets = (shapes: readonly Shape[], axis: "x" | "y") => {
  const out = new Map<string, Point>();
  const size = (b: Box) => (axis === "x" ? b.w : b.h);
  const pos = (b: Box) => (axis === "x" ? b.x : b.y);
  const sorted = [...shapes].sort((a, b) => pos(bounds(a)) - pos(bounds(b)));
  if (sorted.length < 3) return out;
  const first = bounds(sorted[0]);
  const last = bounds(sorted[sorted.length - 1]);
  const total = sorted.reduce((n, s) => n + size(bounds(s)), 0);
  const gap = (pos(last) + size(last) - pos(first) - total) / (sorted.length - 1);
  let at = pos(first);
  for (const s of sorted) {
    const b = bounds(s);
    const d = at - pos(b);
    out.set(s.id, axis === "x" ? { x: d, y: 0 } : { x: 0, y: d });
    at += size(b) + gap;
  }
  return out;
};
