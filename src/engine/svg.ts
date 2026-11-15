// SVG export. Rather than a second renderer, this is a stand-in for the
// canvas context that writes SVG elements: drawShape runs against it
// unchanged, so an exported drawing matches the screen stroke for stroke.
// It implements only the canvas calls that drawShape makes.

import fontUrl from "@fontsource/shantell-sans/files/shantell-sans-latin-400-normal.woff2?url";
import { CANVAS_FONT } from "./render";

type Matrix = [number, number, number, number, number, number];

type State = {
  m: Matrix;
  globalAlpha: number;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  strokeStyle: string;
  fillStyle: string;
  dash: number[];
  font: string;
  textAlign: string;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetY: number;
  filter: string;
  /** Clip groups opened since the matching save(). */
  groups: number;
};

const n = (v: number) => String(Math.round(v * 100) / 100);
const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ANCHOR: Record<string, string> = { left: "start", center: "middle", right: "end" };

export class SvgContext {
  private out: string[] = [];
  private defs: string[] = [];
  private stack: State[] = [];
  private path = "";
  private ids = 0;
  private measurer = document.createElement("canvas").getContext("2d")!;
  /** True once any text in the handwriting face has been written. */
  usesHandFont = false;
  private s: State = {
    m: [1, 0, 0, 1, 0, 0],
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    strokeStyle: "#000",
    fillStyle: "#000",
    dash: [],
    font: "10px sans-serif",
    textAlign: "left",
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetY: 0,
    filter: "none",
    groups: 0,
  };

  // Plain properties drawShape assigns to.
  set globalAlpha(v: number) { this.s.globalAlpha = v; }
  get globalAlpha() { return this.s.globalAlpha; }
  set lineWidth(v: number) { this.s.lineWidth = v; }
  get lineWidth() { return this.s.lineWidth; }
  set lineCap(v: string) { this.s.lineCap = v; }
  set lineJoin(v: string) { this.s.lineJoin = v; }
  set strokeStyle(v: string) { this.s.strokeStyle = v; }
  set fillStyle(v: string) { this.s.fillStyle = v; }
  set font(v: string) { this.s.font = v; }
  set textAlign(v: string) { this.s.textAlign = v; }
  set textBaseline(_: string) { /* text is always written centred on its line */ }
  set shadowColor(v: string) { this.s.shadowColor = v; }
  set shadowBlur(v: number) { this.s.shadowBlur = v; }
  set shadowOffsetY(v: number) { this.s.shadowOffsetY = v; }
  set filter(v: string) { this.s.filter = v; }

  save() {
    this.stack.push({ ...this.s, m: [...this.s.m] as Matrix, dash: [...this.s.dash], groups: 0 });
    // The saved copy is the one to return to; the live one counts new groups.
    const saved = this.stack[this.stack.length - 1];
    saved.groups = this.s.groups;
    this.s.groups = 0;
  }

  restore() {
    const saved = this.stack.pop();
    if (!saved) return;
    for (let i = 0; i < this.s.groups; i++) this.out.push("</g>");
    this.s = saved;
  }

  setLineDash(dash: number[]) { this.s.dash = dash; }

  translate(x: number, y: number) {
    const [a, b, c, d, e, f] = this.s.m;
    this.s.m = [a, b, c, d, e + a * x + c * y, f + b * x + d * y];
  }

