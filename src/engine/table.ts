import { fitTable } from "./geom";
import { CELL_PADDING, LINE_HEIGHT, measureText, wrapText } from "./render";
import type { Font, Shape } from "./types";

const MIN_COL = 90;
const MAX_COL = 320;
const MIN_ROW = 40;
const NEW_COL = 120;

/**
 * Turn pasted text into cells. Understands spreadsheet copies (tabs) and
 * Markdown tables (pipes). Returns null when the text is not tabular.
 */
export const parseCells = (text: string): string[][] | null => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return null;
  let rows: string[][];
  if (lines.some((l) => l.includes("\t"))) {
    rows = lines.map((l) => l.split("\t"));
  } else if (lines.length > 1 && lines.every((l) => l.trim().startsWith("|"))) {
    rows = lines
      .filter((l) => !/^\s*\|[\s:|-]+\|?\s*$/.test(l)) // the |---|---| separator
      .map((l) => l.trim().replace(/^\||\|$/g, "").split("|"));
  } else {
    return null;
  }
  const cols = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => Array.from({ length: cols }, (_, i) => (r[i] ?? "").trim()));
};

/** The height a row needs so its tallest cell's wrapped text fits. */
const rowHeight = (cells: string[], cols: number[], fontSize: number, font?: Font) =>
  Math.max(
    MIN_ROW,
    ...cells.map(
      (text, c) =>
        wrapText(text, fontSize, Math.max(10, cols[c] - CELL_PADDING * 2), font).length *
          fontSize * LINE_HEIGHT + 16,
    ),
  );

/** Size a table's columns and rows to its content. */
export const layoutTable = (cells: string[][], fontSize: number, font?: Font) => {
  const count = cells[0]?.length ?? 0;
  const cols = Array.from({ length: count }, (_, c) =>
    Math.min(
      MAX_COL,
      Math.max(MIN_COL, ...cells.map((row) => measureText(row[c] ?? "", fontSize, font).w + CELL_PADDING * 2 + 8)),
    ),
  );
  return { cols, rows: cells.map((row) => rowHeight(row, cols, fontSize, font)) };
};

/** Set one cell's text; the row grows if the new text needs more room. */
export const setCell = (s: Shape, r: number, c: number, text: string): Shape => {
  const cells = (s.cells ?? []).map((row, i) =>
    i === r ? row.map((v, j) => (j === c ? text : v)) : row,
  );
  // Widen the column for longer text first (up to a limit), then let the
  // row grow for whatever still has to wrap.
  const cols = [...(s.cols ?? [])];
  const wanted = Math.max(...text.split("\n").map((l) => measureText(l, s.fontSize, s.font).w)) + CELL_PADDING * 2 + 8;
  cols[c] = Math.max(cols[c], Math.min(MAX_COL, wanted));
  const rows = [...(s.rows ?? [])];
  rows[r] = Math.max(rows[r], rowHeight(cells[r], cols, s.fontSize, s.font));
  return fitTable({ ...s, cells, cols, rows });
};

export type TableOp = "addRow" | "removeRow" | "addCol" | "removeCol";

/** Add or remove the last row or column. A table keeps at least one of each. */
export const applyTableOp = (s: Shape, op: TableOp): Shape => {
  let cells = s.cells ?? [];
  let cols = s.cols ?? [];
  let rows = s.rows ?? [];
  switch (op) {
    case "addRow":
      cells = [...cells, cols.map(() => "")];
      rows = [...rows, MIN_ROW];
      break;
    case "removeRow":
      if (rows.length <= 1) return s;
      cells = cells.slice(0, -1);
      rows = rows.slice(0, -1);
      break;
    case "addCol":
      cells = cells.map((row) => [...row, ""]);
      cols = [...cols, NEW_COL];
      break;
    case "removeCol":
      if (cols.length <= 1) return s;
      cells = cells.map((row) => row.slice(0, -1));
      cols = cols.slice(0, -1);
      break;
  }
  return fitTable({ ...s, cells, cols, rows });
};
