// Upserts named environment variables from the local env into the linked Vercel project (production + preview). Never prints values.
//   node --env-file=.env --env-file=.env.local scripts/vercel-env-push.mjs NAME[=FROM_NAME] ...   e.g. RESEND_API_KEY=RESEND_API
//   A literal value for a non-secret: NAME:=value (e.g. "EMAIL_FROM:=Gala Dock <no-reply@galadock.com>")
import fs from "node:fs";
import path from "node:path";

const { projects: [project] } = JSON.parse(fs.readFileSync(".vercel/repo.json", "utf8"));
const { token } = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA ?? "", "xdg.data", "com.vercel.cli", "auth.json"), "utf8"));
const args = process.argv.slice(2);
if (!args.length) { console.error("Give at least one NAME, NAME=FROM_NAME or NAME:=value."); process.exit(1); }
for (const a of args) {
  let key, value, secret = true;
  if (a.includes(":=")) { [key, value] = [a.slice(0, a.indexOf(":=")), a.slice(a.indexOf(":=") + 2)]; secret = false; }
  else { const [k, from] = a.split("="); key = k; value = process.env[from ?? k]; }
  if (!/^[A-Z0-9_]+$/.test(key) || !value) { console.error(`${key}: no value in the local env — skipped`); continue; }
  const r = await fetch(`https://api.vercel.com/v10/projects/${project.id}/env?upsert=true&teamId=${project.orgId}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ key, value, type: secret ? "encrypted" : "plain", target: ["production", "preview"] }) });
  console.log(`${key}: ${r.ok ? "set" : `failed (${r.status} ${(await r.text()).slice(0, 160)})`}${secret ? " (encrypted)" : ` = ${value}`}`);
}
