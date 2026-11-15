import { useEffect, useState } from "react";
import { Icons } from "./icons";
import { loadVersions, type Version } from "./store";

type Props = {
  sceneId: string;
  /** Bumped by the parent whenever versions may have changed. */
  refreshKey: number;
  onSaveNow: () => void;
  onRestore: (v: Version) => void;
  onClose: () => void;
};

const fmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function HistoryPanel(p: Props) {
  const [versions, setVersions] = useState<Version[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadVersions(p.sceneId).then((v) => alive && setVersions([...v].reverse()));
    return () => {
      alive = false;
    };
  }, [p.sceneId, p.refreshKey]);

  return (
    <aside className="history">
      <header>
        <strong>Version history</strong>
        <button className="icon" title="Close" aria-label="Close" onClick={p.onClose}>
          {Icons.x}
        </button>
      </header>
      <button className="primary" onClick={p.onSaveNow}>
        Save version now
      </button>
      <p className="hint">
        A version is also saved automatically every 5 minutes while you edit.
      </p>
      <ul>
        {versions?.length === 0 && <li className="empty">No versions yet</li>}
        {versions?.map((v) => (
          <li key={v.id} className="version">
            <div>
              <div>{fmt.format(v.ts)}</div>
              <div className="sub">
                {v.label ? `${v.label} · ` : ""}
                {v.shapes.length} object{v.shapes.length === 1 ? "" : "s"}
              </div>
            </div>
            <button onClick={() => p.onRestore(v)}>Restore</button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
