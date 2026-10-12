// Builds the text-free side-panel art for the auth pages (login, register, password, MFA, invite, verify). The old art had the design's headline,
// features and stats baked into the image, which ghosted through the live text. Usage: node scripts/build-story-art.mjs
import sharp from "sharp";
const SRC = "public/assets/regenerated";

/** Vertical alpha mask: rows above `from` are transparent, fully opaque from `to` down (fractions of height). */
const fadeMask = (w, h, from, to) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
  <stop offset="${from}" stop-color="#fff" stop-opacity="0"/><stop offset="${to}" stop-color="#fff" stop-opacity="1"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
const masked = async (buf, mask) => sharp(buf).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
const cover = (file, w, h, pos = "centre") => sharp(`${SRC}/${file}`).resize(w, h, { fit: "cover", position: pos }).png().toBuffer();

// ── Dark auth panel: violet sky, London skyline, lounge foreground with candle.
{
  const W = 1100, H = 1520;
  const sky = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>
    <linearGradient id="a" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#0a1a7a"/><stop offset=".3" stop-color="#3a2fb0"/><stop offset=".52" stop-color="#8a5fc8"/><stop offset=".62" stop-color="#d98ab4"/><stop offset="1" stop-color="#0b0c33"/></linearGradient>
    <radialGradient id="b" cx="1" cy="0" r=".7"><stop offset="0" stop-color="#9a86ff" stop-opacity=".55"/><stop offset="1" stop-color="#9a86ff" stop-opacity="0"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#a)"/><rect width="100%" height="100%" fill="url(#b)"/></svg>`);
  const city = await masked(await cover("london-skyline.png", W, 560, "centre"), fadeMask(W, 560, 0.0, 0.4));
  const lounge = await masked(await cover("auth-party.png", W, 520, "centre"), fadeMask(W, 520, 0.0, 0.3));
  const shade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>
    <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07103a" stop-opacity=".55"/><stop offset=".42" stop-color="#07103a" stop-opacity=".25"/><stop offset=".6" stop-color="#07103a" stop-opacity="0"/>
    <stop offset=".86" stop-color="#05061f" stop-opacity=".25"/><stop offset="1" stop-color="#05061f" stop-opacity=".85"/></linearGradient>
    <linearGradient id="l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#07103a" stop-opacity=".6"/><stop offset=".7" stop-color="#07103a" stop-opacity="0"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#t)"/><rect width="100%" height="76%" fill="url(#l)"/></svg>`);
  await sharp(sky).composite([{ input: city, top: 760, left: 0 }, { input: lounge, top: H - 520, left: 0 }, { input: shade }]).webp({ quality: 82 }).toFile("public/assets/auth-story-clean.webp");
  console.log("auth-story-clean.webp");
}
