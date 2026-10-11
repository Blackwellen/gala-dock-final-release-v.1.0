import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Blocks webhook targets that resolve to private, loopback, link-local or metadata addresses (SSRF), at creation and per delivery. */
const PRIVATE_V4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^198\.1[89]\./, /^22[4-9]\.|^2[3-5]\d\./];
const privateIp = (ip: string) => isIP(ip) === 4 ? PRIVATE_V4.some(r => r.test(ip))
  : /^(::1|::|fc|fd|fe8|fe9|fea|feb|::ffff:(10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i.test(ip);

export async function assertPublicUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Enter a valid https:// URL."); }
  if (u.protocol !== "https:") throw new Error("Webhook URLs must use https://.");
  if (u.username || u.password) throw new Error("Webhook URLs can’t contain credentials.");
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(u.hostname)) throw new Error("That host isn’t reachable from the internet.");
  const addrs = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true }).catch(() => { throw new Error("That host name doesn’t resolve."); });
  if (!addrs.length || addrs.some(a => privateIp(a.address))) throw new Error("Webhook URLs must point to a public internet address.");
  return u.toString();
}
