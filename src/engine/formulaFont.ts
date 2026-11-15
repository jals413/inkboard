// Formulas are SVG images that use the handwriting face. An image cannot see
// the page's fonts, so the font has to be inside the SVG; but storing a copy
// with every formula would bloat scenes. Instead the stored SVG carries an
// empty slot, and the font is poured into it just before the image is shown.

import { handFontCss } from "./svg";

export const FORMULA_FONT_SLOT = '<style id="ink-font"></style>';
// Serialising the SVG may write the empty element either way.
const SLOT = /<style id="ink-font"\s*(?:\/>|><\/style>)/;
const PREFIX = "data:image/svg+xml;base64,";

const decode = (base64: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0)));

const encode = (text: string) => {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const filled = new Map<string, Promise<string>>();

/** The image to actually load for `src`: the same, with the font filled in. */
export const withFormulaFont = (src: string): Promise<string> => {
  let result = filled.get(src);
  if (!result) {
    result = (async () => {
      if (!src.startsWith(PREFIX)) return src;
      const svg = decode(src.slice(PREFIX.length));
      if (!SLOT.test(svg)) return src;
      const css = await handFontCss();
      return PREFIX + encode(svg.replace(SLOT, `<style>${css}</style>`));
    })().catch(() => src);
    filled.set(src, result);
  }
  return result;
};
