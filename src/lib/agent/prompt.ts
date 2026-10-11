/**
 * Wraps untrusted records for the prompt (spec §25). JSON-encodes and escapes "<" so content can never close the <data> block or
 * smuggle tags; the system prompt tells the model data is information, never instructions.
 */
export const dataBlock = (v: unknown, max = 16000) => `<data>${JSON.stringify(v).slice(0, max).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")}</data>`;
