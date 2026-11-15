import { useRef, useState } from "react";
import { Icons, Logo } from "./icons";
import type { Folder, Library, SceneMeta } from "./store";

type Props = {
  lib: Library;
  onOpen: (id: string) => void;
  onNewScene: (folderId: string | null) => void;
  onNewFolder: () => void;
  onRenameScene: (id: string, name: string) => void;
  onDuplicateScene: (id: string) => void;
  onDeleteScene: (id: string) => void;
  onMoveScene: (id: string, folderId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onToggleFolder: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onImport: (files: FileList) => void;
  onRestoreScene: (id: string) => void;
  onPurgeScene: (id: string) => void;
  onEmptyTrash: () => void;
};

const timeAgo = (ts: number) => {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function Sidebar(p: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const trash = p.lib.scenes
    .filter((s) => s.deletedAt)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  const fileInput = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const matches = (s: SceneMeta) => !q || s.name.toLowerCase().includes(q);
  const byRecent = (a: SceneMeta, b: SceneMeta) => b.updatedAt - a.updatedAt;
  const scenesIn = (folderId: string | null) =>
    p.lib.scenes
      .filter((s) => !s.deletedAt && s.folderId === folderId && matches(s))
      .sort(byRecent);

  const dropProps = (key: string, folderId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(key);
    },
    onDragLeave: () => setDropTarget((t) => (t === key ? null : t)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(null);
      const id = e.dataTransfer.getData("text/scene-id");
      if (id) p.onMoveScene(id, folderId);
    },
  });

  const renderScene = (s: SceneMeta) => (
    <li
      key={s.id}
      className={`row scene ${s.id === p.lib.activeId ? "active" : ""}`}
      draggable={editing !== s.id}
      onDragStart={(e) => e.dataTransfer.setData("text/scene-id", s.id)}
      onClick={() => p.onOpen(s.id)}
      onDoubleClick={() => setEditing(s.id)}
      title={s.name}
    >
      <span className="row-icon">{Icons.scene}</span>
      {editing === s.id ? (
        <NameInput
          initial={s.name}
          onDone={(name) => {
            setEditing(null);
            if (name) p.onRenameScene(s.id, name);
          }}
        />
      ) : (
        <>
          <span className="name">{s.name}</span>
          <span className="meta">{timeAgo(s.updatedAt)}</span>
          <span className="actions" onClick={(e) => e.stopPropagation()}>
            <button title="Rename" aria-label="Rename" onClick={() => setEditing(s.id)}>
              {Icons.pencil}
            </button>
            <button title="Duplicate" aria-label="Duplicate" onClick={() => p.onDuplicateScene(s.id)}>
              {Icons.copy}
            </button>
            <button title="Move to trash" aria-label="Move to trash" onClick={() => p.onDeleteScene(s.id)}>
              {Icons.trash}
            </button>
          </span>
        </>
      )}
    </li>
  );

  const renderFolder = (f: Folder) => {
    const scenes = scenesIn(f.id);
    if (q && scenes.length === 0) return null;
    const open = !f.collapsed || !!q;
    return (
      <li key={f.id} className="folder">
        <div
          className={`row folder-row ${dropTarget === f.id ? "drop" : ""}`}
          onClick={() => p.onToggleFolder(f.id)}
          onDoubleClick={() => setEditing(f.id)}
          {...dropProps(f.id, f.id)}
        >
          <span className={`chevron ${open ? "open" : ""}`}>{Icons.chevron}</span>
          <span className="row-icon">{Icons.folder}</span>
          {editing === f.id ? (
            <NameInput
              initial={f.name}
              onDone={(name) => {
                setEditing(null);
                if (name) p.onRenameFolder(f.id, name);
              }}
            />
          ) : (
            <>
              <span className="name">{f.name}</span>
              <span className="actions" onClick={(e) => e.stopPropagation()}>
                <button title="New scene in folder" aria-label="New scene in folder" onClick={() => p.onNewScene(f.id)}>
                  {Icons.plus}
                </button>
                <button title="Rename" aria-label="Rename" onClick={() => setEditing(f.id)}>
                  {Icons.pencil}
                </button>
                <button title="Delete folder" aria-label="Delete folder" onClick={() => p.onDeleteFolder(f.id)}>
                  {Icons.trash}
                </button>
              </span>
            </>
          )}
        </div>
        {open && (
          <ul>
            {scenes.map(renderScene)}
            {scenes.length === 0 && <li className="empty">Drag scenes here</li>}
          </ul>
        )}
      </li>
    );
  };

  const rootScenes = scenesIn(null);
  const anyMatch =
    rootScenes.length > 0 || p.lib.folders.some((f) => scenesIn(f.id).length > 0);

  return (
    <aside className="sidebar">
      <header>
        <Logo />
        <span className="brand">Inkboard</span>
      </header>

      <div className="sidebar-actions">
        <button className="primary grow" onClick={() => p.onNewScene(null)}>
          {Icons.plus} New scene
        </button>
        <button className="outline" title="New folder" aria-label="New folder" onClick={p.onNewFolder}>
          {Icons.folderPlus}
        </button>
        <button
          className="outline"
          title="Import Inkboard or Excalidraw files"
          aria-label="Import Inkboard or Excalidraw files"
          onClick={() => fileInput.current?.click()}
        >
          {Icons.upload}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".inkboard,.excalidraw,application/json"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) p.onImport(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <label className="search">
        {Icons.search}
        <input
          placeholder="Search scenes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <ul
        className={`tree ${dropTarget === "root" ? "drop" : ""}`}
        {...dropProps("root", null)}
      >
        {p.lib.folders.map(renderFolder)}
        {rootScenes.map(renderScene)}
        {q && !anyMatch && <li className="empty">No scenes match “{query.trim()}”</li>}
      </ul>

      {trash.length > 0 && (
        <div className="trash">
          <div className="row folder-row" onClick={() => setTrashOpen((o) => !o)}>
            <span className={`chevron ${trashOpen ? "open" : ""}`}>{Icons.chevron}</span>
            <span className="row-icon">{Icons.trash}</span>
            <span className="name">Trash</span>
            <span className="meta">{trash.length}</span>
          </div>
          {trashOpen && (
            <ul>
              {trash.map((s) => (
                <li key={s.id} className="row scene trashed" title={`${s.name}: deleted ${timeAgo(s.deletedAt!)} ago`}>
                  <span className="row-icon">{Icons.scene}</span>
                  <span className="name">{s.name}</span>
                  <span className="actions">
                    <button title="Restore" aria-label={`Restore ${s.name}`} onClick={() => p.onRestoreScene(s.id)}>
                      {Icons.restore}
                    </button>
                    <button title="Delete forever" aria-label={`Delete ${s.name} forever`} onClick={() => p.onPurgeScene(s.id)}>
                      {Icons.x}
                    </button>
                  </span>
                </li>
              ))}
              <li className="trash-note">
                Kept for 30 days.
                <button onClick={p.onEmptyTrash}>Empty trash</button>
              </li>
            </ul>
          )}
        </div>
      )}

      <footer title="Your scenes are stored in this browser on this device">
        <span className="dot" /> Saved on this device
      </footer>
    </aside>
  );
}

function NameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      className="name-input"
      autoFocus
      value={value}
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(value.trim() || null);
        if (e.key === "Escape") finish(null);
      }}
    />
  );
}
