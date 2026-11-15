import { useEffect, useRef } from "react";
import type { EngineApi } from "./engine/Canvas";
import { bounds, linePath, unionBounds, type Box } from "./engine/geom";
import { resolveColor } from "./engine/render";
import { NONE, isLine, type Shape, type Theme } from "./engine/types";

const WIDTH = 184;
const HEIGHT = 120;

/**
 * A small overview of the whole board with the current view outlined.
 * Click or drag in it to move around. Shapes are drawn as plain blocks:
 * at this size that reads better than their real outlines.
 */
export function Minimap({ api, theme, background }: { api: EngineApi; theme: Theme; background: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  /** How the last drawing mapped the board onto the map. */
  const map = useRef({ scale: 1, x: 0, y: 0 });

  useEffect(() => {
    let frame = 0;
    let last = "";
    let lastShapes: Shape[] | null = null;

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const canvas = ref.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const shapes = api.getShapes();
      const view = api.getView();
      // Redraw only when the board or the view has changed.
      const key = `${view.x}|${view.y}|${view.w}|${view.h}|${theme}|${background}`;
      if (key === last && shapes === lastShapes) return;
      last = key;
      lastShapes = shapes;

      const content = unionBounds(shapes) ?? view;
      const x1 = Math.min(content.x, view.x);
      const y1 = Math.min(content.y, view.y);
      const x2 = Math.max(content.x + content.w, view.x + view.w);
      const y2 = Math.max(content.y + content.h, view.y + view.h);
      const pad = 8;
      const scale = Math.min((WIDTH - pad * 2) / (x2 - x1), (HEIGHT - pad * 2) / (y2 - y1));
      const ox = (WIDTH - (x2 - x1) * scale) / 2 - x1 * scale;
      const oy = (HEIGHT - (y2 - y1) * scale) / 2 - y1 * scale;
      map.current = { scale, x: ox, y: oy };

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== WIDTH * dpr) {
        canvas.width = WIDTH * dpr;
        canvas.height = HEIGHT * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      const at = (b: Box) => [b.x * scale + ox, b.y * scale + oy, Math.max(1.5, b.w * scale), Math.max(1.5, b.h * scale)] as const;

      for (const s of shapes) {
        const color = resolveColor(s.type === "note" && s.fill !== NONE ? s.fill : s.stroke, theme);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        if (isLine(s)) {
          const pts = linePath(s);
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 1;
          ctx.beginPath();
          pts.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](p.x * scale + ox, p.y * scale + oy));
          ctx.stroke();
        } else if (s.type === "frame") {
          ctx.globalAlpha = 0.45;
          ctx.lineWidth = 1;
          ctx.strokeRect(...at(bounds(s)));
        } else {
          ctx.globalAlpha = s.type === "text" || s.type === "draw" ? 0.3 : 0.45;
          ctx.fillRect(...at(bounds(s)));
        }
      }

      // The current view.
      ctx.globalAlpha = 1;
      const accent = theme === "dark" ? "#8ab4ff" : "#2563eb";
      const [vx, vy, vw, vh] = at(view);
      ctx.fillStyle = theme === "dark" ? "rgba(138,180,255,0.12)" : "rgba(37,99,235,0.08)";
      ctx.fillRect(vx, vy, vw, vh);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vx, vy, vw, vh);
    };
    frame = requestAnimationFrame(draw);

    // Scrolling over the map scrolls the board; pinch or ⌘-scroll zooms it,
    // exactly as on the canvas itself.
    const canvas = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) api.zoomBy(Math.exp(-e.deltaY * 0.01));
      else api.panBy(e.deltaX, e.deltaY);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [api, theme, background]);

  const go = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const { scale, x, y } = map.current;
    api.centerOn((e.clientX - rect.left - x) / scale, (e.clientY - rect.top - y) / scale);
  };

  return (
    <canvas
      ref={ref}
      className="float minimap"
      style={{ width: WIDTH, height: HEIGHT }}
      role="img"
      aria-label="Overview of the board"
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Capture only smooths a drag that leaves the map.
        }
        go(e);
      }}
      onPointerMove={(e) => e.buttons === 1 && go(e)}
      onDoubleClick={() => api.zoomToFit()}
    />
  );
}
