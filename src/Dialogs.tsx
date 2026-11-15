import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ExportOptions } from "./engine/Canvas";
import { Icons } from "./icons";
import { mermaidToShapes } from "./engine/mermaid";
import type { Shape } from "./engine/types";
import { renderLatex, type RenderedFormula } from "./latex";

function Modal({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={`modal ${className}`}
        role="dialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        // Keep typing in the dialog from triggering canvas shortcuts.
        onKeyDown={(e) => e.key !== "Escape" && e.stopPropagation()}
      >
        <header>
          <strong>{title}</strong>
          <button className="icon" title="Close" aria-label="Close" onClick={onClose}>
            {Icons.x}
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmRequest;
  onClose: () => void;
}) {
  return (
    <Modal title={request.title} onClose={onClose}>
      <p className="modal-text">{request.message}</p>
      <footer>
        <button onClick={onClose}>Cancel</button>
        <button
          autoFocus
          className={request.danger ? "primary danger" : "primary"}
          onClick={() => {
            request.onConfirm();
            onClose();
          }}
        >
          {request.confirmLabel}
        </button>
      </footer>
    </Modal>
  );
}

export function FormulaDialog({
  initial,
  initialPrinted,
  onSubmit,
  onClose,
}: {
  /** Existing LaTeX when editing a formula, otherwise undefined. */
  initial?: string;
  initialPrinted?: boolean;
  onSubmit: (latex: string, rendered: RenderedFormula, printed: boolean) => void;
  onClose: () => void;
}) {
  const [latex, setLatex] = useState(initial ?? "");
  const [printed, setPrinted] = useState(initialPrinted ?? false);
  const [rendered, setRendered] = useState<RenderedFormula | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const source = latex.trim();
    if (!source) {
      setRendered(null);
      setError(null);
      return;
    }
    let alive = true;
    const t = window.setTimeout(() => {
      renderLatex(source, printed).then(
        (r) => alive && (setRendered(r), setError(null)),
        (e: Error) => alive && (setRendered(null), setError(e.message)),
      );
    }, 150);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [latex, printed]);

  const submit = () => rendered && onSubmit(latex.trim(), rendered, printed);

  return (
    <Modal title={initial === undefined ? "Insert formula" : "Edit formula"} onClose={onClose}>
      <label className="stack">
        LaTeX
        <textarea
          rows={4}
          autoFocus
          spellCheck={false}
          className="mono"
          value={latex}
          placeholder={"E = mc^2"}
          onChange={(e) => setLatex(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
      </label>
      <div className="option">
        <span>Lettering</span>
        <div className="segmented">
          <button className={printed ? "" : "on"} onClick={() => setPrinted(false)}>
            Handwritten
          </button>
          <button className={printed ? "on" : ""} onClick={() => setPrinted(true)}>
            Printed
          </button>
        </div>
      </div>
      <div className="formula-preview">
        {rendered && <img src={rendered.previewURL} alt="Formula preview" />}
        {error && <span className="error">{error}</span>}
        {!rendered && !error && <span className="hint">Preview</span>}
      </div>
      <footer>
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!rendered} onClick={submit}>
          {initial === undefined ? "Insert" : "Update"}
        </button>
      </footer>
    </Modal>
  );
}

/* --------------------------------- Export --------------------------------- */

