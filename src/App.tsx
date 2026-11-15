import { useCallback, useEffect, useRef, useState } from "react";
import { Board } from "./Board";
import {
  CommandPalette,
  ConfirmDialog,
  ExportDialog,
  FormulaDialog,
  MermaidDialog,
  ShortcutsDialog,
  type Command,
  type ConfirmRequest,
} from "./Dialogs";
import type { EngineApi, EngineState, ExportOptions } from "./engine/Canvas";
import type { Shape } from "./engine/types";
import { hintFor } from "./hints";
import { HistoryPanel } from "./HistoryPanel";
import { backgroundColor, loadPrefs, savePrefs, type Prefs, type ThemeChoice } from "./prefs";
import { LibraryPanel } from "./LibraryPanel";
import { Icons } from "./icons";
import { Sidebar } from "./Sidebar";
import {
  FILE_EXTENSION,
  TRASH_DAYS,
  addVersion,
  deleteSceneData,
  loadLibrary,
  loadScene,
  parseSceneFile,
  sceneFromHash,
  saveLibrary,
  saveScene,
  serializeScene,
  uid,
  type Folder,
  type Library,
  type SceneMeta,
  type Version,
} from "./store";
import { MoreMenu, Tools } from "./Toolbar";

type Theme = "light" | "dark";

/** shapeId is set when editing an existing formula. */
type FormulaRequest = { shapeId?: string; latex?: string; printed?: boolean };

const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const ALT = isMac ? "⌥" : "Alt+";
const MOD = isMac ? "⌘" : "Ctrl+";

const initialTheme = (): ThemeChoice => {
  const stored = localStorage.getItem("theme");
  return stored === "light" || stored === "dark" ? stored : "system";
};

const systemTheme = (): Theme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

const initialSidebar = () => {
  const stored = localStorage.getItem("sidebar");
  return stored ? stored === "open" : window.innerWidth > 900;
};

const newMeta = (name: string, folderId: string | null): SceneMeta => {
  const now = Date.now();
  return { id: uid(), name, folderId, createdAt: now, updatedAt: now };
};

