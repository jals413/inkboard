# Inkboard MCP server

Lets any AI tool that speaks the Model Context Protocol (Claude Code, Claude Desktop, Cursor and others) draw on Inkboard. Ask for a diagram in plain words; the tool builds it and it opens in Inkboard as a new, fully editable scene.

## Set it up

Build the SDK once, since the server uses it:

```bash
npm install
```

```bash
npm run build:sdk
```

Then register the server with your AI tool. For Claude Code, from this folder:

```bash
claude mcp add inkboard -- node "$(pwd)/mcp/server.mjs"
```

For tools configured with JSON (Claude Desktop, Cursor), use the full path to this folder:

```json
{
  "mcpServers": {
    "inkboard": {
      "command": "node",
      "args": ["/full/path/to/inkboard/mcp/server.mjs"],
      "env": { "INKBOARD_URL": "http://localhost:5173" }
    }
  }
}
```

Inkboard itself must be running at `INKBOARD_URL` for scenes to open (`npm run dev` while developing).

## Tools

| Tool | Use it for |
|---|---|
| `create_diagram` | Boxes joined by arrows, laid out automatically: flowcharts, architecture, org charts, state machines. |
| `create_from_mermaid` | A Mermaid flowchart turned into editable shapes. |
| `create_canvas` | Shapes at exact positions: wireframes, sticky-note boards, tables, annotated layouts. Can place ready-made library items. |
| `list_library` | The names of the ready-made shapes (servers, databases, phones, charts and more) that `create_canvas` can place. |

Each tool saves an `.inkboard` file and, unless called with `open: false`, opens the scene in your browser.

By default the result opens as a new scene. With `target: "current"` the shapes are added to whichever scene is open in Inkboard instead, as one undo step.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `INKBOARD_URL` | `http://localhost:5173` | Where the Inkboard app runs. |
| `INKBOARD_DIR` | `~/Inkboard` | Where `.inkboard` files are saved. |

## How a scene reaches the app

The scene travels inside the link, after the `#`. Browsers do not send that part to any server, so the diagram goes from your machine straight into the app in your browser. Scenes too large for a link are saved as a file only; import the file from Inkboard's sidebar.

## Limits

- The server can add to the open scene, but it cannot read it or change shapes already on it; that needs the live connection planned with collaboration.
- Formulas, images and pen strokes cannot be created yet.
- It runs from this repository. It is not published to npm yet.
