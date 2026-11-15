import { useEffect, useRef, useState } from "react";
import { LIBRARY_DRAG_TYPE } from "./engine/Canvas";
import { unionBounds } from "./engine/geom";
import { CANVAS_FONT, drawShape } from "./engine/render";
import type { Shape, Theme } from "./engine/types";
import { Icons } from "./icons";
import { LIBRARY } from "./library";
import { loadMyShapes, saveMyShapes, uid, type SavedShape } from "./store";

const MINE = "My shapes";

type Props = {
  theme: Theme;
  /** What is selected on the canvas, to save as a library item. */
  selected: Shape[];
  onInsert: (shapes: Shape[]) => void;
  onClose: () => void;
};

const PREVIEW_W = 104;
const PREVIEW_H = 72;

/** A small drawing of a library item, rendered by the real canvas renderer. */
function Preview({ shapes, theme }: { shapes: Shape[]; theme: Theme }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => {
      const canvas = ref.current;
      const ctx = canvas?.getContext("2d");
      const box = unionBounds(shapes);
      if (!canvas || !ctx || !box) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = PREVIEW_W * dpr;
      canvas.height = PREVIEW_H * dpr;
      const pad = 8;
      const scale = Math.min(
        (PREVIEW_W - pad * 2) / Math.max(box.w, 1),
        (PREVIEW_H - pad * 2) / Math.max(box.h, 1),
        1,
      );
      ctx.setTransform(
        dpr * scale, 0, 0, dpr * scale,
        dpr * ((PREVIEW_W - box.w * scale) / 2 - box.x * scale),
        dpr * ((PREVIEW_H - box.h * scale) / 2 - box.y * scale),
      );
      for (const s of shapes) drawShape(ctx, s, { theme, onImageLoad: draw });
    };
    draw();
    void document.fonts.load(`16px "${CANVAS_FONT}"`).then(draw);
  }, [shapes, theme]);

  return <canvas ref={ref} style={{ width: PREVIEW_W, height: PREVIEW_H }} />;
}

const ALL = "All";

/** Saved shapes keep distinct names: a repeat gets a number after it. */
const uniqueName = (wanted: string, taken: string[]) => {
  const names = new Set(taken.map((n) => n.toLowerCase()));
  if (!names.has(wanted.toLowerCase())) return wanted;
  let n = 2;
  while (names.has(`${wanted} ${n}`.toLowerCase())) n++;
  return `${wanted} ${n}`;
};

