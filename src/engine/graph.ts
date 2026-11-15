// Graphs: boxes joined by arrows, laid out in layers and turned into loosedraw
// shapes. It also reads Mermaid flowchart syntax into such a graph (no AI and
// no Mermaid library; other Mermaid diagram kinds are not supported).
//
// This file has no browser dependencies, so the SDK and the MCP server use
// it as it is. Whoever calls it says how text is measured.

import { DEFAULT_STYLE, INK, NONE, uid, type Shape, type ShapeType } from "./types";

type Node = {
  id: string;
  text: string;
  type: ShapeType;
  stroke?: string;
  fill?: string;
  w: number;
  h: number;
  x: number;
  y: number;
};
type Edge = {
  from: string;
  to: string;
  label: string;
  dash?: "dotted" | "dashed";
  thick: boolean;
  head: boolean;
  startHead: boolean;
};
type Subgraph = { title: string; nodes: Set<string> };
export type Direction = "TD" | "BT" | "LR" | "RL";

/** A graph ready to lay out: what parseMermaid returns and the SDK builds. */
export type Graph = {
  direction: Direction;
  nodes: Map<string, Node>;
  edges: Edge[];
  subgraphs: Subgraph[];
};

/** How big text is. The app measures with the canvas; the SDK estimates. */
export type Measurer = {
  measure: (text: string, fontSize: number) => { w: number; h: number };
  wrap: (text: string, fontSize: number, maxWidth: number) => string[];
};

// These two match the app's label layout (render.ts).
const LABEL_PADDING = 12;
const LINE_HEIGHT = 1.3;

/** A measurer that needs no canvas: it estimates from character counts. */
export const estimateText: Measurer = {
  measure: (text, fontSize) => {
    const lines = text.split("\n");
    return {
      w: Math.max(2, ...lines.map((l) => l.length * fontSize * 0.56)),
      h: lines.length * fontSize * LINE_HEIGHT,
    };
  },
  wrap: (text, fontSize, maxWidth) => {
    const perLine = Math.max(1, Math.floor(maxWidth / (fontSize * 0.56)));
    const out: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && candidate.length > perLine) {
          out.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      out.push(line);
    }
    return out;
  },
};

const FONT_SIZE = 16;
const MAX_NODE_WIDTH = 240;
const NODE_GAP = 48;

/** Node brackets, longest first, with the shape each one becomes. */
const BRACKETS: [open: string, close: string, type: ShapeType][] = [
  ["([", "])", "ellipse"],
  ["((", "))", "ellipse"],
  ["[[", "]]", "rect"],
  ["[(", ")]", "rect"],
  ["{{", "}}", "diamond"],
  ["[/", "/]", "rect"],
  ["[\\", "\\]", "rect"],
  ["[/", "\\]", "rect"],
  ["[\\", "/]", "rect"],
  ["[", "]", "rect"],
  ["(", ")", "rect"],
  ["{", "}", "diamond"],
  [">", "]", "rect"],
];

const ID = /^[\wÀ-￿]+/;
/** `-- text -->`, `== text ==>`, `-. text .->` */
const EDGE_WITH_TEXT = /^\s*(--|==|-\.)\s+(.+?)\s+(?:-{2,}|={2,}|\.+-)(>|o|x)?\s*/;
/** `-->`, `---`, `-.->`, `==>`, `<-->`, each with an optional `|label|` */
const EDGE = /^\s*(<)?(-{2,}|={2,}|-\.+-)(>|o|x)?\s*(?:\|([^|]*)\|)?\s*/;

const clean = (text: string) =>
  text.trim().replace(/^"([\s\S]*)"$/, "$1").replace(/<br\s*\/?>/gi, "\n").trim();

export const looksLikeMermaid = (text: string) => /^\s*(graph|flowchart)\b/i.test(text);

