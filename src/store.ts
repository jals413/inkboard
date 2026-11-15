import { del, get, set } from "idb-keyval";
import { applyBindings } from "./engine/geom";
import { importExcalidraw, isExcalidrawFile } from "./engine/importExcalidraw";
import { measureText } from "./engine/render";
import { uid, type Shape } from "./engine/types";

export { uid };

export type Folder = { id: string; name: string; collapsed?: boolean };

export type SceneMeta = {
  id: string;
  name: string;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  /** Set while the scene is in the trash. */
  deletedAt?: number;
  /** Canvas background: a preset key or a hex colour. Unset is the default. */
  background?: string;
};

/** Scenes in the trash are deleted for good after this long. */
export const TRASH_DAYS = 30;

export type Library = {
  folders: Folder[];
  scenes: SceneMeta[];
  openTabs: string[];
  activeId: string | null;
};

export type SceneData = { shapes: Shape[] };

export type Version = {
  id: string;
  ts: number;
  label?: string;
  shapes: Shape[];
};

const LIBRARY_KEY = "library";
const sceneKey = (id: string) => `board:${id}`;
const versionsKey = (id: string) => `history:${id}`;

export const MAX_VERSIONS = 50;
export const VERSION_INTERVAL_MS = 5 * 60 * 1000;

export const emptyLibrary = (): Library => ({
  folders: [],
  scenes: [],
  openTabs: [],
  activeId: null,
});

export const loadLibrary = async (): Promise<Library> =>
  (await get<Library>(LIBRARY_KEY)) ?? emptyLibrary();

export const saveLibrary = (lib: Library) => set(LIBRARY_KEY, lib);

export const loadScene = (id: string) => get<SceneData>(sceneKey(id));

export const saveScene = (id: string, data: SceneData) =>
  set(sceneKey(id), data);

export const deleteSceneData = async (id: string) => {
  await del(sceneKey(id));
  await del(versionsKey(id));
};

export const loadVersions = async (id: string): Promise<Version[]> =>
  (await get<Version[]>(versionsKey(id))) ?? [];

export const addVersion = async (
  id: string,
  shapes: Shape[],
  label?: string,
): Promise<Version[]> => {
  const versions = await loadVersions(id);
  versions.push({ id: uid(), ts: Date.now(), label, shapes });
  const trimmed = versions.slice(-MAX_VERSIONS);
  await set(versionsKey(id), trimmed);
  return trimmed;
};

export const FILE_EXTENSION = ".inkboard";

export const serializeScene = (name: string, shapes: Shape[]) =>
  JSON.stringify({ type: "inkboard", version: 1, name, shapes }, null, 2);

/**
 * Parse an .inkboard file, or convert an .excalidraw one, into scene data.
 * Throws if the file is neither.
 */
export const parseSceneFile = async (file: File): Promise<SceneData> =>
  parseScene(JSON.parse(await file.text()));

/** The same, from JSON that has already been read. */
export const parseScene = (json: unknown): SceneData & { name?: string } => {
  if (isExcalidrawFile(json)) return { shapes: importExcalidraw(json) };
  const scene = json as { type?: string; name?: unknown; shapes?: Shape[] };
  if (scene?.type !== "inkboard" || !Array.isArray(scene.shapes)) {
    throw new Error("Not an Inkboard file");
  }
  // Scenes built outside the app (the SDK, an AI tool) only estimate how
  // big text is: measure it properly, then re-seat the attached arrows.
  const shapes = scene.shapes
    .filter((s) => s && typeof s.id === "string" && typeof s.type === "string")
    .map((s) => (s.type === "text" ? { ...s, ...measureText(s.text ?? "", s.fontSize ?? 18, s.font) } : s));
  return { shapes: applyBindings(shapes), name: typeof scene.name === "string" ? scene.name : undefined };
};

/**
 * A scene carried in a link, after "#scene=": how the SDK and the MCP
 * server hand a diagram to the app. Returns null if the hash holds none.
 */
export const sceneFromHash = (hash: string) => {
  // "#scene=" opens a new scene; "#add=" adds to the one that is open.
  const match = /[#&](scene|add)=([\w-]+)/.exec(hash);
  if (!match) return null;
  const binary = atob(match[2].replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return { ...parseScene(JSON.parse(new TextDecoder().decode(bytes))), add: match[1] === "add" };
};

/** A shape the user saved to their own library. */
export type SavedShape = { id: string; name: string; shapes: Shape[] };

const MY_SHAPES_KEY = "my-shapes";

export const loadMyShapes = async (): Promise<SavedShape[]> =>
  (await get<SavedShape[]>(MY_SHAPES_KEY)) ?? [];

export const saveMyShapes = (items: SavedShape[]) => set(MY_SHAPES_KEY, items);