export function LibraryPanel({ theme, selected, onInsert, onClose }: Props) {
  const [pack, setPack] = useState(ALL);
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState<SavedShape[]>([]);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);

  useEffect(() => {
    void loadMyShapes().then(setMine);
  }, []);

  const store = (items: SavedShape[]) => {
    setMine(items);
    void saveMyShapes(items);
  };

  const saveSelection = () => {
    const ids = new Set(selected.map((s) => s.id));
    // Saved as it stands, minus ties to anything left behind on the canvas.
    const shapes = selected.map((s) => ({
      ...s,
      groupId: undefined,
      locked: undefined,
      startBind: s.startBind && ids.has(s.startBind) ? s.startBind : undefined,
      endBind: s.endBind && ids.has(s.endBind) ? s.endBind : undefined,
    }));
    const wanted = name.trim() || "Shape";
    store([...mine, { id: uid(), name: uniqueName(wanted, mine.map((m) => m.name)), shapes }]);
    setName("");
  };

  const q = query.trim().toLowerCase();
  const matches = (itemName: string, packName: string) =>
    !q || itemName.toLowerCase().includes(q) || packName.toLowerCase().includes(q);
  // Searching looks through every pack; otherwise one pack, or all of them.
  const sections = [
    { name: MINE, items: mine.map((m) => ({ ...m, saved: true })) },
    ...LIBRARY.map((p) => ({ name: p.name, items: p.items.map((it) => ({ ...it, id: it.name, saved: false })) })),
  ]
    .filter((section) => q || pack === ALL || section.name === pack)
    .map((section) => ({ ...section, items: section.items.filter((it) => matches(it.name, section.name)) }))
    .filter((section) => section.items.length > 0);
  const total = LIBRARY.reduce((sum, p) => sum + p.items.length, 0) + mine.length;

  const dragProps = (shapes: Shape[]) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(LIBRARY_DRAG_TYPE, JSON.stringify(shapes));
      e.dataTransfer.effectAllowed = "copy";
    },
  });

  return (
    <aside className="history library">
      <header>
        <strong>Shape library</strong>
        <button className="icon" title="Close" aria-label="Close" onClick={onClose}>
          {Icons.x}
        </button>
      </header>
      <label className="search">
        {Icons.search}
        <input
          placeholder={`Search ${total} shapes`}
          aria-label="Search the shape library"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="pack-tabs" role="tablist">
        {[ALL, MINE, ...LIBRARY.map((p) => p.name)].map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={!q && tab === pack}
            className={!q && tab === pack ? "on" : ""}
            onClick={() => {
              setQuery("");
              setPack(tab);
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      {pack === MINE && !q && (
        <form
          className="save-shape"
          onSubmit={(e) => {
            e.preventDefault();
            if (selected.length) saveSelection();
          }}
        >
          <input
            placeholder={selected.length ? "Name (optional)" : "Select shapes on the canvas first"}
            aria-label="Name for the saved shape"
            disabled={!selected.length}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="primary" disabled={!selected.length}>
            Save selection
          </button>
        </form>
      )}
      <div className="library-scroll">
        {sections.map((section) => (
          <section key={section.name}>
            {(q || pack === ALL) && <h3>{section.name}</h3>}
            <div className="library-grid">
              {section.items.map((item) =>
                item.saved ? (
                  <div key={item.id} className="library-item mine">
                    {renaming === item.id ? (
                      <div className="rename">
                        <Preview shapes={item.shapes} theme={theme} />
                        <input
                          autoFocus
                          aria-label="New name"
                          defaultValue={item.name}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (next) {
                              const others = mine.filter((m) => m.id !== item.id).map((m) => m.name);
                              store(mine.map((m) => (m.id === item.id ? { ...m, name: uniqueName(next, others) } : m)));
                            }
                            setRenaming(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") setRenaming(null);
                          }}
                        />
                      </div>
                    ) : (
                      <button
                        title={`Add ${item.name}. Double-click the name to rename.`}
                        onClick={() => onInsert(item.shapes)}
                        {...dragProps(item.shapes)}
                      >
                        <Preview shapes={item.shapes} theme={theme} />
                        <span
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setRenaming(item.id);
                          }}
                        >
                          {item.name}
                        </span>
                      </button>
                    )}
                    <span className="item-actions">
                      <button title={`Rename ${item.name}`} aria-label={`Rename ${item.name}`} onClick={() => setRenaming(item.id)}>
                        {Icons.pencil}
                      </button>
                      <button
                        title={`Remove ${item.name} from My shapes`}
                        aria-label={`Remove ${item.name} from My shapes`}
                        onClick={() => store(mine.filter((m) => m.id !== item.id))}
                      >
                        {Icons.x}
                      </button>
                    </span>
                  </div>
                ) : (
                  <button
                    key={item.id}
                    className="library-item"
                    title={`Add ${item.name}`}
                    onClick={() => onInsert(item.shapes)}
                    {...dragProps(item.shapes)}
                  >
                    <Preview shapes={item.shapes} theme={theme} />
                    <span>{item.name}</span>
                  </button>
                ),
              )}
            </div>
          </section>
        ))}
        {sections.length === 0 && (
          <p className="hint">
            {q
              ? `No shapes match “${query.trim()}”.`
              : "Nothing saved yet. Select shapes on the canvas, then save them here to reuse in any scene."}
          </p>
        )}
      </div>
      <p className="hint">Click a shape to add it, or drag it onto the canvas. Everything stays editable.</p>
    </aside>
  );
}