  rotate(angle: number) {
    const [a, b, c, d, e, f] = this.s.m;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.s.m = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f];
  }

  /* --------------------------------- Paths --------------------------------- */

  beginPath() { this.path = ""; }
  moveTo(x: number, y: number) { this.path += `M${n(x)} ${n(y)}`; }
  lineTo(x: number, y: number) { this.path += `L${n(x)} ${n(y)}`; }
  closePath() { this.path += "Z"; }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    this.path += `Q${n(cx)} ${n(cy)} ${n(x)} ${n(y)}`;
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    this.path += `C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(x)} ${n(y)}`;
  }
  /** Whole circles and ellipses only: that is all drawShape asks for. */
  ellipse(cx: number, cy: number, rx: number, ry: number) {
    this.path +=
      `M${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}` +
      `A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}Z`;
  }
  arc(cx: number, cy: number, r: number) { this.ellipse(cx, cy, r, r); }
  roundRect(x: number, y: number, w: number, h: number, r: number) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    this.path +=
      `M${n(x + q)} ${n(y)}H${n(x + w - q)}A${n(q)} ${n(q)} 0 0 1 ${n(x + w)} ${n(y + q)}` +
      `V${n(y + h - q)}A${n(q)} ${n(q)} 0 0 1 ${n(x + w - q)} ${n(y + h)}` +
      `H${n(x + q)}A${n(q)} ${n(q)} 0 0 1 ${n(x)} ${n(y + h - q)}` +
      `V${n(y + q)}A${n(q)} ${n(q)} 0 0 1 ${n(x + q)} ${n(y)}Z`;
  }

  private transform() {
    const m = this.s.m;
    return m.every((v, i) => v === [1, 0, 0, 1, 0, 0][i])
      ? ""
      : ` transform="matrix(${m.map((v) => String(Math.round(v * 1e5) / 1e5)).join(" ")})"`;
  }

  private alpha() {
    return this.s.globalAlpha < 1 ? ` opacity="${n(this.s.globalAlpha)}"` : "";
  }

  stroke() {
    if (!this.path) return;
    const s = this.s;
    const dash = s.dash.length ? ` stroke-dasharray="${s.dash.map(n).join(" ")}"` : "";
    this.out.push(
      `<path d="${this.path}" fill="none" stroke="${s.strokeStyle}" stroke-width="${n(s.lineWidth)}"` +
        ` stroke-linecap="${s.lineCap}" stroke-linejoin="${s.lineJoin}"${dash}${this.alpha()}${this.transform()}/>`,
    );
  }

  fill() {
    if (!this.path) return;
    let shadow = "";
    if (this.s.shadowBlur > 0) {
      const id = `shadow${++this.ids}`;
      this.defs.push(
        `<filter id="${id}" x="-20%" y="-20%" width="140%" height="150%">` +
          `<feDropShadow dx="0" dy="${n(this.s.shadowOffsetY)}" stdDeviation="${n(this.s.shadowBlur / 2)}"` +
          ` flood-color="#000" flood-opacity="0.18"/></filter>`,
      );
      shadow = ` filter="url(#${id})"`;
    }
    this.out.push(
      `<path d="${this.path}" fill="${this.s.fillStyle}"${shadow}${this.alpha()}${this.transform()}/>`,
    );
  }

  /** Everything drawn until the matching restore() is clipped to the path. */
  clip() {
    const id = `clip${++this.ids}`;
    this.defs.push(`<clipPath id="${id}"><path d="${this.path}"${this.transform()}/></clipPath>`);
    this.out.push(`<g clip-path="url(#${id})">`);
    this.s.groups++;
  }

  fillRect(x: number, y: number, w: number, h: number) {
    this.out.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${this.s.fillStyle}"` +
        `${this.alpha()}${this.transform()}/>`,
    );
  }

  /* ---------------------------------- Text --------------------------------- */

  measureText(text: string) {
    this.measurer.font = this.s.font;
    return this.measurer.measureText(text);
  }

  fillText(text: string, x: number, y: number) {
    const match = /([\d.]+)px\s+(.*)$/.exec(this.s.font);
    const size = match ? match[1] : "16";
    const family = match ? match[2] : "sans-serif";
    if (family.includes(CANVAS_FONT)) this.usesHandFont = true;
    this.out.push(
      `<text x="${n(x)}" y="${n(y)}" font-family="${esc(family)}" font-size="${size}"` +
        ` text-anchor="${ANCHOR[this.s.textAlign] ?? "start"}" dominant-baseline="central"` +
        ` fill="${this.s.fillStyle}" xml:space="preserve"${this.alpha()}${this.transform()}>${esc(text)}</text>`,
    );
  }

  /* --------------------------------- Images -------------------------------- */

  drawImage(img: HTMLImageElement, x: number, y: number, w: number, h: number) {
    const filter = this.s.filter !== "none" ? ` style="filter:${this.s.filter}"` : "";
    this.out.push(
      `<image href="${esc(img.src)}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"` +
        ` preserveAspectRatio="none"${filter}${this.alpha()}${this.transform()}/>`,
    );
  }

  /** The finished document. `fontCss` embeds the handwriting face. */
  finish(width: number, height: number, fontCss: string) {
    const style = fontCss ? `<style>${fontCss}</style>` : "";
    const defs = this.defs.length || style ? `<defs>${style}${this.defs.join("")}</defs>` : "";
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}"` +
      ` viewBox="0 0 ${n(width)} ${n(height)}">${defs}${this.out.join("")}</svg>`
    );
  }
}

let fontCss: Promise<string> | null = null;

/**
 * The handwriting face as an embedded @font-face rule, so an exported SVG
 * looks the same on a machine that has never opened loosedraw.
 */
export const handFontCss = () =>
  (fontCss ??= fetch(fontUrl)
    .then((r) => r.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(
              `@font-face{font-family:"${CANVAS_FONT}";font-weight:400;src:url(${reader.result}) format("woff2");}`,
            );
          reader.onerror = () => resolve("");
          reader.readAsDataURL(blob);
        }),
    )
    .catch(() => ""));