export function ExportDialog({
  hasSelection,
  onDownload,
  onCopy,
  onClose,
}: {
  hasSelection: boolean;
  onDownload: (options: ExportOptions) => void;
  onCopy: (options: ExportOptions) => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<ExportOptions>({
    format: "png",
    background: true,
    scale: 2,
    selectionOnly: hasSelection,
  });
  const set = (patch: Partial<ExportOptions>) => setOptions((o) => ({ ...o, ...patch }));

  return (
    <Modal title="Export image" onClose={onClose}>
      <div className="option">
        <span>Format</span>
        <div className="segmented">
          <button className={options.format === "png" ? "on" : ""} onClick={() => set({ format: "png" })}>
            PNG
          </button>
          <button className={options.format === "svg" ? "on" : ""} onClick={() => set({ format: "svg" })}>
            SVG
          </button>
        </div>
      </div>
      {options.format === "png" && (
        <div className="option">
          <span>Size</span>
          <div className="segmented">
            {[1, 2, 3].map((scale) => (
              <button key={scale} className={options.scale === scale ? "on" : ""} onClick={() => set({ scale })}>
                {scale}×
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="option check">
        <span>Background</span>
        <input
          type="checkbox"
          checked={options.background}
          onChange={(e) => set({ background: e.target.checked })}
        />
      </label>
      <label className={`option check ${hasSelection ? "" : "off"}`}>
        <span>Selection only</span>
        <input
          type="checkbox"
          disabled={!hasSelection}
          checked={options.selectionOnly && hasSelection}
          onChange={(e) => set({ selectionOnly: e.target.checked })}
        />
      </label>
      <footer>
        <button onClick={onClose}>Cancel</button>
        <button
          disabled={options.format === "svg"}
          title={options.format === "svg" ? "Copying works for PNG" : "Copy to the clipboard"}
          onClick={() => onCopy(options)}
        >
          Copy
        </button>
        <button autoFocus className="primary" onClick={() => onDownload(options)}>
          Download
        </button>
      </footer>
    </Modal>
  );
}

/* ----------------------------- Command palette ---------------------------- */

export type Command = { label: string; keys?: string; group: string; icon?: ReactNode; run: () => void };

const RECENT_KEY = "recent-commands";
const RECENT = "Recently used";
const readRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
};

/**
 * Every command in one searchable list, in named sections, with the ones
 * used last on top.
 */
export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  // One flat, ordered list to move through; section headings are drawn
  // wherever the section changes.
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matching = commands.filter((c) => {
      const text = `${c.group} ${c.label}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
    if (words.length) return matching.map((c) => ({ ...c, section: c.group }));
    const id = (c: Command) => `${c.group}:${c.label}`;
    const recent = readRecent()
      .map((key) => commands.find((c) => id(c) === key))
      .filter((c): c is Command => !!c)
      .map((c) => ({ ...c, section: RECENT }));
    return [...recent, ...matching.map((c) => ({ ...c, section: c.group }))];
  }, [commands, query]);

  useEffect(() => {
    list.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const run = (command?: Command) => {
    if (!command) return;
    const key = `${command.group}:${command.label}`;
    localStorage.setItem(RECENT_KEY, JSON.stringify([key, ...readRecent().filter((k) => k !== key)].slice(0, 5)));
    onClose();
    command.run();
  };

  return (
    <Modal title="Commands" onClose={onClose} className="palette">
      <label className="palette-search">
        {Icons.search}
        <input
          autoFocus
          placeholder="Search commands, tools and scenes"
          aria-label="Search commands"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setIndex((i) => Math.min(shown.length - 1, i + 1));
            else if (e.key === "ArrowUp") setIndex((i) => Math.max(0, i - 1));
            else if (e.key === "Enter") run(shown[index]);
            else return;
            e.preventDefault();
          }}
        />
      </label>
      <div className="palette-list" ref={list} role="listbox">
        {shown.map((c, i) => (
          <div key={`${c.section}:${c.group}:${c.label}`}>
            {(i === 0 || shown[i - 1].section !== c.section) && <h3>{c.section}</h3>}
            <div
              role="option"
              aria-selected={i === index}
              className={`palette-item ${i === index ? "on" : ""}`}
              onMouseMove={() => setIndex(i)}
              onClick={() => run(c)}
            >
              <span className="palette-icon">{c.icon}</span>
              <span className="label">{c.label}</span>
              {c.keys && <kbd>{c.keys}</kbd>}
            </div>
          </div>
        ))}
        {shown.length === 0 && <p className="empty">Nothing matches “{query.trim()}”</p>}
      </div>
      <div className="palette-foot">
        <span><kbd>↑↓</kbd> Move</span>
        <span><kbd>↵</kbd> Run</span>
        <span><kbd>Esc</kbd> Close</span>
      </div>
    </Modal>
  );
}

/* -------------------------------- Shortcuts ------------------------------- */

export function ShortcutsDialog({ mod, alt, onClose }: { mod: string; alt: string; onClose: () => void }) {
  const hold = mod.replace("+", "");
  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: "Tools",
      rows: [
        ["Select", "V or 1"], ["Rectangle", "R or 2"], ["Diamond", "D or 3"], ["Ellipse", "O or 4"],
        ["Arrow", "A or 5"], ["Line", "L or 6"], ["Pen", "P or 7"], ["Text", "T or 8"],
        ["Sticky note", "N or 9"], ["Eraser", "E or 0"], ["Pan", "H or hold Space"], ["Frame", "F"],
        ["Laser pointer", "K"], ["Highlighter", "M"], ["Keep the tool picked", "Q"],
        ["Table", `${alt}T`], ["Formula", `${alt}M`],
      ],
    },
    {
      title: "Editor",
      rows: [
        ["Undo", `${mod}Z`], ["Redo", `⇧${mod}Z`], ["Copy, cut, paste", `${mod}C  ${mod}X  ${mod}V`],
        ["Copy style", `${mod}${alt}C`], ["Paste style", `${mod}${alt}V`],
        ["Duplicate", `${mod}D`], ["Delete", "Delete"], ["Select all", `${mod}A`],
        ["Group", `${mod}G`], ["Ungroup", `⇧${mod}G`], ["Lock or unlock", `⇧${mod}L`],
        ["Bring forward", `${mod}]`], ["Send backward", `${mod}[`],
        ["Bring to front", `⇧${mod}]`], ["Send to back", `⇧${mod}[`],
        ["Flip horizontally", "⇧H"], ["Flip vertically", "⇧V"],
        ["Nudge", "Arrow keys"], ["Nudge further", "⇧ Arrow keys"],
        ["Edit text, label or cell", "Double-click or Enter"], ["Finish typing", `Esc or ${mod}Enter`],
        ["Add a connected shape", `${mod}Arrow keys`], ["Next table cell", "Tab"],
        ["Keep proportions, or turn in 15° steps", "Hold ⇧"], ["Move without snapping", `Hold ${hold}`],
        ["Add to selection", "⇧ click"],
      ],
    },
    {
      title: "View",
      rows: [
        ["Zoom in", `${mod}+`], ["Zoom out", `${mod}-`], ["Reset zoom", `${mod}0`],
        ["Zoom with the wheel", `${mod}scroll or pinch`], ["Zoom to fit everything", "⇧1"],
        ["Zoom to selection", "⇧2"], ["Find on canvas", `${mod}F`],
        ["All commands", `${mod}/ or ${mod}K`], ["Light or dark theme", `⇧${alt}D`],
        ["Show or hide sidebar", `${mod}\\`], ["New scene", `${alt}N`],
        ["Export image", `⇧${mod}E`], ["Copy as image", `⇧${alt}C`], ["Keyboard shortcuts", "?"],
      ],
    },
  ];
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} className="shortcuts">
      <div className="shortcut-groups">
        {groups.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            {g.rows.map(([label, keys]) => (
              <div className="shortcut" key={label}>
                <span>{label}</span>
                <kbd>{keys}</kbd>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  );
}

/* --------------------------------- Mermaid -------------------------------- */

const MERMAID_SAMPLE = `flowchart TD
  A([Start]) --> B{Signed in?}
  B -->|Yes| C[Open dashboard]
  B -->|No| D[Show sign-in]
  D --> B
  C --> E([Done])`;

export function MermaidDialog({
  onInsert,
  onClose,
}: {
  onInsert: (shapes: Shape[]) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState(MERMAID_SAMPLE);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    try {
      onInsert(mermaidToShapes(source));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title="Mermaid to diagram" onClose={onClose}>
      <label className="stack">
        Flowchart in Mermaid syntax
        <textarea
          rows={9}
          autoFocus
          spellCheck={false}
          className="mono"
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
      </label>
      <p className="modal-text hint-text">
        {error ? <span className="error">{error}</span> : "Becomes ordinary shapes and attached arrows you can edit. Pasting a flowchart onto the canvas does the same."}
      </p>
      <footer>
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!source.trim()} onClick={submit}>
          Insert
        </button>
      </footer>
    </Modal>
  );
}
