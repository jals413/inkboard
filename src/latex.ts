// LaTeX -> self-contained SVG, via MathJax. MathJax is large, so it is loaded
// on first use rather than with the app.

import { CANVAS_FONT } from "./engine/render";
import { FORMULA_FONT_SLOT, withFormulaFont } from "./engine/formulaFont";

export type RenderedFormula = {
  /** What is stored on the shape: small, without the font file. */
  dataURL: string;
  /** The same image with the handwriting font embedded, to show right away. */
  previewURL: string;
  /** Natural size in px at 100% zoom. */
  width: number;
  height: number;
};

const EX_TO_PX = 10;

type Renderer = (latex: string) => string;
let renderer: Promise<Renderer> | null = null;

const loadRenderer = (): Promise<Renderer> => {
  renderer ??= (async () => {
    const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, { AllPackages }] =
      await Promise.all([
        import("mathjax-full/js/mathjax.js"),
        import("mathjax-full/js/input/tex.js"),
        import("mathjax-full/js/output/svg.js"),
        import("mathjax-full/js/adaptors/liteAdaptor.js"),
        import("mathjax-full/js/handlers/html.js"),
        import("mathjax-full/js/input/tex/AllPackages.js"),
      ]);
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const doc = mathjax.document("", {
      InputJax: new TeX({ packages: AllPackages }),
      OutputJax: new SVG({ fontCache: "none" }),
    });
    return (latex: string) =>
      adaptor.innerHTML(doc.convert(latex, { display: true }));
  })();
  return renderer;
};

const toBase64 = (text: string) => {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

/** Throws an Error with MathJax's message if the LaTeX is invalid. */
export const renderLatex = async (latex: string, printed = false): Promise<RenderedFormula> => {
  const render = await loadRenderer();
  let svg = render(latex);

  const error = svg.match(/data-mjx-error="([^"]*)"/);
  if (error) throw new Error(error[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));

  const w = svg.match(/width="([\d.]+)ex"/);
  const h = svg.match(/height="([\d.]+)ex"/);
  if (!w || !h) throw new Error("Could not render formula");
  const width = Math.max(1, parseFloat(w[1]) * EX_TO_PX);
  const height = Math.max(1, parseFloat(h[1]) * EX_TO_PX);

  // Fixed pixel size and colour so the SVG renders the same as a standalone image.
  svg = svg
    .replace(/width="[\d.]+ex"/, `width="${width}px"`)
    .replace(/height="[\d.]+ex"/, `height="${height}px"`)
    .replace(/currentColor/g, "#1e1e1e");

  // Printed formulas are left exactly as typeset.
  if (printed) {
    const dataURL = `data:image/svg+xml;base64,${toBase64(svg)}`;
    return { dataURL, previewURL: dataURL, width, height };
  }

  // Maths has no handwriting typeface, so the printed glyphs are given a
  // slight wobble instead, to sit with the hand-drawn shapes around them.
  // The numbers are in the formula's own units, 1000 to the em.
  svg = svg
    .replace(
      /<svg[^>]*>/,
      (open) =>
        `${open}<defs><filter id="ink-hand" x="-5%" y="-10%" width="110%" height="120%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.0045" numOctaves="2" seed="7" result="noise"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="noise" scale="38" xChannelSelector="R" yChannelSelector="G"/>` +
        `</filter></defs><g filter="url(#ink-hand)">`,
    )
    .replace(/<\/svg>\s*$/, "</g></svg>");

  svg = await handwrite(svg);

  const dataURL = `data:image/svg+xml;base64,${toBase64(svg)}`;
  return { dataURL, previewURL: await withFormulaFont(dataURL), width, height };
};

/** Code points MathJax uses for the letters and digits we can hand-write. */
const handChar = (code: number): string | null => {
  if ((code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
    return String.fromCharCode(code);
  }
  // Mathematical italic A–Z and a–z; the italic h has a code point of its own.
  if (code >= 0x1d434 && code <= 0x1d44d) return String.fromCharCode(0x41 + code - 0x1d434);
  if (code >= 0x1d44e && code <= 0x1d467) return String.fromCharCode(0x61 + code - 0x1d44e);
  if (code === 0x210e) return "h";
  return null;
};

/**
 * Swap the printed letters and digits for the handwriting face. MathJax has
 * already worked out where every glyph goes; each letter is redrawn as text
 * centred on the glyph it replaces, and squeezed if it would be wider.
 * Operators, roots, fraction bars and Greek keep MathJax's own drawing.
 */
const handwrite = async (source: string): Promise<string> => {
  await document.fonts.load(`16px "${CANVAS_FONT}"`);
  // The SVG has to be in the page for the browser to measure its glyphs.
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden";
  host.innerHTML = source;
  document.body.append(host);
  try {
    const svg = host.querySelector("svg");
    if (!svg) return source;
    const NS = "http://www.w3.org/2000/svg";
    for (const glyph of [...svg.querySelectorAll<SVGPathElement>("path[data-c]")]) {
      const char = handChar(parseInt(glyph.getAttribute("data-c") ?? "", 16));
      if (!char) continue;
      const box = glyph.getBBox();
      const text = document.createElementNS(NS, "text");
      text.textContent = char;
      text.setAttribute("x", String(Math.round(box.x + box.width / 2)));
      text.setAttribute("y", "0");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-family", `"${CANVAS_FONT}"`);
      // MathJax works in units of 1000 to the em, with y pointing up.
      text.setAttribute("font-size", "900");
      text.setAttribute("stroke", "none");
      text.setAttribute("transform", `${glyph.getAttribute("transform") ?? ""} scale(1,-1)`.trim());
      glyph.replaceWith(text);
      const room = box.width * 1.2;
      if (text.getComputedTextLength() > room) {
        text.setAttribute("textLength", String(Math.round(room)));
        text.setAttribute("lengthAdjust", "spacingAndGlyphs");
      }
    }
    // An empty slot: the font file is added when the image is shown, so
    // scenes do not store a copy of it with every formula.
    svg.insertAdjacentHTML("afterbegin", FORMULA_FONT_SLOT);
    return new XMLSerializer().serializeToString(svg);
  } finally {
    host.remove();
  }
};
