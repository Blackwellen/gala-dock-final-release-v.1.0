// Q45-S01 (client side): allow-list sanitiser for SVG markup that is rendered with innerHTML — Studio icon layers, venue-plan glyphs,
// icon pickers, self-generated QR / barcode SVG. The database guard (migration 202610293033) refuses active content on write; this
// is the second layer so a row that predates the guard, or markup from any other source, still cannot run script in the page.
//
// It never trusts its own parse: input is tokenised and the output is *rebuilt* from allow-listed element and attribute names
// (canonical casing) with every attribute value decoded, checked and re-escaped, and every text run re-escaped. Anything the
// tokeniser does not recognise becomes escaped text, so the browser can never see a tag that this function did not emit.
// Pure string code (no DOM), so it runs the same during SSR, in the client and in unit tests.

const ELEMENTS = ["svg", "g", "path", "circle", "ellipse", "line", "polyline", "polygon", "rect", "text", "tspan", "textPath", "defs", "title", "desc",
  "symbol", "use", "image", "marker", "pattern", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "filter",
  "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight",
  "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feMerge", "feMergeNode", "feMorphology", "feOffset",
  "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence"];
const ATTRIBUTES = ["id", "class", "style", "d", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy", "fr", "dx", "dy", "width", "height",
  "points", "pathLength", "transform", "viewBox", "preserveAspectRatio", "xmlns", "xmlns:xlink", "version", "role", "aria-label", "aria-hidden", "focusable",
  "fill", "fill-opacity", "fill-rule", "clip-rule", "clip-path", "clipPathUnits", "mask", "maskUnits", "maskContentUnits", "mask-type", "opacity", "color",
  "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity",
  "vector-effect", "paint-order", "shape-rendering", "display", "visibility", "overflow", "filter", "filterUnits", "primitiveUnits",
  "color-interpolation-filters", "color-interpolation", "flood-color", "flood-opacity", "lighting-color",
  "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "spreadMethod", "patternUnits", "patternContentUnits", "patternTransform",
  "markerWidth", "markerHeight", "markerUnits", "refX", "refY", "orient",
  "in", "in2", "result", "values", "type", "mode", "operator", "k1", "k2", "k3", "k4", "stdDeviation", "edgeMode", "radius", "scale",
  "xChannelSelector", "yChannelSelector", "tableValues", "slope", "intercept", "amplitude", "exponent", "baseFrequency", "numOctaves", "seed",
  "stitchTiles", "order", "kernelMatrix", "divisor", "bias", "targetX", "targetY", "preserveAlpha", "surfaceScale", "diffuseConstant",
  "specularConstant", "specularExponent", "azimuth", "elevation", "pointsAtX", "pointsAtY", "pointsAtZ", "limitingConeAngle", "z",
  "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "alignment-baseline", "letter-spacing",
  "text-decoration", "startOffset", "textLength", "lengthAdjust", "href", "xlink:href"];
