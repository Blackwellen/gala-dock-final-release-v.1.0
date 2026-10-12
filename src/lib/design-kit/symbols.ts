// Unicode symbol library (arrows, stars, shapes, maths, currency, music, dingbats…) — generated from the standard blocks, so it
// needs no download. Each symbol renders as text in any font that has it (with a system fallback).
export type SymbolGroup = { name: string; chars: string[] };
const range = (a: number, b: number, skip: (c: number) => boolean = () => false) => {
  const out: string[] = [];
  for (let c = a; c <= b; c++) { if (skip(c)) continue; const ch = String.fromCodePoint(c); if (/\p{Cn}|\p{Cc}|\p{Cs}/u.test(ch)) continue; out.push(ch); }
  return out;
};
let cached: SymbolGroup[] | null = null;
export function symbolGroups(): SymbolGroup[] {
  return cached ??= [
    { name: "Arrows", chars: [...range(0x2190, 0x21ff), ...range(0x27f0, 0x27ff), ...range(0x2900, 0x297f), ...range(0x2b00, 0x2b2f)] },
    { name: "Stars & sparkles", chars: ["★", "☆", "✦", "✧", "✩", "✪", "✫", "✬", "✭", "✮", "✯", "✰", "✱", "✲", "✳", "✴", "✵", "✶", "✷", "✸", "✹", "✺", "✻", "✼", "✽", "✾", "✿", "❀", "❁", "❂", "❃", "❄", "❅", "❆", "❇", "❈", "❉", "❊", "❋", "⁂", "⋆", "꙳", "※"] },
    { name: "Geometric shapes", chars: range(0x25a0, 0x25ff) },
    { name: "Dingbats", chars: range(0x2700, 0x27bf) },
    { name: "Miscellaneous", chars: range(0x2600, 0x26ff) },
    { name: "Hearts & suits", chars: ["♥", "♡", "❤", "❥", "❦", "❧", "♠", "♤", "♣", "♧", "♦", "♢", "☙", "❣"] },
    { name: "Music", chars: ["♩", "♪", "♫", "♬", "♭", "♮", "♯", "𝄞", "𝄢", "𝄪", "𝄫"] },
    { name: "Currency", chars: ["£", "$", "€", "¥", "¢", "₹", "₩", "₽", "₺", "₪", "₫", "₱", "₦", "₴", "₸", "₿", "฿", "¤"] },
    { name: "Maths", chars: [...range(0x2200, 0x22ff), "±", "×", "÷", "¬", "°", "µ", "¹", "²", "³", "¼", "½", "¾"] },
    { name: "Letterlike", chars: range(0x2100, 0x214f) },
    { name: "Punctuation & marks", chars: ["•", "◦", "‣", "⁃", "·", "…", "‖", "†", "‡", "§", "¶", "‰", "′", "″", "‴", "‹", "›", "«", "»", "“", "”", "‘", "’", "„", "‚", "¡", "¿", "©", "®", "™", "℗", "№", "℮", "⌘", "⌥", "⏎", "⌫", "⎋", "✓", "✔", "✗", "✘"] },
    { name: "Enclosed", chars: [...range(0x2460, 0x24ff), ...range(0x2776, 0x2793)] },
    { name: "Box & blocks", chars: [...range(0x2580, 0x259f)] },
    { name: "Technical", chars: range(0x2300, 0x23ff) },
    { name: "Chess & games", chars: ["♔", "♕", "♖", "♗", "♘", "♙", "♚", "♛", "♜", "♝", "♞", "♟", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"] },
    { name: "Zodiac & astro", chars: ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓", "☉", "☽", "☾", "☿", "♀", "♁", "♂", "♃", "♄", "♅", "♆", "♇"] },
  ].map(g => ({ ...g, chars: [...new Set(g.chars)] }));
}
export const symbolCount = () => symbolGroups().reduce((a, g) => a + g.chars.length, 0);
