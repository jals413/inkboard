#!/usr/bin/env node
// The Inkboard MCP server: lets any AI tool that speaks the Model Context
// Protocol draw on Inkboard. Each tool builds a scene with the SDK, saves it
// as an .inkboard file, and (unless told not to) opens it in the app.
//
// Settings, as environment variables:
//   INKBOARD_URL  where the app runs       (default http://localhost:5173)
//   INKBOARD_DIR  where files are written  (default ~/Inkboard)

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Scene } from "../sdk/dist/index.js";

const APP_URL = process.env.INKBOARD_URL ?? "http://localhost:5173";
const OUT_DIR = process.env.INKBOARD_DIR ?? join(homedir(), "Inkboard");
/** Longer links than this are not handed to the browser; the file is the way in. */
const MAX_LINK = 200_000;

const openInBrowser = (url) =>
  new Promise((resolve) => {
    const [command, args] =
      process.platform === "darwin" ? ["open", [url]]
      : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
      : ["xdg-open", [url]];
    execFile(command, args, (error) => resolve(!error));
  });

/** Save the scene, optionally open it, and describe what happened. */
const deliver = async (scene, open, target = "new") => {
  await mkdir(OUT_DIR, { recursive: true });
  const safe = scene.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "scene";
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const file = join(OUT_DIR, `${safe}-${stamp}.inkboard`);
  await writeFile(file, scene.toJSON());

  const link = scene.toLink(APP_URL, target);
  const where = target === "current" ? "added to the scene that is open" : "as a new scene";
  const lines = [`Created “${scene.name}” with ${scene.shapes.length} shapes.`, `Saved to ${file}`];
  if (link.length > MAX_LINK) {
    lines.push("The scene is too large for a link. Import the file from Inkboard's sidebar instead.");
  } else if (open) {
    const opened = await openInBrowser(link);
    lines.push(
      opened
        ? `Opened it in Inkboard at ${APP_URL}, ${where}.`
        : `Could not launch a browser. Open this link to load it in Inkboard: ${link}`,
    );
  } else {
    lines.push(`Open this link to load it in Inkboard: ${link}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
};

const fail = (error) => ({
  isError: true,
  content: [
    {
      type: "text",
      // The SDK's wording points at its own method; name the tool instead.
      text: `Could not build the scene: ${error.message.replace("Scene.library() lists them.", "Call list_library for the names.")}`,
    },
  ],
});

const colorHelp = "ink, red, orange, green, blue, purple, yellow, or a hex colour like #0ea5e9";
const open = z.boolean().default(true).describe("Open the result in the Inkboard app in the user's browser");
const title = z.string().describe("Name of the new scene");
const target = z
  .enum(["new", "current"])
  .default("new")
  .describe("new: open as a new scene. current: add the shapes to the scene the user has open in Inkboard");

const server = new McpServer({ name: "inkboard", version: "0.1.0" });

server.registerTool(
  "create_diagram",
  {
    title: "Create a diagram",
    description:
      "Create a diagram of boxes joined by arrows on Inkboard, laid out automatically: flowcharts, " +
      "architecture diagrams, dependency graphs, org charts, state machines. Say what connects to what; " +
      "do not give positions. This is the best tool for most diagrams.",
    inputSchema: {
      title,
      direction: z.enum(["TD", "BT", "LR", "RL"]).default("TD").describe("TD top-down, LR left-to-right, BT, RL"),
      nodes: z
        .array(
          z.object({
            id: z.string().describe("Short unique id, used by edges"),
            text: z.string().optional().describe("Label shown in the box; defaults to the id"),
            shape: z.enum(["rect", "ellipse", "diamond", "note"]).optional()
              .describe("rect for steps, ellipse for start/end, diamond for decisions, note for a sticky note"),
            color: z.string().optional().describe(`Outline colour: ${colorHelp}`),
            fill: z.string().optional().describe(`Fill colour: ${colorHelp}`),
          }),
        )
        .min(1),
      edges: z
        .array(
          z.object({
            from: z.string(),
            to: z.string(),
            label: z.string().optional(),
            style: z.enum(["solid", "dashed", "dotted", "thick"]).optional(),
            arrow: z.boolean().optional().describe("false for a plain line with no arrowhead"),
          }),
        )
        .default([]),
      groups: z
        .array(z.object({ title: z.string(), nodes: z.array(z.string()) }))
        .default([])
        .describe("Named frames drawn around sets of nodes"),
      target,
      open,
    },
  },
  async (input) => {
    try {
      const scene = new Scene(input.title);
      scene.graph(input);
      return await deliver(scene, input.open, input.target);
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "create_from_mermaid",
  {
    title: "Create a diagram from Mermaid",
    description:
      "Turn a Mermaid flowchart (text starting with “flowchart TD” or “graph LR”) into an editable Inkboard " +
      "diagram. Only flowcharts are supported, not sequence, class or other Mermaid diagram kinds.",
    inputSchema: { title, mermaid: z.string().describe("The Mermaid flowchart source"), target, open },
  },
  async (input) => {
    try {
      const scene = new Scene(input.title);
      scene.mermaid(input.mermaid);
      return await deliver(scene, input.open, input.target);
    } catch (error) {
      return fail(error);
    }
  },
);

const box = {
  id: z.string().optional().describe("Give an id to connect arrows to this shape"),
  x: z.number(),
  y: z.number(),
  w: z.number().optional().describe("Width; left out, sized to the text"),
  h: z.number().optional(),
  text: z.string().optional(),
  color: z.string().optional().describe(`Outline colour: ${colorHelp}`),
  fill: z.string().optional().describe(`Fill colour: ${colorHelp}`),
  fillStyle: z.enum(["tint", "hachure", "solid"]).optional(),
  dash: z.enum(["solid", "dashed", "dotted"]).optional(),
  fontSize: z.number().optional(),
};
const end = z.union([z.string(), z.object({ x: z.number(), y: z.number() })]);
const connector = {
  from: end.describe("The id of a shape to attach to, or a point"),
  to: end.describe("The id of a shape to attach to, or a point"),
  label: z.string().optional(),
  color: z.string().optional(),
  dash: z.enum(["solid", "dashed", "dotted"]).optional(),
  elbow: z.boolean().optional().describe("Route with right angles"),
};

server.registerTool(
  "create_canvas",
  {
    title: "Create a free-form canvas",
    description:
      "Place shapes on Inkboard at exact positions: wireframes, annotated layouts, sticky-note boards, tables, " +
      "anything that is not a graph. Coordinates are pixels with y growing downwards; a typical box is about " +
      "160 by 80. List shapes before the arrows that refer to them. An element of type \"library\" places a " +
      "ready-made item (a database, server, phone, chart and so on): call list_library for the names. For " +
      "boxes joined by arrows, prefer create_diagram, which lays them out for you.",
    inputSchema: {
      title,
      elements: z
        .array(
          z.discriminatedUnion("type", [
            z.object({ type: z.literal("rect"), ...box }),
            z.object({ type: z.literal("ellipse"), ...box }),
            z.object({ type: z.literal("diamond"), ...box }),
            z.object({ type: z.literal("note"), ...box }),
            z.object({
              type: z.literal("text"),
              x: z.number(),
              y: z.number(),
              text: z.string(),
              fontSize: z.number().optional(),
              color: z.string().optional(),
            }),
            z.object({
              type: z.literal("frame"),
              x: z.number(),
              y: z.number(),
              w: z.number(),
              h: z.number(),
              title: z.string().optional(),
            }),
            z.object({
              type: z.literal("table"),
              x: z.number(),
              y: z.number(),
              cells: z.array(z.array(z.string())).min(1).describe("Rows of cells; the first row is the header"),
            }),
            z.object({
              type: z.literal("library"),
              id: z.string().optional().describe("Give an id to connect arrows to this item"),
              item: z.string().describe("Name of a shape-library item, exactly as list_library gives it"),
              x: z.number(),
              y: z.number(),
            }),
            z.object({ type: z.literal("arrow"), ...connector }),
            z.object({ type: z.literal("line"), ...connector }),
          ]),
        )
        .min(1),
      target,
      open,
    },
  },
  async (input) => {
    try {
      const scene = new Scene(input.title);
      /** The caller's ids, mapped to the ids the scene assigned. */
      const ids = new Map();
      const resolve = (target) => {
        if (typeof target !== "string") return target;
        if (!ids.has(target)) throw new Error(`An arrow refers to "${target}", but no earlier shape has that id.`);
        return ids.get(target);
      };
      for (const { type, id, ...options } of input.elements) {
        const created =
          type === "arrow" || type === "line"
            ? scene[type]({ ...options, from: resolve(options.from), to: resolve(options.to) })
            : type === "library"
              ? scene.libraryItem(options.item, { x: options.x, y: options.y })
              : scene[type](options);
        if (id) ids.set(id, created);
      }
      return await deliver(scene, input.open, input.target);
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "list_library",
  {
    title: "List the shape library",
    description:
      "List Inkboard's ready-made shapes by pack (flowchart, architecture, wireframe, UML, cloud, charts, " +
      "people and more). Use a name from this list as the \"item\" of a library element in create_canvas.",
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: "text",
        text: Scene.library()
          .map((pack) => `${pack.pack}: ${pack.items.join(", ")}`)
          .join("\n"),
      },
    ],
  }),
);

await server.connect(new StdioServerTransport());
