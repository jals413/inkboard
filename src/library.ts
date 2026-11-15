// loosedraw's official shape library: packs of ready-made items, grouped by
// field and shipped with the app. Every item is built from ordinary shapes,
// so it stays fully editable after it is dropped on the canvas.

import { INK, NONE, NOTE_FILL, type Shape, type ShapeType } from "./engine/types";

export type LibraryItem = { name: string; shapes: Shape[] };
export type LibraryPack = { name: string; items: LibraryItem[] };

const RED = "#e03131";
const ORANGE = "#f08c00";
const GREEN = "#2f9e44";
const BLUE = "#1c7ed6";
const PURPLE = "#7048e8";

let counter = 0;

/** One shape of a library item, positioned relative to the item's own origin. */
const sh = (
  type: ShapeType, x: number, y: number, w: number, h: number,
  extra: Partial<Shape> = {},
): Shape => ({
  id: `lib-${counter++}`,
  type,
  x,
  y,
  w,
  h,
  stroke: INK,
  fill: type === "note" ? NOTE_FILL : NONE,
  strokeWidth: 2,
  opacity: 1,
  text: "",
  fontSize: 16,
  ...extra,
});

const label = (x: number, y: number, text: string, fontSize = 14): Shape =>
  // Width and height are close estimates; text is re-measured when edited.
  sh("text", x, y, text.length * fontSize * 0.58, fontSize * 1.3, { text, fontSize });

const item = (name: string, ...shapes: Shape[]): LibraryItem => ({ name, shapes });

/**
 * A closed outline through the given corners, as a pen stroke. Each side is
 * cut into short steps so the pen's smoothing leaves the corners crisp.
 */
const poly = (x: number, y: number, corners: [number, number][], extra: Partial<Shape> = {}): Shape => {
  const points: number[] = [];
  corners.forEach(([ax, ay], i) => {
    const [bx, by] = corners[(i + 1) % corners.length];
    for (let step = 0; step < 6; step++) points.push(ax + ((bx - ax) * step) / 6, ay + ((by - ay) * step) / 6);
  });
  points.push(corners[0][0], corners[0][1], corners[0][0], corners[0][1]);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return sh("draw", x, y, Math.max(...xs), Math.max(...ys), { points, ...extra });
};

/** An open pen stroke through the given points. */
const path = (x: number, y: number, pts: [number, number][], extra: Partial<Shape> = {}): Shape =>
  sh("draw", x, y, Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])), {
    points: pts.flat(),
    ...extra,
  });

/** A regular polygon or star inscribed in a `size` square. */
const ring = (size: number, sides: number, inner = 1): [number, number][] =>
  Array.from({ length: inner === 1 ? sides : sides * 2 }, (_, i) => {
    const count = inner === 1 ? sides : sides * 2;
    const r = (size / 2) * (inner !== 1 && i % 2 ? inner : 1);
    const angle = -Math.PI / 2 + (i / count) * Math.PI * 2;
    return [size / 2 + r * Math.cos(angle), size / 2 + r * Math.sin(angle)] as [number, number];
  });

const table = (x: number, y: number, cells: string[][], colWidth = 110, rowHeight = 40): Shape => {
  const cols = cells[0].map(() => colWidth);
  const rows = cells.map(() => rowHeight);
  return sh("table", x, y, colWidth * cols.length, rowHeight * rows.length, { cells, cols, rows, fontSize: 14 });
};

/** A stick figure, 60 wide and 116 tall. */
const person = (x: number, y: number, color = INK): Shape[] => [
  sh("ellipse", x + 14, y, 32, 32, { stroke: color }),
  sh("line", x + 30, y + 32, 0, 44, { stroke: color }),
  sh("line", x + 4, y + 48, 52, 0, { stroke: color }),
  sh("line", x + 30, y + 76, -22, 38, { stroke: color }),
  sh("line", x + 30, y + 76, 22, 38, { stroke: color }),
];

