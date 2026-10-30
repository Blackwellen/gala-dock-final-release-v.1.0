import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Blocks webhook targets that resolve to private, loopback, link-local or metadata addresses (SSRF), at creation and per delivery. */
// Q30: + 192.0.0.0/24, TEST-NETs, 240/4, broadcast; IPv6 unique-local / link-local / multicast / NAT64 / documentation, and
// IPv4-mapped / -compatible IPv6 checked as their IPv4 address. Residual risk (documented): DNS can still change between this check
// and the connection; deliveries are re-checked each attempt and redirects are never followed.
const PRIVATE_V4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^198\.1[89]\./,
  /^192\.0\.0\./, /^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./, /^22[4-9]\.|^2[3-5]\d\./, /^255\.255\.255\.255$/];
const v4FromMapped = (ip: string) => {
  const m = /^(?:0{0,4}:){0,5}(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip) ?? /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (m) return m[1]!;
  const h = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (h) { const a = parseInt(h[1]!, 16), b = parseInt(h[2]!, 16); return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`; }
  return null;
};
export const privateIp = (ip: string): boolean => {
  if (isIP(ip) === 4) return PRIVATE_V4.some(r => r.test(ip));
  const mapped = v4FromMapped(ip);
  if (mapped) return PRIVATE_V4.some(r => r.test(mapped));
  return /^(::1?$|f[cd]|fe[89ab]|ff|64:ff9b:|100::|2001:db8:|2001:0?:)/i.test(ip);
};

export async function assertPublicUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Enter a valid https:// URL."); }
  if (u.protocol !== "https:") throw new Error("Webhook URLs must use https://.");
  if (u.username || u.password) throw new Error("Webhook URLs can’t contain credentials.");
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(u.hostname)) throw new Error("That host isn’t reachable from the internet.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new Error("That host name doesn’t resolve."); });
  if (!addrs.length || addrs.some(a => privateIp(a.address))) throw new Error("Webhook URLs must point to a public internet address.");
  return u.toString();
}