export const parseMermaid = (source: string): Graph => {
  const lines = source
    .split(/\n|;/)
    .map((l) => l.replace(/%%.*$/, "").trim())
    .filter(Boolean);
  const header = /^(graph|flowchart)\b\s*(TD|TB|BT|LR|RL)?/i.exec(lines[0] ?? "");
  if (!header) {
    throw new Error("Only Mermaid flowcharts are supported. Start with “flowchart TD” or “graph LR”.");
  }
  const raw = (header[2] ?? "TD").toUpperCase();
  const direction: Direction = raw === "TB" ? "TD" : (raw as Direction);

  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];
  const subgraphs: Subgraph[] = [];
  const open: Subgraph[] = [];

  const touch = (id: string, text?: string, type?: ShapeType) => {
    let node = nodes.get(id);
    if (!node) {
      node = { id, text: id, type: "rect", w: 0, h: 0, x: 0, y: 0 };
      nodes.set(id, node);
    }
    if (text !== undefined) node.text = text || id;
    if (type) node.type = type;
    for (const sub of open) sub.nodes.add(id);
  };

  /** Read one node at the start of `rest`; returns its id and what follows. */
  const readNode = (rest: string): [string, string] | null => {
    const match = ID.exec(rest);
    if (!match) return null;
    const id = match[0];
    let after = rest.slice(id.length);
    for (const [opener, closer, type] of BRACKETS) {
      if (!after.startsWith(opener)) continue;
      const body = after.slice(opener.length);
      // Quoted text may itself contain brackets.
      const from = body.startsWith('"') ? body.indexOf('"', 1) + 1 : 0;
      const end = body.indexOf(closer, from);
      if (end < 0) continue;
      touch(id, clean(body.slice(0, end)), type);
      return [id, body.slice(end + closer.length)];
    }
    touch(id);
    // Drop a `:::className` suffix.
    after = after.replace(/^:::[\w-]+/, "");
    return [id, after];
  };

  /** Read `A & B & C`. */
  const readGroup = (rest: string): [string[], string] | null => {
    const ids: string[] = [];
    let current = rest.trimStart();
    for (;;) {
      const node = readNode(current);
      if (!node) return ids.length ? [ids, current] : null;
      ids.push(node[0]);
      const amp = /^\s*&\s*/.exec(node[1]);
      if (!amp) return [ids, node[1]];
      current = node[1].slice(amp[0].length);
    }
  };

  for (const line of lines.slice(1)) {
    if (/^(style|classDef|class|click|linkStyle|direction)\b/.test(line)) continue;
    const sub = /^subgraph\s+(.*)$/.exec(line);
    if (sub) {
      const titled = /^[\w-]+\s*\[(.*)\]$/.exec(sub[1]);
      const entry = { title: clean(titled ? titled[1] : sub[1]), nodes: new Set<string>() };
      subgraphs.push(entry);
      open.push(entry);
      continue;
    }
    if (line === "end") {
      open.pop();
      continue;
    }
    let group = readGroup(line);
    if (!group) throw new Error(`Could not read this line: “${line}”`);
    for (;;) {
      const [from, rest] = group;
      let edge: Omit<Edge, "from" | "to">;
      let after: string;
      const texted = EDGE_WITH_TEXT.exec(rest);
      const plain = texted ? null : EDGE.exec(rest);
      if (texted) {
        edge = {
          label: clean(texted[2]),
          dash: texted[1] === "-." ? "dotted" : undefined,
          thick: texted[1] === "==",
          head: !!texted[3],
          startHead: false,
        };
        after = rest.slice(texted[0].length);
      } else if (plain) {
        edge = {
          label: clean(plain[4] ?? ""),
          dash: plain[2].includes(".") ? "dotted" : undefined,
          thick: plain[2].startsWith("="),
          head: !!plain[3],
          startHead: !!plain[1],
        };
        after = rest.slice(plain[0].length);
      } else {
        if (rest.trim()) throw new Error(`Could not read this line: “${line}”`);
        break;
      }
      const next = readGroup(after);
      if (!next) throw new Error(`An arrow leads nowhere in: “${line}”`);
      for (const a of from) for (const b of next[0]) if (a !== b) edges.push({ ...edge, from: a, to: b });
      group = next;
    }
  }
  if (nodes.size === 0) throw new Error("The flowchart has no nodes yet.");
  return { direction, nodes, edges, subgraphs };
};

