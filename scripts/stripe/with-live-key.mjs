// Runs live-preflight.mjs or live-catalogue.mjs with STRIPE_CONNECT_SECRET_KEY := STRIPE_SECRET_KEY (the live key in .env), for this
// process only (the app's switch is untouched). Never prints the key.
//   node --env-file=.env --env-file=.env.local scripts/stripe/with-live-key.mjs live-preflight.mjs
//   node --env-file=.env --env-file=.env.local scripts/stripe/with-live-key.mjs live-catalogue.mjs [--apply]   (--apply: owner-approved only)
const target = process.argv[2];
if (!/^(live-preflight|live-catalogue)\.mjs$/.test(target ?? "")) { console.error("target must be live-preflight.mjs or live-catalogue.mjs"); process.exit(1); }
if (!/^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "")) { console.error("STRIPE_SECRET_KEY is not a live key"); process.exit(1); }
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
process.env.NODE_ENV = "production";
process.argv = [process.argv[0], target, ...process.argv.slice(3)];
await import(`./${target}`);
