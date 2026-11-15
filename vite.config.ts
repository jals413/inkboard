import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Emits sw.js with the list of built files, so the service worker can
 * download the whole app on first visit and serve it offline afterwards.
 */
const serviceWorker = (): Plugin => ({
  name: "inkboard-service-worker",
  apply: "build",
  generateBundle(_, bundle) {
    const files = Object.keys(bundle).filter(
      (file) => !file.endsWith(".map") && !file.endsWith(".html"),
    );
    const version = createHash("sha256")
      .update(files.join("|"))
      .digest("hex")
      .slice(0, 12);
    const source = readFileSync("scripts/sw.template.js", "utf8")
      .replaceAll("__VERSION__", version)
      .replaceAll("__FILES__", JSON.stringify(["./", "favicon.svg", "manifest.webmanifest", ...files]));
    this.emitFile({ type: "asset", fileName: "sw.js", source });
  },
});

export default defineConfig({
  // Relative paths, so the build works at a domain root or in a sub-folder.
  base: "./",
  plugins: [react(), serviceWorker()],
  define: {
    // MathJax otherwise reads its version with Node's require(), which
    // does not exist in the browser.
    PACKAGE_VERSION: JSON.stringify("3.2.1"),
  },
  // MathJax ships CommonJS; make sure Vite converts these entry points.
  optimizeDeps: {
    include: [
      "mathjax-full/js/mathjax.js",
      "mathjax-full/js/input/tex.js",
      "mathjax-full/js/output/svg.js",
      "mathjax-full/js/adaptors/liteAdaptor.js",
      "mathjax-full/js/handlers/html.js",
      "mathjax-full/js/input/tex/AllPackages.js",
    ],
  },
  server: { port: 5173 },
});
