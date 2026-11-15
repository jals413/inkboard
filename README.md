# Inkboard

A hand-drawn whiteboard for diagrams, notes and sketches. It runs in the browser, works offline after the first visit, and keeps your scenes on your own device.

## What it does

- Shapes, sticky notes, text, pen and highlighter, in a hand-drawn style
- Arrows that stay attached to shapes, with any number of points, curves or right-angled elbows
- Tables, LaTeX formulas, frames, and a library of about 100 ready-made shapes
- Mermaid flowcharts turned into editable diagrams
- Tabs, folders, version history and a trash for deleted scenes
- Export to PNG and SVG, and import of `.excalidraw` files
- An SDK and an MCP server, so code and AI tools can create diagrams (see `sdk/` and `mcp/`)

## Run it locally

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

## Build

```bash
npm run build
```

The site is written to `dist/`. Pushing to `main` deploys it to GitHub Pages.