/** Give every node a layer (its distance from the start) and a place in it. */
const layout = (nodes: Map<string, Node>, edges: Edge[], direction: Direction, text: Measurer) => {
  const horizontal = direction === "LR" || direction === "RL";
  for (const n of nodes.values()) {
    const size = text.measure(n.text, FONT_SIZE);
    let w = Math.min(MAX_NODE_WIDTH, Math.max(110, size.w + 44));
    const lines = text.wrap(n.text, FONT_SIZE, w - LABEL_PADDING * 2).length;
    let h = Math.max(56, lines * FONT_SIZE * LINE_HEIGHT + 30);
    // Round and pointed shapes need more room around the same text.
    if (n.type === "diamond") [w, h] = [w * 1.45, h * 1.6];
    if (n.type === "ellipse") [w, h] = [w * 1.15, h * 1.15];
    n.w = Math.round(w);
    n.h = Math.round(h);
  }

  // Layers: the longest path from a start node. Edges that close a loop
  // are found by a depth-first walk and left out of the ranking.
  const out = new Map<string, string[]>();
  for (const e of edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const state = new Map<string, 1 | 2>();
  const loops = new Set<string>();
  const order: string[] = [];
  const visit = (id: string) => {
    state.set(id, 1);
    for (const to of out.get(id) ?? []) {
      if (state.get(to) === 1) loops.add(`${id}>${to}`);
      else if (!state.has(to)) visit(to);
    }
    state.set(id, 2);
    order.unshift(id);
  };
  for (const id of nodes.keys()) if (!state.has(id)) visit(id);
  const forward = edges.filter((e) => !loops.has(`${e.from}>${e.to}`));
  const rank = new Map<string, number>([...nodes.keys()].map((id) => [id, 0]));
  for (const id of order) {
    for (const e of forward) if (e.from === id) rank.set(e.to, Math.max(rank.get(e.to)!, rank.get(id)! + 1));
  }

  const layers: Node[][] = [];
  for (const n of nodes.values()) (layers[rank.get(n.id)!] ??= []).push(n);

  // Fewer crossings: sort each layer by the average position of its
  // neighbours in the layer before, sweeping down and back up.
  const index = new Map<string, number>();
  const reindex = () => layers.forEach((layer) => layer.forEach((n, i) => index.set(n.id, i)));
  reindex();
  const neighbours = (id: string, towards: number) =>
    forward
      .filter((e) => (e.from === id && rank.get(e.to) === towards) || (e.to === id && rank.get(e.from) === towards))
      .map((e) => (e.from === id ? e.to : e.from));
  for (let sweep = 0; sweep < 4; sweep++) {
    const down = sweep % 2 === 0;
    for (let i = down ? 1 : layers.length - 2; i >= 0 && i < layers.length; i += down ? 1 : -1) {
      const weight = (n: Node) => {
        const near = neighbours(n.id, i + (down ? -1 : 1));
        return near.length ? near.reduce((sum, id) => sum + index.get(id)!, 0) / near.length : index.get(n.id)!;
      };
      const weights = new Map(layers[i].map((n) => [n.id, weight(n)]));
      layers[i].sort((a, b) => weights.get(a.id)! - weights.get(b.id)!);
      reindex();
    }
  }

  // Positions. `along` runs through the layers, `across` within one.
  const across = (n: Node) => (horizontal ? n.h : n.w);
  const along = (n: Node) => (horizontal ? n.w : n.h);
  const layerGap = edges.some((e) => e.label) ? 104 : 76;
  const centre = new Map<string, number>();
  let offset = 0;
  layers.forEach((layer, i) => {
    // Each node aims to sit under the middle of its parents.
    const wanted = layer.map((n) => {
      const parents = neighbours(n.id, i - 1);
      return parents.length ? parents.reduce((sum, id) => sum + centre.get(id)!, 0) / parents.length : null;
    });
    const placed: number[] = [];
    layer.forEach((n, k) => {
      const least = k === 0 ? -Infinity : placed[k - 1] + (across(layer[k - 1]) + across(n)) / 2 + NODE_GAP;
      placed.push(Math.max(wanted[k] ?? (k === 0 ? 0 : least), least));
    });
    // Pushing nodes apart drifts them one way: shift the layer back.
    const targets = layer.map((_, k) => wanted[k] ?? placed[k]);
    const drift =
      wanted.some((w) => w !== null)
        ? placed.reduce((sum, p, k) => sum + p - targets[k], 0) / placed.length
        : (placed[0] + placed[placed.length - 1]) / 2;
    const thickness = Math.max(...layer.map(along));
    layer.forEach((n, k) => {
      const c = placed[k] - drift;
      centre.set(n.id, c);
      const a = offset + (thickness - along(n)) / 2;
      if (horizontal) [n.x, n.y] = [a, c - n.h / 2];
      else [n.x, n.y] = [c - n.w / 2, a];
    });
    offset += thickness + layerGap;
  });

  // Bottom-to-top and right-to-left are the same layout, mirrored.
  if (direction === "BT") for (const n of nodes.values()) n.y = -n.y - n.h;
  if (direction === "RL") for (const n of nodes.values()) n.x = -n.x - n.w;
};

/** Lay a graph out and build its shapes: frames, then boxes, then arrows. */
export const graphToShapes = ({ direction, nodes, edges, subgraphs }: Graph, text: Measurer): Shape[] => {
  layout(nodes, edges, direction, text);

  const base = { ...DEFAULT_STYLE, stroke: INK, fill: NONE, opacity: 1, fontSize: FONT_SIZE, text: "" };
  const ids = new Map([...nodes.keys()].map((id) => [id, uid()]));

  const boxes: Shape[] = [...nodes.values()].map((n) => ({
    ...base,
    id: ids.get(n.id)!,
    type: n.type,
    x: n.x,
    y: n.y,
    w: n.w,
    h: n.h,
    text: n.text,
    stroke: n.stroke ?? INK,
    fill: n.fill ?? NONE,
  }));

  const arrows: Shape[] = edges.map((e) => {
    const a = nodes.get(e.from)!;
    const b = nodes.get(e.to)!;
    const from = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    return {
      ...base,
      id: uid(),
      type: "arrow",
      // Rough ends: attaching to the two boxes places them exactly.
      x: from.x,
      y: from.y,
      w: b.x + b.w / 2 - from.x,
      h: b.y + b.h / 2 - from.y,
      text: e.label,
      fontSize: 14,
      strokeWidth: e.thick ? 3.5 : 2,
      dash: e.dash,
      startBind: ids.get(e.from),
      endBind: ids.get(e.to),
      endHead: e.head ? undefined : "none",
      startHead: e.startHead ? "arrow" : undefined,
      // Two arrows between the same pair, one each way, bow apart.
      bend: edges.some((o) => o.from === e.to && o.to === e.from) ? 34 : undefined,
    };
  });

  // A subgraph becomes a frame around its nodes. Outer frames come first,
  // so they sit behind the ones nested in them.
  const frames: Shape[] = subgraphs
    .filter((sub) => sub.nodes.size > 0)
    .map((sub) => {
      const inside = [...sub.nodes].map((id) => nodes.get(id)!);
      const pad = 28;
      const x = Math.min(...inside.map((n) => n.x)) - pad;
      const y = Math.min(...inside.map((n) => n.y)) - pad;
      return {
        ...base,
        id: uid(),
        type: "frame" as const,
        x,
        y,
        w: Math.max(...inside.map((n) => n.x + n.w)) + pad - x,
        h: Math.max(...inside.map((n) => n.y + n.h)) + pad - y,
        text: sub.title || "Group",
      };
    })
    .sort((a, b) => b.w * b.h - a.w * a.h);

  return [...frames, ...boxes, ...arrows];
};
