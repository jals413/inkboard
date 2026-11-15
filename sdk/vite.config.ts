import { resolve } from "node:path";
import { defineConfig } from "vite";

// Builds the SDK as one dependency-free ES module.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    minify: false,
    lib: { entry: resolve(import.meta.dirname, "src/index.ts"), formats: ["es"], fileName: "index" },
  },
});
