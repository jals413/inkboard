// The Loosedraw SDK: build a scene in code, then save it as an .loosedraw file
// or open it in the app with a link. It runs anywhere JavaScript does (Node,
// Deno, Bun, the browser) and has no dependencies.
//
//   const scene = new Scene("Sign-in flow");
//   const ids = scene.graph({
//     nodes: [{ id: "a", text: "Start", shape: "ellipse" }, { id: "b", text: "Signed in?" , shape: "diamond" }],
//     edges: [{ from: "a", to: "b" }],
//   });
//   scene.note({ x: 300, y: 0, text: "Remember the edge cases" });
//   fs.writeFileSync("flow.loosedraw", scene.toJSON());

import { applyBindings, unionBounds } from "../../src/engine/geom";
import {
  estimateText,
  graphToShapes,
  parseMermaid,
  type Direction,
  type Graph,
} from "../../src/engine/graph";
import { INK, NONE, NOTE_FILL, uid, type Head, type Shape, type ShapeType } from "../../src/engine/types";
import { LIBRARY } from "../../src/library";

export type { Shape } from "../../src/engine/types";
export type { Direction } from "../../src/engine/graph";

export type Point = { x: number; y: number };

/** A palette name, or any CSS hex colour such as "#0ea5e9". */
export type Color = "ink" | "red" | "orange" | "green" | "blue" | "purple" | "yellow" | (string & {});

const PALETTE: Record<string, string> = {
  ink: INK,
  red: "#e03131",
  orange: "#f08c00",
  green: "#2f9e44",
  blue: "#1c7ed6",
  purple: "#7048e8",
  yellow: NOTE_FILL,
};
const color = (value: Color | undefined, fallback: string) =>
  value === undefined ? fallback : (PALETTE[value] ?? value);

export type BoxOptions = {
  x: number;
  y: number;
  /** Left out, the box is sized to fit its text. */
  w?: number;
  h?: number;
  text?: string;
  /** Outline and text colour. */
  color?: Color;
  /** Fill colour; left out, the box is see-through. */
  fill?: Color;
  fillStyle?: "tint" | "hachure" | "solid";
  dash?: "solid" | "dashed" | "dotted";
  strokeWidth?: number;
  fontSize?: number;
  font?: "hand" | "sans" | "mono";
  opacity?: number;
};

export type LineOptions = {
  /** A shape id (the line attaches to it and follows it) or a point. */
  from: string | Point;
  to: string | Point;
  label?: string;
  color?: Color;
  dash?: "solid" | "dashed" | "dotted";
  strokeWidth?: number;
  /** Route with right angles instead of straight. */
  elbow?: boolean;
  startHead?: Head;
  endHead?: Head;
};

export type GraphNode = {
  id: string;
  text?: string;
  shape?: "rect" | "ellipse" | "diamond" | "note";
  color?: Color;
  fill?: Color;
};

export type GraphEdge = {
  from: string;
  to: string;
  label?: string;
  style?: "solid" | "dashed" | "dotted" | "thick";
  /** False draws a plain line with no arrowhead. */
  arrow?: boolean;
};

export type GraphOptions = {
  /** TD is top-down (the default); also BT, LR and RL. */
  direction?: Direction;
  nodes: GraphNode[];
  edges?: GraphEdge[];
  /** Named frames drawn around sets of nodes. */
  groups?: { title: string; nodes: string[] }[];
  /** Where the top-left of the laid-out graph goes. Default: below what is already there. */
  at?: Point;
};

const FILE_VERSION = 1;

export class Scene {
  /** Every shape, in drawing order. Plain data: read or edit it freely. */
  shapes: Shape[] = [];

  constructor(public name = "Untitled") {}

  private add(type: ShapeType, patch: Partial<Shape>): string {
    const shape: Shape = {
      id: uid(),
      type,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      stroke: INK,
      fill: NONE,
      strokeWidth: 2,
      opacity: 1,
      text: "",
      fontSize: 18,
      ...patch,
    };
    // A frame sits behind what it holds.
    if (type === "frame") this.shapes.unshift(shape);
    else this.shapes.push(shape);
    return shape.id;
  }