export const LIBRARY: LibraryPack[] = [
  {
    name: "Flowchart",
    items: [
      item("Start / End", sh("ellipse", 0, 0, 150, 64, { text: "Start", fill: GREEN, stroke: GREEN })),
      item("Process", sh("rect", 0, 0, 170, 80, { text: "Process" })),
      item("Decision", sh("diamond", 0, 0, 160, 120, { text: "Decision?", fill: ORANGE, stroke: ORANGE })),
      item("Input / Output", poly(0, 0, [[34, 0], [190, 0], [156, 76], [0, 76]], { stroke: BLUE }), label(52, 28, "Input")),
      item(
        "Document",
        sh("line", 0, 0, 170, 0),
        sh("line", 0, 0, 0, 86),
        sh("line", 170, 0, 0, 78),
        path(0, 70, [[0, 16], [28, 26], [58, 24], [86, 12], [114, 2], [144, 0], [170, 8]]),
        label(42, 28, "Document"),
      ),
      item("Manual step", poly(0, 0, [[0, 0], [190, 0], [158, 76], [32, 76]]), label(48, 28, "Manual step")),
      item("Connector", sh("ellipse", 0, 0, 52, 52, { text: "A" })),
      item("Subprocess", sh("rect", 0, 0, 180, 80, { text: "Subprocess" }), sh("line", 16, 0, 0, 80), sh("line", 164, 0, 0, 80)),
      item("Delay", sh("rect", 0, 0, 150, 70, { text: "Wait", dash: "dashed", stroke: PURPLE })),
      item(
        "Loop",
        sh("rect", 0, 0, 140, 64, { text: "Try" }),
        sh("arrow", 148, 32, 60, 0),
        sh("diamond", 216, -18, 130, 100, { text: "Done?" }),
        sh("arrow", 281, 86, -211, -18, { route: "elbow", dash: "dashed" }),
        label(150, 92, "No", 13),
      ),
      item(
        "Swimlanes",
        sh("rect", 0, 0, 460, 110),
        sh("rect", 0, 110, 460, 110),
        sh("line", 90, 0, 0, 220),
        label(18, 44, "Team A", 14),
        label(18, 154, "Team B", 14),
      ),
      item(
        "Two steps",
        sh("rect", 0, 0, 140, 70, { text: "Step 1" }),
        sh("arrow", 148, 35, 64, 0),
        sh("rect", 220, 0, 140, 70, { text: "Step 2" }),
      ),
      item(
        "Yes / No branch",
        sh("diamond", 90, 0, 160, 110, { text: "OK?" }),
        sh("arrow", 90, 55, -70, 70),
        sh("arrow", 250, 55, 70, 70),
        label(18, 62, "No"),
        label(292, 62, "Yes"),
        sh("rect", -50, 132, 130, 60, { text: "Fix" }),
        sh("rect", 260, 132, 130, 60, { text: "Continue" }),
      ),
    ],
  },
  {
    name: "Architecture",
    items: [
      item("Service", sh("rect", 0, 0, 160, 80, { text: "Service", fill: BLUE, stroke: BLUE })),
      item(
        "Database",
        sh("rect", 0, 16, 120, 96, { text: "Database", fill: PURPLE, stroke: PURPLE }),
        sh("ellipse", 0, 0, 120, 34, { stroke: PURPLE, fill: PURPLE }),
        sh("ellipse", 0, 95, 120, 34, { stroke: PURPLE }),
      ),
      item(
        "Queue",
        sh("rect", 0, 0, 200, 56, { stroke: ORANGE, fill: ORANGE }),
        sh("line", 50, 0, 0, 56, { stroke: ORANGE }),
        sh("line", 100, 0, 0, 56, { stroke: ORANGE }),
        sh("line", 150, 0, 0, 56, { stroke: ORANGE }),
        label(74, 64, "Queue"),
      ),
      item(
        "User",
        sh("ellipse", 22, 0, 36, 36),
        sh("line", 40, 36, 0, 46),
        sh("line", 12, 52, 56, 0),
        sh("line", 40, 82, -24, 34),
        sh("line", 40, 82, 24, 34),
        label(22, 122, "User"),
      ),
      item(
        "Cloud",
        sh("ellipse", 0, 34, 90, 62, { stroke: BLUE }),
        sh("ellipse", 52, 0, 100, 84, { stroke: BLUE }),
        sh("ellipse", 118, 30, 90, 66, { stroke: BLUE }),
        label(78, 104, "Cloud"),
      ),
      item(
        "Client → API → DB",
        sh("rect", 0, 0, 120, 64, { text: "Client" }),
        sh("arrow", 128, 32, 56, 0),
        sh("rect", 192, 0, 120, 64, { text: "API", fill: BLUE, stroke: BLUE }),
        sh("arrow", 320, 32, 56, 0),
        sh("rect", 384, 0, 120, 64, { text: "Database", fill: PURPLE, stroke: PURPLE }),
      ),
    ],
  },
  {
    name: "Wireframe",
    items: [
      item("Button", sh("rect", 0, 0, 130, 44, { text: "Button", fill: BLUE, stroke: BLUE })),
      item(
        "Text field",
        label(0, 0, "Label", 13),
        sh("rect", 0, 22, 240, 42),
        label(12, 33, "Placeholder", 14),
      ),
      item("Checkbox", sh("rect", 0, 0, 22, 22), label(32, 1, "Remember me")),
      item("Radio", sh("ellipse", 0, 0, 22, 22), sh("ellipse", 6, 6, 10, 10, { fill: INK, fillStyle: "solid" }), label(32, 1, "Option")),
      item(
        "Toggle",
        sh("rect", 0, 0, 56, 28, { stroke: GREEN, fill: GREEN }),
        sh("ellipse", 30, 3, 22, 22, { stroke: GREEN, fill: GREEN, fillStyle: "solid" }),
      ),
      item(
        "Dropdown",
        sh("rect", 0, 0, 220, 42),
        label(12, 11, "Choose one", 14),
        path(190, 16, [[0, 0], [8, 10], [16, 0]]),
      ),
      item(
        "Search bar",
        sh("rect", 0, 0, 280, 42),
        sh("ellipse", 12, 11, 16, 16),
        sh("line", 26, 26, 8, 8),
        label(44, 11, "Search", 14),
      ),
      item(
        "Tabs",
        sh("line", 0, 40, 340, 0),
        sh("rect", 0, 0, 100, 40, { text: "First", fill: BLUE, stroke: BLUE }),
        label(128, 10, "Second", 14),
        label(238, 10, "Third", 14),
      ),
      item(
        "Navigation bar",
        sh("rect", 0, 0, 460, 52),
        sh("rect", 12, 12, 28, 28, { fill: BLUE, stroke: BLUE }),
        label(190, 16, "Home", 14),
        label(260, 16, "Docs", 14),
        sh("rect", 350, 10, 96, 32, { text: "Sign in" }),
      ),
      item(
        "Dialog",
        sh("rect", 0, 0, 320, 190),
        label(18, 16, "Are you sure?", 17),
        sh("line", 18, 62, 280, 0),
        sh("line", 18, 84, 220, 0),
        sh("rect", 118, 136, 86, 36, { text: "Cancel" }),
        sh("rect", 214, 136, 88, 36, { text: "OK", fill: BLUE, stroke: BLUE }),
      ),
      item(
        "List",
        sh("rect", 0, 0, 280, 180),
        sh("line", 0, 60, 280, 0),
        sh("line", 0, 120, 280, 0),
        sh("ellipse", 14, 14, 32, 32),
        sh("ellipse", 14, 74, 32, 32),
        sh("ellipse", 14, 134, 32, 32),
        sh("line", 60, 30, 150, 0),
        sh("line", 60, 90, 180, 0),
        sh("line", 60, 150, 130, 0),
      ),
      item(
        "Slider",
        sh("line", 0, 12, 240, 0, { strokeWidth: 3.5 }),
        sh("ellipse", 140, 0, 24, 24, { fill: BLUE, stroke: BLUE, fillStyle: "solid" }),
      ),
      item(
        "Progress bar",
        sh("rect", 0, 0, 260, 22),
        sh("rect", 0, 0, 160, 22, { fill: GREEN, stroke: GREEN, fillStyle: "solid" }),
      ),
      item("Data table", table(0, 0, [["Name", "Status", "Owner"], ["", "", ""], ["", "", ""]], 96, 36)),
      item(
        "Image",
        sh("rect", 0, 0, 200, 130),
        sh("line", 0, 0, 200, 130),
        sh("line", 0, 130, 200, -130),
      ),
      item(
        "Card",
        sh("rect", 0, 0, 240, 190),
        sh("rect", 14, 14, 212, 86),
        sh("line", 14, 120, 150, 0, { strokeWidth: 3.5 }),
        sh("line", 14, 144, 212, 0),
        sh("line", 14, 164, 180, 0),
      ),
      item(
        "Browser window",
        sh("rect", 0, 0, 420, 270),
        sh("line", 0, 38, 420, 0),
        sh("ellipse", 14, 13, 12, 12, { stroke: RED, fill: RED }),
        sh("ellipse", 34, 13, 12, 12, { stroke: ORANGE, fill: ORANGE }),
        sh("ellipse", 54, 13, 12, 12, { stroke: GREEN, fill: GREEN }),
        sh("rect", 90, 9, 240, 20),
      ),
      item(
        "Phone",
        sh("rect", 0, 0, 200, 400),
        sh("line", 74, 16, 52, 0, { strokeWidth: 3.5 }),
        sh("line", 70, 384, 60, 0, { strokeWidth: 3.5 }),
      ),
    ],
  },
  {
    name: "Planning",
    items: [
      item(
        "Sticky notes",
        sh("note", 0, 0, 130, 130, { text: "Idea" }),
        sh("note", 146, 0, 130, 130, { text: "Idea", fill: GREEN }),
        sh("note", 292, 0, 130, 130, { text: "Idea", fill: BLUE }),
      ),
      item(
        "Kanban column",
        sh("rect", 0, 0, 200, 330),
        label(16, 14, "To do", 16),
        sh("line", 0, 46, 200, 0),
        sh("note", 16, 62, 168, 76, { text: "Task" }),
        sh("note", 16, 152, 168, 76, { text: "Task" }),
      ),
      item(
        "Timeline",
        sh("arrow", 0, 30, 460, 0, { strokeWidth: 3.5 }),
        sh("ellipse", 50, 20, 20, 20, { fill: BLUE, stroke: BLUE }),
        sh("ellipse", 200, 20, 20, 20, { fill: BLUE, stroke: BLUE }),
        sh("ellipse", 350, 20, 20, 20, { fill: BLUE, stroke: BLUE }),
        label(38, 50, "Start"),
        label(180, 50, "Midpoint"),
        label(338, 50, "Launch"),
      ),
      item(
        "Pros and cons",
        sh("rect", 0, 0, 200, 220, { stroke: GREEN, fill: GREEN }),
        sh("rect", 216, 0, 200, 220, { stroke: RED, fill: RED }),
        label(76, 12, "Pros", 18),
        label(292, 12, "Cons", 18),
      ),
      item(
        "SWOT",
        sh("rect", 0, 0, 200, 150, { stroke: GREEN, fill: GREEN }),
        sh("rect", 212, 0, 200, 150, { stroke: RED, fill: RED }),
        sh("rect", 0, 162, 200, 150, { stroke: BLUE, fill: BLUE }),
        sh("rect", 212, 162, 200, 150, { stroke: ORANGE, fill: ORANGE }),
        label(12, 10, "Strengths", 15),
        label(224, 10, "Weaknesses", 15),
        label(12, 172, "Opportunities", 15),
        label(224, 172, "Threats", 15),
      ),
      item(
        "Priority matrix",
        sh("arrow", 30, 250, 0, -250),
        sh("arrow", 30, 250, 300, 0),
        sh("line", 30, 125, 290, 0, { dash: "dashed" }),
        sh("line", 175, 0, 0, 250, { dash: "dashed" }),
        label(0, -22, "Impact", 13),
        label(290, 258, "Effort", 13),
        label(66, 50, "Do first", 14),
        label(216, 50, "Plan", 14),
        label(66, 176, "Fit in", 14),
        label(216, 176, "Skip", 14),
      ),
      item(
        "Roadmap",
        sh("rect", 0, 0, 480, 44, { text: "Now          Next          Later" }),
        sh("rect", 10, 56, 140, 40, { text: "Feature", fill: GREEN, stroke: GREEN }),
        sh("rect", 170, 56, 140, 40, { text: "Feature", fill: BLUE, stroke: BLUE }),
        sh("rect", 330, 56, 140, 40, { text: "Feature", fill: PURPLE, stroke: PURPLE }),
        sh("rect", 10, 106, 220, 40, { text: "Feature", fill: ORANGE, stroke: ORANGE }),
      ),
      item(
        "Retro board",
        sh("rect", 0, 0, 170, 240, { stroke: GREEN }),
        sh("rect", 182, 0, 170, 240, { stroke: RED }),
        sh("rect", 364, 0, 170, 240, { stroke: BLUE }),
        label(14, 10, "Went well", 15),
        label(196, 10, "To improve", 15),
        label(378, 10, "Actions", 15),
        sh("note", 14, 48, 140, 70, { text: "Note", fill: GREEN }),
        sh("note", 196, 48, 140, 70, { text: "Note", fill: RED }),
        sh("note", 378, 48, 140, 70, { text: "Note", fill: BLUE }),
      ),
      item(
        "Checklist",
        sh("rect", 0, 0, 20, 20),
        path(3, 3, [[0, 8], [5, 13], [14, 0]], { stroke: GREEN, strokeWidth: 3.5 }),
        label(32, 0, "Done item"),
        sh("rect", 0, 34, 20, 20),
        label(32, 34, "Next item"),
        sh("rect", 0, 68, 20, 20),
        label(32, 68, "Later item"),
      ),
      item(
        "Mind map",
        sh("ellipse", 150, 80, 150, 70, { text: "Topic", fill: BLUE, stroke: BLUE }),
        sh("line", 160, 96, -60, -50, { bend: 14 }),
        sh("line", 160, 136, -60, 50, { bend: -14 }),
        sh("line", 290, 96, 60, -50, { bend: -14 }),
        sh("line", 290, 136, 60, 50, { bend: 14 }),
        sh("rect", 0, 10, 100, 44, { text: "Idea" }),
        sh("rect", 0, 176, 100, 44, { text: "Idea" }),
        sh("rect", 350, 10, 100, 44, { text: "Idea" }),
        sh("rect", 350, 176, 100, 44, { text: "Idea" }),
      ),
      item(
        "User story",
        sh("note", 0, 0, 260, 150, { text: "As a …\nI want …\nso that …", fontSize: 15 }),
      ),
      item(
        "Gantt chart",
        sh("line", 90, 0, 0, 150),
        sh("line", 0, 30, 420, 0),
        label(0, 44, "Design", 13),
        label(0, 84, "Build", 13),
        label(0, 124, "Launch", 13),
        sh("rect", 100, 40, 120, 26, { fill: BLUE, stroke: BLUE, fillStyle: "solid" }),
        sh("rect", 190, 80, 160, 26, { fill: GREEN, stroke: GREEN, fillStyle: "solid" }),
        sh("rect", 340, 120, 70, 26, { fill: ORANGE, stroke: ORANGE, fillStyle: "solid" }),
      ),
    ],
  },
  {
    name: "Basic shapes",
    items: [
      item("Triangle", poly(0, 0, [[70, 0], [140, 120], [0, 120]])),
      item("Star", poly(0, 0, ring(130, 5, 0.42), { stroke: ORANGE })),
      item("Pentagon", poly(0, 0, ring(130, 5))),
      item("Hexagon", poly(0, 0, ring(130, 6))),
      item("Octagon", poly(0, 0, ring(130, 8), { stroke: RED })),
      item("Parallelogram", poly(0, 0, [[36, 0], [190, 0], [154, 84], [0, 84]])),
      item("Trapezoid", poly(0, 0, [[36, 0], [154, 0], [190, 84], [0, 84]])),
      item("Block arrow", poly(0, 0, [[0, 26], [110, 26], [110, 0], [170, 50], [110, 100], [110, 74], [0, 74]], { stroke: BLUE })),
      item("Plus", poly(0, 0, [[40, 0], [80, 0], [80, 40], [120, 40], [120, 80], [80, 80], [80, 120], [40, 120], [40, 80], [0, 80], [0, 40], [40, 40]])),
      item("Speech bubble", poly(0, 0, [[0, 0], [200, 0], [200, 100], [70, 100], [36, 136], [40, 100], [0, 100]])),
      item("Tick", path(0, 0, [[0, 50], [14, 62], [34, 84], [60, 46], [92, 0]], { stroke: GREEN, strokeWidth: 6 })),
      item("Cross", sh("line", 0, 0, 80, 80, { stroke: RED, strokeWidth: 6 }), sh("line", 80, 0, -80, 80, { stroke: RED, strokeWidth: 6 })),
      item(
        "Cylinder",
        sh("line", 0, 18, 0, 100),
        sh("line", 120, 18, 0, 100),
        sh("ellipse", 0, 0, 120, 36),
        path(0, 100, [[0, 18], [14, 30], [40, 36], [60, 37], [80, 36], [106, 30], [120, 18]]),
      ),
      item("Bracket", path(0, 0, [[30, 0], [12, 4], [10, 30], [10, 70], [0, 80], [10, 90], [10, 130], [12, 156], [30, 160]])),
    ],
  },
  {
    name: "UML and data",
    items: [
      item(
        "Class",
        sh("rect", 0, 0, 200, 150),
        sh("line", 0, 40, 200, 0),
        sh("line", 0, 96, 200, 0),
        label(62, 10, "ClassName", 15),
        label(12, 50, "+ id: number", 13),
        label(12, 70, "+ name: string", 13),
        label(12, 106, "+ save(): void", 13),
        label(12, 126, "+ load(): void", 13),
      ),
      item("Entity table", table(0, 0, [["users", ""], ["id", "int"], ["email", "text"], ["created", "date"]], 100, 36)),
      item("Use case", sh("ellipse", 0, 0, 190, 80, { text: "Use case" })),
      item("Actor", ...person(0, 0), label(8, 122, "Actor")),
      item(
        "Lifeline",
        sh("rect", 0, 0, 130, 50, { text: "Object" }),
        sh("line", 65, 50, 0, 190, { dash: "dashed" }),
        sh("rect", 57, 90, 16, 90),
      ),
      item(
        "Message",
        sh("arrow", 0, 14, 220, 0),
        label(70, -10, "request()", 13),
        sh("arrow", 220, 60, -220, 0, { dash: "dashed" }),
        label(74, 36, "response", 13),
      ),
      item(
        "Package",
        sh("rect", 0, 0, 90, 26),
        sh("rect", 0, 26, 220, 130),
        label(10, 4, "package", 13),
      ),
      item("State", sh("rect", 0, 0, 160, 70, { text: "State", fill: BLUE, stroke: BLUE })),
      item(
        "Start and end",
        sh("ellipse", 0, 6, 28, 28, { fill: INK, fillStyle: "solid" }),
        sh("arrow", 36, 20, 70, 0),
        sh("ellipse", 114, 0, 40, 40),
        sh("ellipse", 124, 10, 20, 20, { fill: INK, fillStyle: "solid" }),
      ),
      item(
        "One to many",
        sh("rect", 0, 0, 120, 60, { text: "Order" }),
        sh("line", 120, 30, 110, 0),
        sh("line", 206, 30, 24, -16),
        sh("line", 206, 30, 24, 16),
        sh("line", 134, 18, 0, 24),
        sh("rect", 230, 0, 120, 60, { text: "Item" }),
      ),
    ],
  },
  {
    name: "Cloud and network",
    items: [
      item(
        "Server",
        sh("rect", 0, 0, 150, 44),
        sh("rect", 0, 52, 150, 44),
        sh("rect", 0, 104, 150, 44),
        sh("ellipse", 14, 16, 12, 12, { stroke: GREEN, fill: GREEN }),
        sh("ellipse", 14, 68, 12, 12, { stroke: GREEN, fill: GREEN }),
        sh("ellipse", 14, 120, 12, 12, { stroke: ORANGE, fill: ORANGE }),
        sh("line", 90, 22, 44, 0),
        sh("line", 90, 74, 44, 0),
        sh("line", 90, 126, 44, 0),
      ),
      item(
        "Load balancer",
        sh("diamond", 0, 20, 110, 90, { text: "LB", stroke: ORANGE, fill: ORANGE }),
        sh("arrow", 114, 50, 70, -40),
        sh("arrow", 114, 65, 70, 0),
        sh("arrow", 114, 80, 70, 40),
      ),
      item(
        "Laptop",
        sh("rect", 20, 0, 170, 110),
        poly(0, 114, [[0, 0], [210, 0], [196, 16], [14, 16]]),
      ),
      item(
        "Phone client",
        sh("rect", 0, 0, 80, 150),
        sh("line", 28, 12, 24, 0),
        sh("ellipse", 33, 128, 14, 14),
      ),
      item(
        "Firewall",
        sh("rect", 0, 0, 150, 96, { stroke: RED }),
        sh("line", 0, 32, 150, 0, { stroke: RED }),
        sh("line", 0, 64, 150, 0, { stroke: RED }),
        sh("line", 50, 0, 0, 32, { stroke: RED }),
        sh("line", 100, 0, 0, 32, { stroke: RED }),
        sh("line", 25, 32, 0, 32, { stroke: RED }),
        sh("line", 75, 32, 0, 32, { stroke: RED }),
        sh("line", 125, 32, 0, 32, { stroke: RED }),
        sh("line", 50, 64, 0, 32, { stroke: RED }),
        sh("line", 100, 64, 0, 32, { stroke: RED }),
      ),
      item(
        "Storage bucket",
        poly(0, 0, [[0, 0], [130, 0], [108, 110], [22, 110]], { stroke: GREEN }),
        sh("ellipse", 0, -10, 130, 22, { stroke: GREEN }),
        label(36, 44, "Bucket"),
      ),
      item("Cache", sh("rect", 0, 0, 140, 70, { text: "Cache", stroke: RED, fill: RED, dash: "dashed" })),
      item(
        "Message bus",
        sh("rect", 0, 40, 380, 34, { text: "Event bus", stroke: ORANGE, fill: ORANGE }),
        sh("arrow", 60, 0, 0, 36),
        sh("arrow", 190, 0, 0, 36),
        sh("arrow", 320, 78, 0, 36),
      ),
      item(
        "Three tiers",
        sh("rect", 0, 0, 240, 60, { text: "Web", fill: BLUE, stroke: BLUE }),
        sh("arrow", 120, 64, 0, 36),
        sh("rect", 0, 104, 240, 60, { text: "Application", fill: GREEN, stroke: GREEN }),
        sh("arrow", 120, 168, 0, 36),
        sh("rect", 0, 208, 240, 60, { text: "Data", fill: PURPLE, stroke: PURPLE }),
      ),
      item(
        "Microservices",
        sh("rect", 100, 0, 140, 56, { text: "Gateway", fill: BLUE, stroke: BLUE }),
        sh("arrow", 140, 60, -70, 50),
        sh("arrow", 170, 60, 0, 50),
        sh("arrow", 200, 60, 70, 50),
        sh("rect", 0, 114, 100, 56, { text: "Users" }),
        sh("rect", 120, 114, 100, 56, { text: "Orders" }),
        sh("rect", 240, 114, 100, 56, { text: "Billing" }),
      ),
      item(
        "Region",
        sh("rect", 0, 0, 300, 200, { dash: "dashed", stroke: BLUE }),
        label(12, 8, "Region", 14),
        sh("rect", 24, 50, 110, 120, { dash: "dotted" }),
        sh("rect", 164, 50, 110, 120, { dash: "dotted" }),
        label(48, 58, "Zone A", 13),
        label(188, 58, "Zone B", 13),
      ),
    ],
  },
  {
    name: "Charts",
    items: [
      item(
        "Bar chart",
        sh("line", 0, 0, 0, 170),
        sh("line", 0, 170, 250, 0),
        sh("rect", 24, 90, 40, 80, { fill: BLUE, stroke: BLUE, fillStyle: "hachure" }),
        sh("rect", 84, 40, 40, 130, { fill: GREEN, stroke: GREEN, fillStyle: "hachure" }),
        sh("rect", 144, 110, 40, 60, { fill: ORANGE, stroke: ORANGE, fillStyle: "hachure" }),
        sh("rect", 204, 66, 40, 104, { fill: PURPLE, stroke: PURPLE, fillStyle: "hachure" }),
      ),
      item(
        "Line chart",
        sh("line", 0, 0, 0, 170),
        sh("line", 0, 170, 250, 0),
        path(10, 20, [[0, 120], [50, 90], [100, 104], [150, 44], [200, 56], [230, 0]], { stroke: BLUE, strokeWidth: 3.5 }),
      ),
      item(
        "Pie chart",
        sh("ellipse", 0, 0, 160, 160),
        sh("line", 80, 80, 0, -80),
        sh("line", 80, 80, 76, 26),
        sh("line", 80, 80, -50, 62),
      ),
      item(
        "Axes",
        sh("arrow", 0, 180, 0, -180),
        sh("arrow", 0, 180, 250, 0),
        label(-10, -24, "y", 14),
        label(256, 170, "x", 14),
      ),
      item(
        "Venn diagram",
        sh("ellipse", 0, 0, 170, 170, { fill: BLUE, stroke: BLUE }),
        sh("ellipse", 100, 0, 170, 170, { fill: RED, stroke: RED }),
      ),
      item(
        "Funnel",
        poly(0, 0, [[0, 0], [240, 0], [214, 46], [26, 46]], { stroke: BLUE }),
        poly(32, 54, [[0, 0], [176, 0], [150, 46], [26, 46]], { stroke: GREEN }),
        poly(64, 108, [[0, 0], [112, 0], [86, 46], [26, 46]], { stroke: ORANGE }),
      ),
      item(
        "Pyramid",
        poly(0, 0, [[110, 0], [220, 180], [0, 180]]),
        sh("line", 73, 60, 74, 0),
        sh("line", 37, 120, 146, 0),
      ),
      item(
        "Quadrants",
        sh("rect", 0, 0, 280, 220),
        sh("line", 140, 0, 0, 220),
        sh("line", 0, 110, 280, 0),
      ),
      item(
        "Gauge",
        path(0, 0, [[0, 100], [6, 66], [26, 32], [60, 8], [100, 0], [140, 8], [174, 32], [194, 66], [200, 100]], { strokeWidth: 6, stroke: GREEN }),
        sh("arrow", 100, 100, 44, -62, { strokeWidth: 3.5 }),
      ),
    ],
  },
  {
    name: "People and teams",
    items: [
      item("Person", ...person(0, 0)),
      item("Team", ...person(0, 0, BLUE), ...person(76, 0, GREEN), ...person(152, 0, ORANGE)),
      item(
        "Org chart",
        sh("rect", 130, 0, 140, 56, { text: "Lead", fill: BLUE, stroke: BLUE }),
        sh("line", 200, 56, 0, 30),
        sh("line", 60, 86, 280, 0),
        sh("line", 60, 86, 0, 28),
        sh("line", 200, 86, 0, 28),
        sh("line", 340, 86, 0, 28),
        sh("rect", 0, 114, 120, 52, { text: "Design" }),
        sh("rect", 140, 114, 120, 52, { text: "Build" }),
        sh("rect", 280, 114, 120, 52, { text: "Support" }),
      ),
      item(
        "Persona card",
        sh("rect", 0, 0, 260, 150),
        sh("ellipse", 16, 16, 56, 56),
        label(86, 20, "Name", 16),
        label(86, 46, "Role", 13),
        sh("line", 16, 92, 228, 0),
        sh("line", 16, 112, 190, 0),
        sh("line", 16, 132, 210, 0),
      ),
      item(
        "Conversation",
        poly(0, 0, [[0, 0], [190, 0], [190, 70], [50, 70], [24, 96], [28, 70], [0, 70]], { stroke: BLUE }),
        poly(110, 110, [[0, 0], [190, 0], [190, 70], [162, 70], [166, 96], [140, 70], [0, 70]], { stroke: GREEN }),
      ),
      item(
        "Handoff",
        ...person(0, 0, BLUE),
        sh("arrow", 76, 50, 110, 0),
        label(96, 22, "hands off", 13),
        ...person(200, 0, GREEN),
      ),
    ],
  },
];
