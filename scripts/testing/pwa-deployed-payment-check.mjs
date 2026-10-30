// Read-only deployed configuration verification. Values stay in memory; never logged, written or copied locally.
// Vercel endpoint: https://vercel.com/docs/rest-api/projects/retrieve-the-decrypted-value-of-an-environment-variable-of-a-project-by-id
import fs from "node:fs";
import path from "node:path";
const report = { observedUtc: new Date().toISOString(), scope: "Linked production configuration only; no deployment or payment mutation", variables: {}, payment: { status: "unverified" } };
const names = ["STRIPE_CONNECT_SECRET_KEY", "STRIPE_PUBLIC_KEY", "STRIPE_WEBHOOK_SECRET"];
const mode = value => /^(?:sk|rk|pk)_live_/.test(value) ? "live" : /^(?:sk|rk|pk)_test_/.test(value) ? "test" : "invalid";
try {
  const project = JSON.parse(fs.readFileSync(".vercel/repo.json", "utf8")).projects[0];
  const token = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA ?? "", "xdg.data", "com.vercel.cli", "auth.json"), "utf8")).token;
  const get = url => fetch(`https://api.vercel.com${url}?teamId=${encodeURIComponent(project.orgId)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  const response = await get(`/v10/projects/${encodeURIComponent(project.id)}/env`);
  if (!response.ok) throw new Error("metadata_unavailable");
  const data = await response.json(), values = {};
  for (const name of names) {
    const candidates = (data.envs ?? []).filter(v => v.key === name && v.target?.includes("production") && !v.gitBranch && !v.customEnvironmentIds?.length);
    if (candidates.length !== 1) { report.variables[name] = { status: candidates.length ? "ambiguous" : "missing" }; continue; }
    const response = await get(`/v1/projects/${encodeURIComponent(project.id)}/env/${encodeURIComponent(candidates[0].id)}`);
    if (!response.ok) { report.variables[name] = { status: "value_unavailable", http: response.status, storageType: candidates[0].type }; continue; }
    const env = await response.json();
    if (env.decrypted !== true || typeof env.value !== "string" || !env.value.trim()) { report.variables[name] = { status: "value_unavailable", storageType: candidates[0].type }; continue; }
    values[name] = env.value.trim();
    report.variables[name] = name === "STRIPE_WEBHOOK_SECRET" ? { status: "inspected", formatValid: values[name].startsWith("whsec_") } : { status: "inspected", mode: mode(values[name]) };
  }
  const secret = values.STRIPE_CONNECT_SECRET_KEY, publicKey = values.STRIPE_PUBLIC_KEY;
  if (secret && publicKey) {
    const secretMode = mode(secret), publicMode = mode(publicKey);
    report.payment.mode = secretMode;
    report.payment.modesMatch = secretMode !== "invalid" && secretMode === publicMode;
    if (!report.payment.modesMatch) report.payment.status = "key_mode_mismatch";
    else {
      const response = await fetch("https://api.stripe.com/v1/account", { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15_000) });
      const account = await response.json();
      report.payment = { ...report.payment, status: response.ok ? (secretMode === "live" ? "live_account_reachable" : "sandbox_account_reachable") : "provider_rejected", http: response.status, chargesEnabled: account.charges_enabled === true, payoutsEnabled: account.payouts_enabled === true };
    }
  }
  for (const name of names) delete values[name];
} catch { report.payment.status = "read_only_verification_unavailable"; }
fs.mkdirSync("artifacts/pwa", { recursive: true });
fs.writeFileSync("artifacts/pwa/continuation-deployed-payments.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