  private box(type: ShapeType, o: BoxOptions, min: { w: number; h: number }): string {
    const fontSize = o.fontSize ?? 18;
    const text = o.text ?? "";
    let w = o.w;
    if (w === undefined) w = Math.max(min.w, Math.min(280, estimateText.measure(text, fontSize).w + 44));
    const lines = estimateText.wrap(text, fontSize, w - 24).length;
    const h = o.h ?? Math.max(min.h, lines * fontSize * 1.3 + 30);
    return this.add(type, {
      x: o.x,
      y: o.y,
      w,
      h,
      text,
      fontSize,
      stroke: color(o.color, INK),
      fill: color(o.fill, type === "note" ? NOTE_FILL : NONE),
      fillStyle: o.fillStyle,
      dash: o.dash === "solid" ? undefined : o.dash,
      strokeWidth: o.strokeWidth ?? 2,
      font: o.font,
      opacity: o.opacity ?? 1,
    });
  }

  /** Each of these returns the new shape's id, to connect lines to. */
  rect(o: BoxOptions) { return this.box("rect", o, { w: 120, h: 60 }); }
  ellipse(o: BoxOptions) { return this.box("ellipse", o, { w: 130, h: 66 }); }
  diamond(o: BoxOptions) { return this.box("diamond", o, { w: 150, h: 100 }); }
  note(o: BoxOptions) { return this.box("note", o, { w: 180, h: 180 }); }

  text(o: { x: number; y: number; text: string; fontSize?: number; color?: Color; font?: "hand" | "sans" | "mono" }) {
    const fontSize = o.fontSize ?? 18;
    return this.add("text", {
      x: o.x,
      y: o.y,
      text: o.text,
      fontSize,
      font: o.font,
      stroke: color(o.color, INK),
      // An estimate; the app measures the text properly when it opens the scene.
      ...estimateText.measure(o.text, fontSize),
    });
  }

  /** A named region. Shapes inside it move with it in the app. */
  frame(o: { x: number; y: number; w: number; h: number; title?: string }) {
    return this.add("frame", { x: o.x, y: o.y, w: o.w, h: o.h, text: o.title ?? "Frame" });
  }

  /** A table; the first row is drawn as its header. */
  table(o: { x: number; y: number; cells: string[][]; fontSize?: number }) {
    const fontSize = o.fontSize ?? 16;
    const columns = Math.max(...o.cells.map((row) => row.length));
    const cells = o.cells.map((row) => Array.from({ length: columns }, (_, i) => String(row[i] ?? "")));
    const cols = Array.from({ length: columns }, (_, c) =>
      Math.min(320, Math.max(90, ...cells.map((row) => estimateText.measure(row[c], fontSize).w + 28))),
    );
    const rows = cells.map((row) =>
      Math.max(40, ...row.map((cell, c) => estimateText.wrap(cell, fontSize, cols[c] - 20).length * fontSize * 1.3 + 16)),
    );
    return this.add("table", {
      x: o.x,
      y: o.y,
      cells,
      cols,
      rows,
      fontSize,
      w: cols.reduce((a, b) => a + b, 0),
      h: rows.reduce((a, b) => a + b, 0),
    });
  }

  private connect(type: "line" | "arrow", o: LineOptions): string {
    const end = (target: string | Point) => {
      if (typeof target !== "string") return { point: target, bind: undefined };
      const shape = this.shapes.find((s) => s.id === target);
      if (!shape) throw new Error(`No shape with id "${target}" to connect to.`);
      return { point: { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 }, bind: shape.id };
    };
    const from = end(o.from);
    const to = end(o.to);
    return this.add(type, {
      x: from.point.x,
      y: from.point.y,
      w: to.point.x - from.point.x,
      h: to.point.y - from.point.y,
      startBind: from.bind,
      endBind: to.bind,
      text: o.label ?? "",
      fontSize: 14,
      stroke: color(o.color, INK),
      dash: o.dash === "solid" ? undefined : o.dash,
      strokeWidth: o.strokeWidth ?? 2,
      route: o.elbow ? "elbow" : undefined,
      startHead: o.startHead,
      endHead: o.endHead,
    });
  }

  /** An arrow between two shapes (by id) or points. */
  arrow(o: LineOptions) { return this.connect("arrow", o); }
  /** A line with no arrowhead. */
  line(o: LineOptions) { return this.connect("line", o); }

  /** Place shapes made by graph() or mermaid() and report their ids. */
  private place(shapes: Shape[], at?: Point) {
    const box = unionBounds(shapes);
    const taken = unionBounds(this.shapes);
    if (box) {
      const target = at ?? { x: taken ? taken.x : 0, y: taken ? taken.y + taken.h + 80 : 0 };
      for (const s of shapes) {
        s.x += target.x - box.x;
        s.y += target.y - box.y;
      }
    }
    this.shapes.push(...shapes.filter((s) => s.type !== "frame"));
    this.shapes.unshift(...shapes.filter((s) => s.type === "frame"));
  }

