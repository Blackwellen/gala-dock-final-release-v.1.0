// Test the NVIDIA NIM credential (OpenAI-compatible chat completions). Prints status + reply only.
import { readFileSync } from "node:fs";

function loadEnv() {
  const env = {};
  for (const f of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {}
  }
  return env;
}

const key = loadEnv().NVIDIA_NIM_API_KEY;
if (!key) { console.error("No NVIDIA_NIM_API_KEY"); process.exit(2); }

const model = process.argv[2] || "meta/llama-3.1-8b-instruct";

const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({
    model,
    messages: [
      { role: "system", content: "You are Gala Dock Copilot. Reply in one short sentence." },
      { role: "user", content: "Say hello and name one thing an event organiser tracks." },
    ],
    max_tokens: 60,
    temperature: 0.3,
  }),
});

const text = await res.text();
console.log(`model=${model} HTTP ${res.status}`);
if (!res.ok) { console.error(text.slice(0, 500)); process.exit(1); }
const json = JSON.parse(text);
console.log("reply:", json.choices?.[0]?.message?.content?.trim());
console.log("usage:", JSON.stringify(json.usage ?? {}));
