// Converts an .excalidraw file into Loosedraw shapes, so people can bring
// their existing drawings with them. Reads the public file format only.

import { measureText } from "./render";
import { INK, NONE, uid, type Shape, type ShapeType } from "./types";

type Element = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  containerId?: string | null;
  points?: [number, number][];
  fileId?: string | null;
  groupIds?: string[];
  angle?: number;
  roundness?: unknown;
};

type File = { type?: string; elements?: Element[]; files?: Record<string, { dataURL?: string }> };

const BOXES: Record<string, ShapeType> = {
  rectangle: "rect",
  ellipse: "ellipse",
  diamond: "diamond",
};

// Their default near-black and near-white inks become our theme-aware ink.
const INKS = new Set(["#1e1e1e", "#000000", "#1b1b1f", "#ffffff"]);
const stroke = (color?: string) => (!color || INKS.has(color.toLowerCase()) ? INK : color);
const fill = (color?: string) => (!color || color === "transparent" ? NONE : color);
// Their thin and default weights both read as our default; bolder stays bold.
const weight = (w = 2) => (w <= 2 ? 2 : w <= 3 ? 3.5 : 6);

export const isExcalidrawFile = (json: unknown): json is File =>
  (json as File)?.type === "excalidraw" && Array.isArray((json as File).elements);

export const importExcalidraw = (file: File): Shape[] => {
  const elements = (file.elements ?? []).filter((el) => !el.isDeleted);
  // Text bound to a container becomes that shape's label.
  const labels = new Map<string, Element>();
  for (const el of elements) {
    if (el.type === "text" && el.containerId) labels.set(el.containerId, el);
  }
  const groups = new Map<string, string>();
  const shapes: Shape[] = [];

  for (const el of elements) {
    const outer = el.groupIds?.at(-1);
    const base = {
      id: uid(),
      x: el.x,
      y: el.y,
      w: el.width,
      h: el.height,
      stroke: stroke(el.strokeColor),
      fill: NONE,
      strokeWidth: weight(el.strokeWidth),
      opacity: (el.opacity ?? 100) / 100,
      text: "",
      fontSize: 18,
      groupId: outer ? (groups.get(outer) ?? groups.set(outer, uid()).get(outer)) : undefined,
      rotation: el.angle || undefined,
    };

    if (BOXES[el.type]) {
      const label = labels.get(el.id);
      shapes.push({
        ...base,
        type: BOXES[el.type],
        fill: fill(el.backgroundColor),
        text: label?.text ?? "",
        fontSize: label?.fontSize ?? 18,
      });
    } else if ((el.type === "arrow" || el.type === "line") && el.points?.length) {
      const [sx, sy] = el.points[0];
      const [ex, ey] = el.points[el.points.length - 1];
      // Points between the ends come across too; a rounded line stays curved.
      const mid = el.points.slice(1, -1).flatMap(([px, py]) => [px - sx, py - sy]);
      shapes.push({
        ...base,
        type: el.type,
        x: el.x + sx,
        y: el.y + sy,
        w: ex - sx,
        h: ey - sy,
        mid: mid.length ? mid : undefined,
        route: mid.length && el.roundness ? "curve" : undefined,
      });
    } else if (el.type === "freedraw" && el.points?.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [px, py] of el.points) {
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
      shapes.push({
        ...base,
        type: "draw",
        x: el.x + minX,
        y: el.y + minY,
        w: maxX - minX,
        h: maxY - minY,
        points: el.points.flatMap(([px, py]) => [px - minX, py - minY]),
      });
    } else if (el.type === "text" && !el.containerId && el.text) {
      const fontSize = el.fontSize ?? 18;
      shapes.push({ ...base, type: "text", text: el.text, fontSize, ...measureText(el.text, fontSize) });
    } else if (el.type === "image" && el.fileId) {
      const src = file.files?.[el.fileId]?.dataURL;
      if (src) shapes.push({ ...base, type: "image", src, naturalH: el.height });
    }
  }
  return shapes;
};
