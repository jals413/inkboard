// Mermaid flowcharts in the app: the shared graph code, measured with the
// real canvas font.

import { graphToShapes, parseMermaid, type Measurer } from "./graph";
import { measureText, wrapText } from "./render";
import type { Shape } from "./types";

export { looksLikeMermaid } from "./graph";

const canvasText: Measurer = { measure: measureText, wrap: wrapText };

/** Build the shapes for a Mermaid flowchart. Throws with a readable message. */
export const mermaidToShapes = (source: string): Shape[] =>
  graphToShapes(parseMermaid(source), canvasText);