  /**
   * Boxes joined by arrows, laid out automatically. Give positions to
   * nothing: say what connects to what. Returns the shape id for each node id.
   */
  graph(o: GraphOptions): Record<string, string> {
    const graph: Graph = { direction: o.direction ?? "TD", nodes: new Map(), edges: [], subgraphs: [] };
    for (const n of o.nodes) {
      graph.nodes.set(n.id, {
        id: n.id,
        text: n.text ?? n.id,
        type: n.shape ?? "rect",
        stroke: n.color === undefined ? undefined : color(n.color, INK),
        fill: n.fill === undefined ? (n.shape === "note" ? NOTE_FILL : undefined) : color(n.fill, NONE),
        w: 0, h: 0, x: 0, y: 0,
      });
    }
    for (const e of o.edges ?? []) {
      for (const id of [e.from, e.to]) {
        if (!graph.nodes.has(id)) throw new Error(`An edge refers to "${id}", which is not in nodes.`);
      }
      if (e.from === e.to) continue;
      graph.edges.push({
        from: e.from,
        to: e.to,
        label: e.label ?? "",
        dash: e.style === "dotted" || e.style === "dashed" ? e.style : undefined,
        thick: e.style === "thick",
        head: e.arrow !== false,
        startHead: false,
      });
    }
    for (const g of o.groups ?? []) {
      graph.subgraphs.push({ title: g.title, nodes: new Set(g.nodes.filter((id) => graph.nodes.has(id))) });
    }
    const shapes = graphToShapes(graph, estimateText);
    // graphToShapes emits frames, then one box per node in order, then arrows.
    const boxes = shapes.filter((s) => s.type !== "frame" && s.type !== "arrow");
    const ids: Record<string, string> = {};
    [...graph.nodes.keys()].forEach((id, i) => (ids[id] = boxes[i].id));
    this.place(shapes, o.at);
    return ids;
  }

  /** Add a Mermaid flowchart ("flowchart TD …" or "graph LR …"). */
  mermaid(source: string, at?: Point) {
    this.place(graphToShapes(parseMermaid(source), estimateText), at);
  }

  /** Every ready-made item in Loosedraw's shape library, by pack. */
  static library(): { pack: string; items: string[] }[] {
    return LIBRARY.map((pack) => ({ pack: pack.name, items: pack.items.map((item) => item.name) }));
  }

  /**
   * Add a ready-made item from the shape library (see Scene.library()), with
   * its top-left corner at (x, y). Returns the id of its main shape, to
   * connect arrows to.
   */
  libraryItem(name: string, at: Point): string {
    const wanted = name.trim().toLowerCase();
    const item = LIBRARY.flatMap((pack) => pack.items).find((it) => it.name.toLowerCase() === wanted);
    if (!item) throw new Error(`No library item called "${name}". Scene.library() lists them.`);
    const box = unionBounds(item.shapes)!;
    // An item is several shapes: they get fresh ids and stay together as a group.
    const groupId = item.shapes.length > 1 ? uid() : undefined;
    const copies = item.shapes.map((s) => ({
      ...s,
      id: uid(),
      groupId,
      x: s.x + at.x - box.x,
      y: s.y + at.y - box.y,
    }));
    this.shapes.push(...copies);
    // The main shape is the biggest one that an arrow can attach to.
    const solid = copies.filter((s) => s.type !== "line" && s.type !== "arrow" && s.type !== "draw" && s.type !== "text");
    const main = (solid.length ? solid : copies).reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    return main.id;
  }

  /** The scene as the text of an .loosedraw file. */
  toJSON(): string {
    // Attached arrows are trimmed to the edges of the shapes they join.
    const shapes = applyBindings(this.shapes);
    return JSON.stringify({ type: "loosedraw", version: FILE_VERSION, name: this.name, shapes }, null, 2);
  }

  /**
   * A link that opens this scene as a new scene in the Loosedraw app. The
   * scene travels in the link itself, after the #, so it is never sent to
   * a server.
   */
  toLink(appUrl: string, into: "new" | "current" = "new"): string {
    const bytes = new TextEncoder().encode(JSON.stringify(JSON.parse(this.toJSON())));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    // "current" adds the shapes to whichever scene is open in the app.
    return `${appUrl.replace(/#.*$/, "")}#${into === "current" ? "add" : "scene"}=${encoded}`;
  }
}
