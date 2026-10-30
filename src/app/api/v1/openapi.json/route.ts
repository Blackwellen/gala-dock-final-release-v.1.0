import { NextResponse } from "next/server";
import { TOOLS } from "@/lib/agent/registry";
import { describe, exposed, ALL_SCOPES, API_VERSION, FEED_SCOPE } from "@/lib/developer/gateway";
import { WEBHOOK_TYPES } from "@/lib/developer/webhook-catalogue";

/**
 * OpenAPI 3.1 document generated from the tool registry and the gateway's real behaviour (release spec §98, Q30). Public: it
 * describes shapes, not data. Status codes mirror callTool/authenticate exactly (contract-tested in q30-api-webhooks.spec.ts).
 */
export async function GET() {
  const tools = TOOLS.filter(exposed).map(describe);
  const err = (description: string) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });
  const common = { "400": err("Bad request (invalid JSON, idempotency key, cursor or unsupported Gala-Api-Version)"), "401": err("Missing, invalid, expired or revoked API key"),
    "429": { description: "Rate limited (per key)", headers: { "Retry-After": { schema: { type: "integer" } } }, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    "500": err("Internal error") };
  const headers = { "X-Request-Id": { schema: { type: "string" } }, "Gala-Api-Version": { schema: { type: "string", const: API_VERSION } } };
  const doc = {
    openapi: "3.1.0",
    info: { title: "Gala Dock API", version: API_VERSION, description: "Workspace API. Every operation runs with the permissions of the person who created (or last rotated) the API key, inside that key's workspace only; commitments (R4) require in-app approval and are not callable. Versioned by date: pin with the Gala-Api-Version header." },
    servers: [{ url: `${(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.galadock.com").replace(/\/+$/, "")}/api/v1` }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer", description: `Workspace API key (gd_live_… or gd_test_…). Scopes: ${ALL_SCOPES.join(", ")}` } },
      schemas: {
        Error: { type: "object", required: ["error", "request_id"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } }, request_id: { type: "string" } } },
        Result: { type: "object", required: ["data", "request_id"], properties: { data: {}, request_id: { type: "string" } } },
        FeedEvent: { type: "object", required: ["id", "type", "cursor", "created", "data"], properties: { id: { type: "string", format: "uuid" }, type: { type: "string", enum: Object.keys(WEBHOOK_TYPES) }, cursor: { type: "string" }, created: { type: "integer" }, data: { type: "object" } } },
      },
      parameters: {
        IdempotencyKey: { name: "Idempotency-Key", in: "header", required: false, description: "Replays the stored 200 response for 24 h; same key with different input → 409 idempotency_conflict; concurrent duplicate → 409 idempotency_in_progress.", schema: { type: "string", pattern: "^[\\w-]{8,100}$" } },
        ApiVersion: { name: "Gala-Api-Version", in: "header", required: false, schema: { type: "string", enum: [API_VERSION] } },
      },
    },
    paths: {
      "/tools": { get: { operationId: "listTools", summary: "Operations available to this key", parameters: [{ $ref: "#/components/parameters/ApiVersion" }],
        responses: { "200": { description: "OK", headers, content: { "application/json": { schema: { $ref: "#/components/schemas/Result" } } } }, ...common } } },
      "/events": { get: { operationId: "listEvents", summary: "Event feed (cursor pull sync, same payloads as webhooks)", "x-scope": FEED_SCOPE,
        parameters: [{ name: "cursor", in: "query", schema: { type: "string", pattern: "^\\d{1,18}$" } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } }, { $ref: "#/components/parameters/ApiVersion" }],
        responses: { "200": { description: "OK", headers, content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/FeedEvent" } }, next_cursor: { type: "string" }, api_version: { type: "string" }, request_id: { type: "string" } } } } } },
          "403": err("Key lacks feed:read"), ...common } } },
      ...Object.fromEntries(tools.map(t => [`/tools/${t.name}`, { post: {
        operationId: t.name.replace(/\.(\w)/g, (_, c: string) => c.toUpperCase()), summary: t.title, description: `${t.description} Risk ${t.risk}. Scope ${t.scope}.`,
        "x-scope": t.scope, "x-risk": t.risk, "x-mutation": t.mutation, parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }, { $ref: "#/components/parameters/ApiVersion" }],
        requestBody: { required: true, content: { "application/json": { schema: t.input_schema } } },
        responses: { "200": { description: "OK", headers: { ...headers, "Idempotent-Replayed": { schema: { type: "string", const: "true" } } }, content: { "application/json": { schema: { $ref: "#/components/schemas/Result" } } } },
          "403": err("forbidden (role lacks permission) · insufficient_scope · approval_required"), "404": err("unknown_tool · not_found (id not in this key's workspace)"),
          "409": err("idempotency_conflict · idempotency_in_progress"), "422": err("invalid_input"), "503": err("maintenance"), ...common },
      } }])),
    },
    webhooks: Object.fromEntries(Object.entries(WEBHOOK_TYPES).map(([type, fields]) => [type, { post: {
      summary: `${type} (signed: Gala-Signature t=…,v1=…; reject if older than 300 s; dedupe on Gala-Event-Id)`,
      requestBody: { content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" }, type: { const: type }, api_version: { const: API_VERSION }, schema_version: { type: "integer" },
        created: { type: "integer" }, workspace_id: { type: "string" }, data: { type: "object", additionalProperties: false, properties: Object.fromEntries(fields.map(f => [f, {}])) } } } } } },
      responses: { "2XX": { description: "Delivered (any 2xx within 10 s)" } } } }])),
  };
  return NextResponse.json(doc, { headers: { "Cache-Control": "public, max-age=300" } });
}
