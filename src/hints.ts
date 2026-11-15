// The one-line tip shown under the toolbar: what the current tool does and
// the shortcut worth knowing for it.

import type { Shape, Tool } from "./engine/types";

const TOOL_HINTS: Record<Tool, string> = {
  select: "To move the canvas, scroll, hold Space while dragging, or use the hand tool",
  hand: "Drag to move the canvas. Pinch or hold ⌘ and scroll to zoom",
  rect: "Drag to draw a rectangle. Hold ⇧ while resizing to keep its proportions",
  ellipse: "Drag to draw an ellipse. Hold ⇧ while resizing to keep its proportions",
  diamond: "Drag to draw a diamond. Hold ⇧ while resizing to keep its proportions",
  arrow: "Drag from one shape to another to connect them. Double-click an arrow to label it",
  line: "Drag to draw a line. Select it, then pull a dot to add a point or a curve",
  draw: "Draw freehand. The pen stays picked until you choose another tool",
  highlight: "Drag over anything to highlight it. Pick a colour first to change the ink",
  text: "Click anywhere to start typing. Press Esc when you are done",
  note: "Click to stick a note down, or drag to size it. It grows as you type",
  frame: "Drag around shapes to frame them. Moving a frame moves what is inside it",
  eraser: "Drag over shapes to erase them. Locked shapes are left alone",
  laser: "Drag to point things out. The trail fades and is never saved",
};

/** The tip for the current moment. An empty string shows nothing. */
export const hintFor = (tool: Tool, selected: readonly Shape[], editing: boolean): string => {
  if (editing) return "Press Esc or ⌘Enter to finish typing";
  if (tool !== "select") return TOOL_HINTS[tool];
  // With something selected, teach the one action most worth knowing for it.
  if (selected.some((s) => s.locked)) return "Locked. Use Unlock in the panel, or press ⇧⌘L, to change it";
  if (selected.length > 1) return "Drag a corner to resize them together. ⌘G groups them";
  const [one] = selected;
  if (!one) return TOOL_HINTS.select;
  if (one.type === "arrow" || one.type === "line") {
    return one.route === "elbow"
      ? "Drag the dot on the middle stretch to slide the turn. Double-click to add a label"
      : "Pull a dot to add a point. Double-click to add a label";
  }
  if (one.type === "table") return "Double-click a cell to type. Tab moves to the next cell";
  if (one.type === "frame") return "Double-click the title to rename the frame";
  if (one.type === "rect" || one.type === "ellipse" || one.type === "diamond" || one.type === "note") {
    return "Press Enter to type in it. ⌘ and an arrow key adds a connected shape";
  }
  return TOOL_HINTS.select;
};
