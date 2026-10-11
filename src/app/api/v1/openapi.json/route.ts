import { NextResponse } from "next/server";
import { TOOLS } from "@/lib/agent/registry";
import { describe, exposed, ALL_SCOPES } from "@/lib/developer/gateway";

/** OpenAPI 3.1 document generated from the tool registry (release spec §98). Public: it describes shapes, not data. */
export async function GET() {
  const tools = TOOLS.filter(exposed).map(describe);
  const err = { $ref: "#/components/schemas/Error" };
  const doc = {
    openapi: "3.1.0",
    info: { title: "Gala Dock API", version: "1.0.0", description: "Workspace API. Every operation runs with the permissions of the person who created the API key; commitments (R4) require in-app approval and are not callable." },
    servers: [{ url: `${(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.galadock.com").replace(/\/+$/, "")}/api/v1` }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer", description: `Workspace API key (gd_live_…). Scopes: ${ALL_SCOPES.join(", ")}` } },
      schemas: { Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } }, request_id: { type: "string" } } } },
      parameters: { IdempotencyKey: { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", minLength: 8, maxLength: 100 } } },
    },
    paths: {
      "/tools": { get: { operationId: "listTools", summary: "Operations available to this key", responses: { "200": { description: "OK" }, "401": { description: "Invalid key", content: { "application/json": { schema: err } } } } } },
      ...Object.fromEntries(tools.map(t => [`/tools/${t.name}`, { post: {
        operationId: t.name.replace(/\.(\w)/g, (_, c: string) => c.toUpperCase()), summary: t.title, description: `${t.description} Risk ${t.risk}. Scope ${t.scope}.`,
        "x-scope": t.scope, parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: { required: true, content: { "application/json": { schema: t.input_schema } } },
        responses: { "200": { description: "OK" }, "403": { description: "Forbidden / insufficient scope", content: { "application/json": { schema: err } } }, "422": { description: "Invalid input", content: { "application/json": { schema: err } } }, "429": { description: "Rate limited" } },
      } }])),
    },
  };
  return NextResponse.json(doc, { headers: { "Cache-Control": "public, max-age=300" } });
}