const canon = (list: string[]) => new Map(list.map(n => [n.toLowerCase(), n]));
const EL = canon(ELEMENTS), AT = canon(ATTRIBUTES);
const MAX_INPUT = 512 * 1024;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", tab: "\t", newline: "\n", colon: ":", sol: "/", lpar: "(", rpar: ")" };
/** Decode character references the way a browser would before interpreting an attribute value (missing `;` tolerated). */
export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);?/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "\ufffd"; }
    return NAMED[e.toLowerCase()] ?? m;
  });
}
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escText = (s: string) => escAttr(decodeEntities(s));
/** Lower-cased value with whitespace and control characters removed — what URL-scheme checks must look at. */
const squash = (s: string) => s.replace(/[\u0000-\u0020\u007f-\u00a0\u1680\u180e\u2000-\u200f\u2028\u2029\u205f\u3000\ufeff]+/g, "").toLowerCase();
const RASTER_DATA = /^data:image\/(png|jpe?g);base64,[a-z0-9+/=]+$/i;
const BAD_VALUE = /(javascript|vbscript|livescript):|data:|expression\(|@import|behaviou?r:|-moz-binding|<\/?script/;

function safeValue(el: string, name: string, raw: string): string | null {
  const v = decodeEntities(raw), q = squash(v);
  if (name === "href" || name === "xlink:href") {
    if (/^#[\w.:-]+$/.test(v.trim())) return v.trim();                        // same-document reference (gradients, clip paths, <use>)
    if (el === "image" && RASTER_DATA.test(v.replace(/\s+/g, ""))) return v.replace(/\s+/g, ""); // embedded PNG / JPEG only
    return null;                                                               // external, javascript:, data:text/html, svg data …
  }
  if (BAD_VALUE.test(q) || /\\/.test(v)) return null;                          // CSS escapes could spell anything — refused outright
  // url(...) in presentation attributes / style may only point inside this document (url(#gradient)).
  for (const m of q.matchAll(/url\(([^)]*)\)?/g)) if (!/^['"]?#[\w.:-]+['"]?$/.test(m[1] ?? "")) return null;
  if (name === "style") { const s = safeStyle(v); return s || null; }
  return v;
}
// Inline style keeps paint / text declarations only — never layout (position, inset, z-index, size) that could cover the page.
const STYLE_PROPS = new Set(["fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "opacity", "color", "stop-color", "stop-opacity", "flood-color", "flood-opacity",
  "lighting-color", "mask-type", "mix-blend-mode", "isolation", "clip-rule", "paint-order", "vector-effect", "shape-rendering",
  "color-interpolation-filters", "font-family", "font-size", "font-weight", "font-style", "letter-spacing", "text-anchor", "dominant-baseline", "visibility"]);
function safeStyle(v: string) {
  return v.split(";").map(d => { const c = d.indexOf(":"); return c < 0 ? null : [d.slice(0, c).trim().toLowerCase(), d.slice(c + 1).trim()] as const; })
    .filter((d): d is readonly [string, string] => !!d && STYLE_PROPS.has(d[0]) && !!d[1] && !/[{}<>]/.test(d[1]))
    .map(([p, val]) => `${p}:${val}`).join(";");
}

type Tok = { kind: "text"; v: string } | { kind: "open"; name: string; attrs: [string, string][]; self: boolean } | { kind: "close"; name: string };
const NAME = /^[a-zA-Z][\w:.-]*/;
function* tokens(src: string): Generator<Tok> {
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) { yield { kind: "text", v: src.slice(i) }; return; }
    if (lt > i) yield { kind: "text", v: src.slice(i, lt) };
    i = lt;
    // Comments, CDATA, doctype, processing instructions: dropped whole (to their terminator, or the rest of the input).
    for (const [start, end] of [["<!--", "-->"], ["<![CDATA[", "]]>"], ["<!", ">"], ["<?", ">"]] as const) {
      if (src.startsWith(start, i)) { const e = src.indexOf(end, i + start.length); i = e < 0 ? src.length : e + end.length; break; }
    }
    if (i !== lt) continue;
    const close = src[i + 1] === "/";
    const m = NAME.exec(src.slice(i + (close ? 2 : 1)));
    if (!m) { yield { kind: "text", v: "<" }; i++; continue; }                   // a stray "<" — escaped as text
    const name = m[0];
    let j = i + (close ? 2 : 1) + name.length;
    const attrs: [string, string][] = [];
    let self = false, ended = false;
    while (j < src.length) {
      const c = src[j]!;
      if (c === ">") { j++; ended = true; break; }
      if (/[\s/]/.test(c)) { if (c === "/" && src[j + 1] === ">") self = true; j++; continue; } // "/" between attributes acts as whitespace
      const an = /^[^\s/>"'=]+/.exec(src.slice(j));
      if (!an) { j++; continue; }
      j += an[0].length;
      let k = j; while (k < src.length && /\s/.test(src[k]!)) k++;
      if (src[k] !== "=") { attrs.push([an[0], ""]); continue; }
      k++; while (k < src.length && /\s/.test(src[k]!)) k++;
      const qc = src[k];
      if (qc === '"' || qc === "'") { const e = src.indexOf(qc, k + 1); if (e < 0) { j = src.length; break; } attrs.push([an[0], src.slice(k + 1, e)]); j = e + 1; }
      else { const uv = /^[^\s>]*/.exec(src.slice(k))![0]; attrs.push([an[0], uv]); j = k + uv.length; }
    }
    if (!ended) return;                                                         // unterminated tag: drop the rest
    i = j;
    yield close ? { kind: "close", name } : { kind: "open", name, attrs, self };
  }
}

/**
 * Returns `markup` reduced to allow-listed SVG. Disallowed elements are removed with everything inside them (script, style,
 * foreignObject, iframe, animate/set, unknown tags); `on*` handlers, unknown attributes, script/data URLs and external references
 * are dropped; `href` may only be a `#fragment` (or a base64 PNG/JPEG on `<image>`).
 */
export function sanitizeSvg(markup: string | null | undefined): string {
  if (!markup) return "";
  const hit = memo.get(markup);
  if (hit != null) return hit;
  const out = rebuild(markup);
  if (markup.length <= 64 * 1024) { if (memo.size >= 600) memo.delete(memo.keys().next().value!); memo.set(markup, out); }
  return out;
}
// Editors re-render layers on every pointer move; the same icon bodies are cleaned once per session (bounded, oldest evicted first).
const memo = new Map<string, string>();
function rebuild(markup: string): string {
  const src = markup.length > MAX_INPUT ? markup.slice(0, MAX_INPUT) : markup;
  let out = "", skip = 0, skipName = "";
  const open: string[] = [];
  for (const t of tokens(src)) {
    if (skip) {                                                                  // inside a removed element: track only its own nesting
      if (t.kind === "open" && !t.self && t.name.toLowerCase() === skipName) skip++;
      else if (t.kind === "close" && t.name.toLowerCase() === skipName) skip--;
      continue;
    }
    if (t.kind === "text") { out += escText(t.v); continue; }
    const el = EL.get(t.name.toLowerCase());
    if (t.kind === "close") {
      if (!el) continue;
      const at = open.lastIndexOf(el);
      if (at < 0) continue;                                                      // stray close tag
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }
    if (!el) { if (!t.self) { skip = 1; skipName = t.name.toLowerCase(); } continue; }
    let attrs = "";
    const seen = new Set<string>();
    for (const [rawName, rawValue] of t.attrs) {
      const lower = rawName.toLowerCase(), name = AT.get(lower);
      if (!name || lower.startsWith("on") || seen.has(name)) continue;
      const v = safeValue(el, name, rawValue);
      if (v == null) continue;
      seen.add(name);
      attrs += ` ${name}="${escAttr(v)}"`;
    }
    if (t.self) out += `<${el}${attrs}/>`;
    else { out += `<${el}${attrs}>`; open.push(el); }
  }
  while (open.length) out += `</${open.pop()}>`;
  return out;
}

/** A colour for an SVG/CSS attribute: hex, rgb()/hsl(), a keyword, or `fallback`. Used for barcode / QR / glyph colours. */
export function safeSvgColor(c: string | null | undefined, fallback = "#000"): string {
  const v = (c ?? "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(v) || /^(rgb|rgba|hsl|hsla)\(\s*[\d.%\s,/+-]+\)$/i.test(v) || /^[a-z]{3,20}$/i.test(v) ? v : fallback;
}