const nextName = (lib: Library, base = "Untitled") => {
  const names = new Set(lib.scenes.map((s) => s.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
};

const withOpen = (lib: Library, id: string): Library => ({
  ...lib,
  openTabs: lib.openTabs.includes(id) ? lib.openTabs : [...lib.openTabs, id],
  activeId: id,
});

export function App() {
  const [lib, setLib] = useState<Library | null>(null);
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(initialTheme);
  const [system, setSystem] = useState<Theme>(systemTheme);
  const theme: Theme = themeChoice === "system" ? system : themeChoice;
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const changePrefs = useCallback(
    (patch: Partial<Prefs>) =>
      setPrefs((current) => {
        const next = { ...current, ...patch };
        savePrefs(next);
        return next;
      }),
    [],
  );
  const [sidebarOpen, setSidebarOpen] = useState(initialSidebar);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [formula, setFormula] = useState<FormulaRequest | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [engine, setEngine] = useState<EngineState | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mermaidOpen, setMermaidOpen] = useState(false);
  const api = useRef<EngineApi | null>(null);

  // Load once; a first-time visitor gets one empty scene.
  useEffect(() => {
    loadLibrary().then((loaded) => {
      // Scenes that have sat in the trash long enough are deleted for good.
      const cutoff = Date.now() - TRASH_DAYS * 86400 * 1000;
      const expired = loaded.scenes.filter((s) => s.deletedAt && s.deletedAt < cutoff);
      if (expired.length) {
        for (const s of expired) void deleteSceneData(s.id);
        loaded = { ...loaded, scenes: loaded.scenes.filter((s) => !expired.includes(s)) };
      }
      if (loaded.scenes.length === 0) {
        const meta = newMeta("Untitled", null);
        loaded = withOpen({ ...loaded, scenes: [meta] }, meta.id);
      }
      setLib(loaded);
    });
  }, []);

  useEffect(() => {
    if (lib) void saveLibrary(lib);
  }, [lib]);

  // A link ending in #scene=… carries a whole scene (from the SDK or an AI
  // tool). Open it as a new scene, then drop it from the address bar.
  const loaded = lib !== null;
  useEffect(() => {
    if (!loaded) return;
    const take = async () => {
      if (!/[#&](scene|add)=/.test(location.hash)) return;
      const hash = location.hash;
      history.replaceState(null, "", location.pathname + location.search);
      try {
        const scene = sceneFromHash(hash);
        if (!scene) return;
        // "Add" drops the shapes into the scene that is open, as one undo step.
        if (scene.add && api.current) {
          api.current.insertShapes(scene.shapes, false);
          setToast(`Added ${scene.shapes.length} shapes to this scene. Undo removes them.`);
          return;
        }
        const meta = newMeta(scene.name?.trim() || "Imported", null);
        await saveScene(meta.id, { shapes: scene.shapes });
        update((l) => withOpen({ ...l, scenes: [...l.scenes, meta] }, meta.id));
        setToast(`Opened “${meta.name}” as a new scene.`);
      } catch {
        setToast("That link did not contain a scene loosedraw can read.");
      }
    };
    void take();
    window.addEventListener("hashchange", take);
    return () => window.removeEventListener("hashchange", take);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    localStorage.setItem("theme", themeChoice);
    document.documentElement.style.colorScheme = theme;
  }, [theme, themeChoice]);

  // "Auto" follows the device as it switches between light and dark.
  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystem(query.matches ? "dark" : "light");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebar", sidebarOpen ? "open" : "closed");
  }, [sidebarOpen]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const activeName = lib?.scenes.find((s) => s.id === lib.activeId)?.name;
  useEffect(() => {
    document.title = activeName ? `${activeName} · loosedraw` : "loosedraw";
  }, [activeName]);

  const update = useCallback(
    (fn: (l: Library) => Library) => setLib((l) => (l ? fn(l) : l)),
    [],
  );

  const onSaved = useCallback(
    (id: string) =>
      update((l) => ({
        ...l,
        scenes: l.scenes.map((s) =>
          s.id === id ? { ...s, updatedAt: Date.now() } : s,
        ),
      })),
    [update],
  );

  const openScene = (id: string) => {
    update((l) => withOpen(l, id));
    if (window.innerWidth <= 700) setSidebarOpen(false);
  };

  const newScene = (folderId: string | null) =>
    update((l) => {
      const meta = newMeta(nextName(l), folderId);
      const folders = l.folders.map((f) =>
        f.id === folderId ? { ...f, collapsed: false } : f,
      );
      return withOpen({ ...l, folders, scenes: [...l.scenes, meta] }, meta.id);
    });

  const closeTab = (id: string) =>
    update((l) => {
      const i = l.openTabs.indexOf(id);
      const openTabs = l.openTabs.filter((t) => t !== id);
      const activeId =
        l.activeId === id ? (openTabs[i] ?? openTabs[i - 1] ?? null) : l.activeId;
      return { ...l, openTabs, activeId };
    });

  /** Deleting moves a scene to the trash, where it can be restored. */
  const deleteScene = (id: string) => {
    const scene = lib?.scenes.find((s) => s.id === id);
    if (!scene) return;
    closeTab(id);
    patchScene(id, { deletedAt: Date.now() });
    setToast(`“${scene.name}” moved to trash.`);
  };

  const restoreScene = (id: string) => {
    patchScene(id, { deletedAt: undefined });
    openScene(id);
  };

  const purge = (ids: string[]) => {
    update((l) => ({ ...l, scenes: l.scenes.filter((s) => !ids.includes(s.id)) }));
    for (const id of ids) void deleteSceneData(id);
  };

  const purgeScene = (id: string) => {
    const scene = lib?.scenes.find((s) => s.id === id);
    if (!scene) return;
    setConfirmRequest({
      title: "Delete forever",
      message: `“${scene.name}” and its version history will be permanently deleted from this device. This cannot be undone.`,
      confirmLabel: "Delete forever",
      danger: true,
      onConfirm: () => purge([id]),
    });
  };

  const emptyTrash = () => {
    const ids = lib?.scenes.filter((s) => s.deletedAt).map((s) => s.id) ?? [];
    if (!ids.length) return;
    setConfirmRequest({
      title: "Empty trash",
      message: `${ids.length} scene${ids.length === 1 ? "" : "s"} and their version history will be permanently deleted from this device. This cannot be undone.`,
      confirmLabel: "Empty trash",
      danger: true,
      onConfirm: () => purge(ids),
    });
  };

  const duplicateScene = async (id: string) => {
    const scene = lib?.scenes.find((s) => s.id === id);
    if (!scene) return;
    const data = await loadScene(id);
    const meta = newMeta(`${scene.name} copy`, scene.folderId);
    if (data) await saveScene(meta.id, data);
    update((l) => withOpen({ ...l, scenes: [...l.scenes, meta] }, meta.id));
  };

  const importFiles = async (files: FileList) => {
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const data = await parseSceneFile(file);
        const meta = newMeta(file.name.replace(/\.loosedraw$|\.inkboard$|\.excalidraw$|\.json$/i, ""), null);
        await saveScene(meta.id, data);
        update((l) => withOpen({ ...l, scenes: [...l.scenes, meta] }, meta.id));
      } catch {
        failed.push(file.name);
      }
    }
    if (failed.length) {
      setToast(`Could not import ${failed.join(", ")}: not an loosedraw file.`);
    }
  };

  const newFolder = () =>
    update((l) => ({
      ...l,
      folders: [...l.folders, { id: uid(), name: nextFolderName(l) }],
    }));

  const deleteFolder = (id: string) => {
    const folder = lib?.folders.find((f) => f.id === id);
    if (!folder) return;
    const remove = () =>
      update((l) => ({
        ...l,
        folders: l.folders.filter((f) => f.id !== id),
        scenes: l.scenes.map((s) =>
          s.folderId === id ? { ...s, folderId: null } : s,
        ),
      }));
    const count = lib!.scenes.filter((s) => s.folderId === id).length;
    if (count === 0) return remove();
    setConfirmRequest({
      title: "Delete folder",
      message: `“${folder.name}” will be removed. Its ${count} scene${count === 1 ? "" : "s"} will be kept and moved out of the folder.`,
      confirmLabel: "Delete folder",
      onConfirm: remove,
    });
  };

  const patchScene = (id: string, patch: Partial<SceneMeta>) =>
    update((l) => ({
      ...l,
      scenes: l.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  const patchFolder = (id: string, fn: (f: Folder) => Folder) =>
    update((l) => ({
      ...l,
      folders: l.folders.map((f) => (f.id === id ? fn(f) : f)),
    }));

  const liveShapes = () => api.current?.getShapes() ?? [];

  const saveVersionNow = async () => {
    if (!lib?.activeId) return;
    await addVersion(lib.activeId, liveShapes(), "Manual");
    setHistoryKey((k) => k + 1);
  };

  const restoreVersion = async (v: Version) => {
    if (!lib?.activeId || !api.current) return;
    // Keep what is on the canvas now, so a restore can itself be reversed.
    const current = liveShapes();
    if (current.length) await addVersion(lib.activeId, current, "Before restore");
    api.current.loadShapes(v.shapes);
    setHistoryKey((k) => k + 1);
    setToast("Version restored. Undo to go back.");
  };

  const selectedFormula =
    engine?.selected.length === 1 && engine.selected[0].latex !== undefined
      ? engine.selected[0]
      : null;

  const openFormulaDialog = (shape: Shape | null = selectedFormula) =>
    setFormula(shape ? { shapeId: shape.id, latex: shape.latex, printed: shape.font === "sans" } : {});

  const insertImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const img = new Image();
      img.onload = () => {
        // Large photos come in at a workable size; they can be resized after.
        const scale = Math.min(1, 480 / img.naturalWidth);
        api.current?.insertImage({ src, w: img.naturalWidth * scale, h: img.naturalHeight * scale });
      };
      img.onerror = () => setToast(`Could not read "${file.name}" as an image.`);
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  /** A blank 3 × 3 table; pasting spreadsheet cells makes a filled one. */
  const insertTable = () =>
    api.current?.insertTable([
      ["", "", ""],
      ["", "", ""],
      ["", "", ""],
    ]);

  const activeScene = () => lib?.scenes.find((sc) => sc.id === lib.activeId);

  const saveToFile = () => {
    const scene = activeScene();
    if (!scene) return;
    download(
      new Blob([serializeScene(scene.name, liveShapes())], { type: "application/json" }),
      `${scene.name}${FILE_EXTENSION}`,
    );
  };

  const downloadImage = async (options: ExportOptions) => {
    const scene = activeScene();
    const blob = await api.current?.exportImage(options);
    if (!scene || !blob) return setToast("Nothing to export yet.");
    download(blob, `${scene.name}.${options.format}`);
  };

  const copyImage = async (
    options: ExportOptions = { format: "png", background: true, scale: 2, selectionOnly: true },
  ) => {
    if (!api.current?.getShapes().length) return setToast("Nothing to copy yet.");
    try {
      // The clipboard takes the promise itself, so the copy still counts as
      // part of the click that asked for it.
      const blob = api.current
        .exportImage({ ...options, format: "png" })
        .then((b) => b ?? Promise.reject(new Error("empty")));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setToast("Copied as an image.");
    } catch {
      setToast("This browser would not allow copying an image. Use Export instead.");
    }
  };

  const clearCanvas = () =>
    setConfirmRequest({
      title: "Clear canvas",
      message: "Everything on this scene will be removed. You can undo this, and earlier versions stay in version history.",
      confirmLabel: "Clear canvas",
      danger: true,
      onConfirm: () => api.current?.loadShapes([]),
    });

  // App shortcuts. Registered in the capture phase so they win over the canvas.
  const shortcuts = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcuts.current = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    // The palette's own shortcut closes it again.
    const paletteKey =
      mod && !e.altKey && ((e.code === "KeyK" && !e.shiftKey) || e.code === "Slash" || (e.code === "KeyP" && e.shiftKey));
    if (paletteKey && paletteOpen) {
      e.preventDefault();
      return setPaletteOpen(false);
    }
    if (formula || confirmRequest || exportOpen || paletteOpen || shortcutsOpen || mermaidOpen) return;
    const typing =
      e.target instanceof HTMLElement &&
      (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
    let handled = true;
    if (mod && !e.altKey && e.code === "Backslash") setSidebarOpen((o) => !o);
    else if (paletteKey) setPaletteOpen(true);
    else if (e.altKey && e.shiftKey && !mod && e.code === "KeyD") setThemeChoice(theme === "dark" ? "light" : "dark");
    else if (mod && !e.altKey && !e.shiftKey && e.code === "KeyF" && lib?.activeId) setFindOpen(true);
    else if (mod && e.shiftKey && e.code === "KeyE" && lib?.activeId) setExportOpen(true);
    else if (e.altKey && e.shiftKey && !mod && e.code === "KeyC" && lib?.activeId) void copyImage();
    else if (!typing && !mod && !e.altKey && (e.key === "?" || (e.shiftKey && e.code === "Slash"))) setShortcutsOpen(true);
    else if (e.altKey && !mod && e.code === "KeyN") newScene(null);
    else if (e.altKey && !mod && e.code === "KeyT" && lib?.activeId) insertTable();
    else if (e.altKey && !mod && e.code === "KeyM" && lib?.activeId) openFormulaDialog();
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => shortcuts.current(e);
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  if (!lib) return null;

  const active = lib.scenes.find((s) => s.id === lib.activeId && !s.deletedAt) ?? null;

  // Everything the app can do, for the command palette, in its sections.
  const a = api.current;
  const cmd = (group: string, label: string, run: () => void, keys?: string, icon?: React.ReactNode): Command => ({
    group, label, run, keys, icon,
  });
  const toggleTheme = () => setThemeChoice(theme === "dark" ? "light" : "dark");
  const sceneCommands: Command[] = [
    cmd("Tools", "Select", () => a?.setTool("select"), "V", Icons.cursor),
    cmd("Tools", "Pan", () => a?.setTool("hand"), "H", Icons.hand),
    cmd("Tools", "Rectangle", () => a?.setTool("rect"), "R", Icons.rectangle),
    cmd("Tools", "Diamond", () => a?.setTool("diamond"), "D", Icons.diamond),
    cmd("Tools", "Ellipse", () => a?.setTool("ellipse"), "O", Icons.ellipse),
    cmd("Tools", "Arrow", () => a?.setTool("arrow"), "A", Icons.arrow),
    cmd("Tools", "Line", () => a?.setTool("line"), "L", Icons.line),
    cmd("Tools", "Pen", () => a?.setTool("draw"), "P", Icons.draw),
    cmd("Tools", "Highlighter", () => a?.setTool("highlight"), "M", Icons.highlighter),
    cmd("Tools", "Text", () => a?.setTool("text"), "T", Icons.text),
    cmd("Tools", "Sticky note", () => a?.setTool("note"), "N", Icons.note),
    cmd("Tools", "Frame", () => a?.setTool("frame"), "F", Icons.frame),
    cmd("Tools", "Eraser", () => a?.setTool("eraser"), "E", Icons.eraser),
    cmd("Tools", "Laser pointer", () => a?.setTool("laser"), "K", Icons.laser),
    cmd("Tools", "Keep the tool picked after drawing", () => a?.toggleToolLock(), "Q", Icons.lock),
    cmd("Insert", "Table", insertTable, `${ALT}T`, Icons.table),
    cmd("Insert", "Formula", () => openFormulaDialog(), `${ALT}M`, Icons.sigma),
    cmd("Insert", "Mermaid to diagram", () => setMermaidOpen(true), undefined, Icons.flow),
    cmd("Insert", "Shape library", () => { setHistoryOpen(false); setLibraryOpen(true); }, undefined, Icons.library),
    ...(["right", "down", "left", "up"] as const).map((dir) =>
      cmd(
        "Insert",
        `Connected shape to the ${dir === "up" ? "top" : dir === "down" ? "bottom" : dir}`,
        () => a?.quickCreate(dir),
        `${MOD}${{ right: "→", down: "↓", left: "←", up: "↑" }[dir]}`,
        Icons.plus,
      ),
    ),
    cmd("Edit", "Undo", () => a?.undo(), `${MOD}Z`, Icons.undo),
    cmd("Edit", "Redo", () => a?.redo(), `⇧${MOD}Z`, Icons.redo),
    cmd("Edit", "Select all", () => a?.selectAll(), `${MOD}A`, Icons.cursor),
    cmd("Edit", "Duplicate", () => a?.duplicateSelection(), `${MOD}D`, Icons.copy),
    cmd("Edit", "Delete", () => a?.deleteSelection(), "Delete", Icons.trash),
    cmd("Edit", "Copy style", () => a?.copyStyle(), `${MOD}${ALT}C`, Icons.sliders),
    cmd("Edit", "Paste style", () => a?.pasteStyle(), `${MOD}${ALT}V`, Icons.sliders),
    cmd("Edit", "Group", () => a?.group(), `${MOD}G`, Icons.group),
    cmd("Edit", "Ungroup", () => a?.ungroup(), `⇧${MOD}G`, Icons.ungroup),
    cmd("Edit", "Lock or unlock", () => a?.toggleLock(), `⇧${MOD}L`, Icons.lock),
    cmd("Arrange", "Bring forward", () => a?.reorder("forward"), `${MOD}]`, Icons.layerUp),
    cmd("Arrange", "Send backward", () => a?.reorder("backward"), `${MOD}[`, Icons.layerDown),
    cmd("Arrange", "Bring to front", () => a?.reorder("front"), `⇧${MOD}]`, Icons.layerFront),
    cmd("Arrange", "Send to back", () => a?.reorder("back"), `⇧${MOD}[`, Icons.layerBack),
    cmd("Arrange", "Flip horizontally", () => a?.flip("x"), "⇧H", Icons.distributeX),
    cmd("Arrange", "Flip vertically", () => a?.flip("y"), "⇧V", Icons.distributeY),
    cmd("Arrange", "Align left", () => a?.align("left"), undefined, Icons.alignLeft),
    cmd("Arrange", "Align centres horizontally", () => a?.align("centerX"), undefined, Icons.alignCenterX),
    cmd("Arrange", "Align right", () => a?.align("right"), undefined, Icons.alignRight),
    cmd("Arrange", "Align top", () => a?.align("top"), undefined, Icons.alignTop),
    cmd("Arrange", "Align middles vertically", () => a?.align("centerY"), undefined, Icons.alignCenterY),
    cmd("Arrange", "Align bottom", () => a?.align("bottom"), undefined, Icons.alignBottom),
    cmd("Arrange", "Space evenly across", () => a?.distribute("x"), undefined, Icons.distributeX),
    cmd("Arrange", "Space evenly down", () => a?.distribute("y"), undefined, Icons.distributeY),
    cmd("View", "Zoom in", () => a?.zoomBy(1.2), `${MOD}+`, Icons.plus),
    cmd("View", "Zoom out", () => a?.zoomBy(1 / 1.2), `${MOD}-`, Icons.minus),
    cmd("View", "Reset zoom", () => a?.resetZoom(), `${MOD}0`, Icons.search),
    cmd("View", "Zoom to fit everything", () => a?.zoomToFit(), "⇧1", Icons.fit),
    cmd("View", "Zoom to selection", () => a?.zoomToFit(true), "⇧2", Icons.fit),
    cmd("View", "Find on canvas", () => setFindOpen(true), `${MOD}F`, Icons.search),
    cmd("Export", "Export image…", () => setExportOpen(true), `⇧${MOD}E`, Icons.image),
    cmd("Export", "Copy as image", () => void copyImage(), `⇧${ALT}C`, Icons.clipboard),
    cmd("Export", "Save to file", saveToFile, undefined, Icons.download),
    cmd("Scene", "Version history", () => { setLibraryOpen(false); setHistoryOpen(true); }, undefined, Icons.history),
    cmd("Scene", "Clear canvas", clearCanvas, undefined, Icons.trash),
  ];
  const commands: Command[] = [
    ...(active ? sceneCommands : []),
    cmd("Scene", "New scene", () => newScene(null), `${ALT}N`, Icons.plus),
    cmd("Scene", "New folder", newFolder, undefined, Icons.folderPlus),
    cmd("App", sidebarOpen ? "Hide sidebar" : "Show sidebar", () => setSidebarOpen((o) => !o), `${MOD}\\`, Icons.sidebar),
    cmd("App", theme === "dark" ? "Light theme" : "Dark theme", toggleTheme, `⇧${ALT}D`, theme === "dark" ? Icons.sun : Icons.moon),
    cmd("App", "Keyboard shortcuts", () => setShortcutsOpen(true), "?", Icons.keyboard),
    ...lib.scenes
      .filter((sc) => !sc.deletedAt && sc.id !== lib.activeId)
      .map((sc) => cmd("Open a scene", sc.name, () => openScene(sc.id), undefined, Icons.scene)),
  ];
  const tabs = lib.openTabs
    .map((id) => lib.scenes.find((s) => s.id === id))
    .filter((s): s is SceneMeta => !!s && !s.deletedAt);

  return (
    <div className="app" data-theme={theme}>
      {sidebarOpen && (
        <>
          <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />
          <Sidebar
            lib={lib}
            onOpen={openScene}
            onNewScene={newScene}
            onNewFolder={newFolder}
            onRenameScene={(id, name) => patchScene(id, { name })}
            onDuplicateScene={duplicateScene}
            onDeleteScene={deleteScene}
            onMoveScene={(id, folderId) => patchScene(id, { folderId })}
            onRenameFolder={(id, name) => patchFolder(id, (f) => ({ ...f, name }))}
            onToggleFolder={(id) =>
              patchFolder(id, (f) => ({ ...f, collapsed: !f.collapsed }))
            }
            onDeleteFolder={deleteFolder}
            onImport={importFiles}
            onRestoreScene={restoreScene}
            onPurgeScene={purgeScene}
            onEmptyTrash={emptyTrash}
          />
        </>
      )}
      <main>
        <nav className="topbar">
          <div className="topbar-start">
          <button
            className={`icon ${sidebarOpen ? "on" : ""}`}
            title={`${sidebarOpen ? "Hide" : "Show"} sidebar (${MOD}\\)`}
            aria-label="Toggle sidebar"
            onClick={() => setSidebarOpen((o) => !o)}
          >
            {Icons.sidebar}
          </button>
          <div className="tab-list" role="tablist">
            {tabs.map((s) => (
              <div
                key={s.id}
                role="tab"
                aria-selected={s.id === lib.activeId}
                className={`tab ${s.id === lib.activeId ? "active" : ""}`}
                onClick={() => openScene(s.id)}
                onAuxClick={(e) => e.button === 1 && closeTab(s.id)}
                title={s.name}
              >
                <span className="name">{s.name}</span>
                <button
                  title="Close tab"
                  aria-label={`Close ${s.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(s.id);
                  }}
                >
                  {Icons.x}
                </button>
              </div>
            ))}
            <button
              className="icon"
              title={`New scene (${ALT}N)`}
              aria-label="New scene"
              onClick={() => newScene(null)}
            >
              {Icons.plus}
            </button>
          </div>
          </div>
          <div className="topbar-end">
            <MoreMenu
              disabled={!active}
              theme={theme}
              themeChoice={themeChoice}
              onTheme={setThemeChoice}
              prefs={prefs}
              onPrefs={changePrefs}
              background={active?.background}
              onBackground={(background) => active && patchScene(active.id, { background })}
              toolLock={engine?.toolLock ?? false}
              onToolLock={() => api.current?.toggleToolLock()}
              onSaveFile={saveToFile}
              onExportImage={() => setExportOpen(true)}
              onCopyImage={() => void copyImage()}
              onMermaid={() => setMermaidOpen(true)}
              onFind={() => setFindOpen(true)}
              onCommands={() => setPaletteOpen(true)}
              onShortcuts={() => setShortcutsOpen(true)}
              mod={MOD}
              onHistory={() => {
                setLibraryOpen(false);
                setHistoryOpen((o) => !o);
              }}
              onClear={clearCanvas}
            />
          </div>
        </nav>
        <div className="stage">
          {active && (
            <div className="float toolbar-float">
              <Tools
                activeTool={engine?.tool ?? "select"}
                toolLock={engine?.toolLock ?? false}
                onToolLock={() => api.current?.toggleToolLock()}
                disabled={!active}
                formulaSelected={!!selectedFormula}
                altKey={ALT}
                onTool={(tool) => api.current?.setTool(tool)}
                libraryOpen={libraryOpen}
                onTable={insertTable}
                onLibrary={() => {
                  setHistoryOpen(false);
                  setLibraryOpen((o) => !o);
                }}
                onImage={insertImageFile}
                onFormula={() => openFormulaDialog()}
              />
            </div>
          )}
          {active && prefs.hints && engine && (
            <p className="tool-hint">{hintFor(engine.tool, engine.selected, engine.editing)}</p>
          )}
          {active ? (
            <Board
              key={active.id}
              sceneId={active.id}
              theme={theme}
              apiRef={api}
              onSaved={onSaved}
              onState={setEngine}
              onEditFormula={openFormulaDialog}
              background={backgroundColor(active.background, theme)}
              prefs={prefs}
              onPrefs={changePrefs}
              onNotice={setToast}
              findOpen={findOpen}
              onCloseFind={() => setFindOpen(false)}
            />
          ) : (
            <div className="no-scene">
              <h2>No scene open</h2>
              <p>Pick a scene from the sidebar, or start a new one.</p>
              <button className="primary" onClick={() => newScene(null)}>
                {Icons.plus} New scene
              </button>
            </div>
          )}
          {libraryOpen && active && (
            <LibraryPanel
              theme={theme}
              selected={engine?.selected ?? []}
              onInsert={(shapes) => api.current?.insertShapes(shapes)}
              onClose={() => setLibraryOpen(false)}
            />
          )}
          {historyOpen && active && (
            <HistoryPanel
              sceneId={active.id}
              refreshKey={historyKey}
              onSaveNow={saveVersionNow}
              onRestore={restoreVersion}
              onClose={() => setHistoryOpen(false)}
            />
          )}
        </div>
      </main>

      {formula && (
        <FormulaDialog
          initial={formula.latex}
          initialPrinted={formula.printed}
          onClose={() => setFormula(null)}
          onSubmit={(latex, rendered, printed) => {
            const image = {
              src: rendered.dataURL, w: rendered.width, h: rendered.height, latex,
              // Remembered so that editing the formula keeps its lettering.
              font: printed ? ("sans" as const) : undefined,
            };
            if (formula.shapeId) api.current?.updateImage(formula.shapeId, image);
            else api.current?.insertImage(image);
            setFormula(null);
          }}
        />
      )}
      {exportOpen && (
        <ExportDialog
          hasSelection={(engine?.selected.length ?? 0) > 0}
          onClose={() => setExportOpen(false)}
          onDownload={(options) => {
            setExportOpen(false);
            void downloadImage(options);
          }}
          onCopy={(options) => {
            setExportOpen(false);
            void copyImage(options);
          }}
        />
      )}
      {mermaidOpen && (
        <MermaidDialog
          onClose={() => setMermaidOpen(false)}
          onInsert={(shapes) => {
            api.current?.insertShapes(shapes, false);
            setMermaidOpen(false);
          }}
        />
      )}
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
      {shortcutsOpen && <ShortcutsDialog mod={MOD} alt={ALT} onClose={() => setShortcutsOpen(false)} />}
      {confirmRequest && (
        <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

const nextFolderName = (lib: Library) => {
  const names = new Set(lib.folders.map((f) => f.name));
  if (!names.has("New folder")) return "New folder";
  let n = 2;
  while (names.has(`New folder ${n}`)) n++;
  return `New folder ${n}`;
};
