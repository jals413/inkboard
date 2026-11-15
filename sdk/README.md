# Loosedraw SDK

Build Loosedraw scenes in code. The SDK has no dependencies and runs in Node, Deno, Bun and the browser. A scene can be saved as an `.loosedraw` file or opened in the app with a link.

It is not published to npm yet. Build it from this repository:

```bash
npm run build:sdk
```

Then import `sdk/dist/index.js`.

## A diagram, laid out for you

Say what connects to what; the SDK places the boxes.

```js
import { writeFileSync } from "node:fs";
import { Scene } from "./sdk/dist/index.js";

const scene = new Scene("Checkout flow");
scene.graph({
  direction: "LR",
  nodes: [
    { id: "cart", text: "Cart", shape: "ellipse", color: "green", fill: "green" },
    { id: "pay", text: "Payment ok?", shape: "diamond" },
    { id: "ship", text: "Ship order", color: "blue", fill: "blue" },
  ],
  edges: [
    { from: "cart", to: "pay" },
    { from: "pay", to: "ship", label: "yes" },
  ],
});

writeFileSync("checkout.loosedraw", scene.toJSON());     // import it from the app's sidebar
console.log(scene.toLink("http://localhost:5173"));     // or open this link
```

## Shapes at exact positions

Every method returns the new shape's id. Pass ids to `arrow` and `line` to attach them; attached arrows follow their shapes when moved in the app.

```js
const scene = new Scene("Login");
scene.frame({ x: 0, y: 0, w: 360, h: 300, title: "Login" });
scene.text({ x: 30, y: 30, text: "Welcome back", fontSize: 26 });
const button = scene.rect({ x: 30, y: 220, w: 300, h: 48, text: "Sign in", color: "blue", fill: "blue" });
const note = scene.note({ x: 440, y: 60, text: "Add SSO later" });
scene.arrow({ from: note, to: button, label: "here" });
scene.table({ x: 440, y: 290, cells: [["Field", "Rule"], ["Email", "required"]] });
```

## Reference

| Method | What it adds |
|---|---|
| `rect`, `ellipse`, `diamond`, `note` | A box with optional `text`. Leave out `w` and `h` to size it to the text. Options: `color`, `fill`, `fillStyle`, `dash`, `strokeWidth`, `fontSize`, `font`, `opacity`. |
| `text` | Free text at a point. |
| `arrow`, `line` | A connector. `from` and `to` are shape ids or `{ x, y }` points. Options: `label`, `color`, `dash`, `elbow`, `startHead`, `endHead`. |
| `frame` | A named region. |
| `table` | A table from rows of cells. The first row is the header. |
| `graph` | Nodes, edges and optional groups, laid out in layers. Returns the shape id for each node id. |
| `mermaid` | A Mermaid flowchart (`flowchart TD …` or `graph LR …`). Other Mermaid diagram kinds are not supported. |
| `libraryItem(name, { x, y })` | A ready-made item from the shape library. `Scene.library()` lists the names. Returns the id of its main shape. |
| `toJSON` | The text of an `.loosedraw` file. |
| `toLink(appUrl, into?)` | A link that opens the scene in the app: as a new scene, or with `"current"` added to the scene that is open. The scene sits after the `#`, so it is not sent to a server. |

Colours are `ink`, `red`, `orange`, `green`, `blue`, `purple`, `yellow`, or any hex colour.

`scene.shapes` is the plain array of shapes, if you need to read or adjust them directly.

## Limits

- Text sizes are estimated, since there is no canvas to measure with. The app re-measures free text and re-seats attached arrows when it opens the scene.
- Images, pen strokes and formulas have no builder methods yet.
