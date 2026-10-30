// Q39 additive-only migration lint (live database, no staging: owner decision 2026-10-28).
// Pure function over SQL text, imported by scripts/db/migrate.mjs and tests/release/migration-governance.spec.ts.
// errors  = destructive or backward-incompatible statements (block apply unless the manifest entry carries an owner waiver);
// warnings = statements a reviewer must look at (bulk data changes, locks, permission narrowing).

// Function/DO/cron bodies ($tag$ … $tag$) are removed: the lint targets top-level DDL/DML that changes live data or contracts.
const strip = sql => sql
  .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''")
  .replace(/--[^\n]*/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

const RULES = [
  // [level, id, pattern, message, unless(fullSql, match) → true when the statement is acceptable]
  ["error", "drop_table", /\bdrop\s+table\b(?!\s+if\s+exists\s+(pg_temp|tmp_|_tmp))/gi, "DROP TABLE removes data"],
  ["error", "drop_column", /\balter\s+table\b[^;]*\bdrop\s+column\b/gi, "DROP COLUMN breaks deployed readers"],
  ["error", "rename", /\balter\s+(table|view|function)\b[^;]*\brename\b/gi, "RENAME breaks deployed code"],
  ["error", "alter_type", /\balter\s+table\b[^;]*\balter\s+column\b[^;]*\btype\b/gi, "column type change rewrites/locks and can break readers"],
  ["error", "truncate", /(^|;)\s*truncate\b/gim, "TRUNCATE removes data"],   // statement only (not the TRUNCATE privilege in GRANT/REVOKE)
  ["error", "drop_schema", /\bdrop\s+schema\b/gi, "DROP SCHEMA"],
  ["error", "set_not_null", /\balter\s+column\s+\w+\s+set\s+not\s+null\b/gi, "SET NOT NULL can fail on live rows and breaks writers that omit the column"],
  ["error", "drop_function", /\bdrop\s+function\s+(?:if\s+exists\s+)?[\w.]+/gi, "DROP FUNCTION breaks deployed callers (use create or replace with the same signature)",
    (sql, m) => { const name = /drop\s+function\s+(?:if\s+exists\s+)?([\w.]+)/i.exec(m)?.[1]; return !!name && new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+${name.replace(".", "\\.")}\\s*\\(`, "i").test(sql); }],
  ["error", "delete_unbounded", /\bdelete\s+from\s+[\w.]+\s*;/gi, "DELETE without WHERE"],
  ["warning", "drop_constraint", /\bdrop\s+constraint\s+(?:if\s+exists\s+)?[\w.]+/gi, "constraint dropped — must be re-added (superset) in the same file",
    (sql, m) => { const name = /drop\s+constraint\s+(?:if\s+exists\s+)?(\w+)/i.exec(m)?.[1]; return !!name && new RegExp(`add\\s+constraint\\s+${name}\\b`, "i").test(sql); }],
  ["warning", "drop_policy", /\bdrop\s+policy\s+(?:if\s+exists\s+)?[\w.]+/gi, "policy dropped — must be re-created in the same file",
    (sql, m) => { const name = /drop\s+policy\s+(?:if\s+exists\s+)?(\w+)/i.exec(m)?.[1]; return !!name && new RegExp(`create\\s+policy\\s+${name}\\b`, "i").test(sql); }],
  ["warning", "drop_trigger", /\bdrop\s+trigger\s+(?:if\s+exists\s+)?[\w.]+/gi, "trigger dropped — must be re-created in the same file",
    (sql, m) => { const name = /drop\s+trigger\s+(?:if\s+exists\s+)?(\w+)/i.exec(m)?.[1]; return !!name && new RegExp(`create\\s+trigger\\s+${name}\\b`, "i").test(sql); }],
  ["warning", "bulk_update", /^\s*update\s+public\.\w+\s+set\b[^;]*;/gim, "top-level data UPDATE — confirm it is a bounded, idempotent backfill"],
  ["warning", "bulk_delete", /^\s*delete\s+from\s+public\.\w+[^;]*;/gim, "top-level DELETE — confirm it only removes rows this migration owns"],
  ["warning", "revoke", /\brevoke\s+(select|execute|all)\b[^;]*\bon\s+(table\s+)?public\.\w+[^;]*\bfrom\b[^;]*\b(authenticated|anon)\b[^;]*;/gi, "permission narrowing on an existing object — check deployed callers",
    (sql, m) => { const obj = /\bon\s+(?:table\s+|function\s+)?(public\.\w+)/i.exec(m)?.[1]; return !!obj && new RegExp(`create\s+(or\s+replace\s+)?(table|view|function)\s+(if\s+not\s+exists\s+)?${obj.replace(".", "\.")}\b`, "i").test(sql); }],
  ["warning", "index_lock", /\bcreate\s+(unique\s+)?index\b(?![^;]*\bconcurrently\b)(?![^;]*\bif\s+not\s+exists\b)/gi, "index without IF NOT EXISTS"],
  ["warning", "add_not_null_no_default", /\badd\s+column\b(?![^;,]*\bdefault\b)[^;,]*\bnot\s+null\b/gi, "new NOT NULL column without DEFAULT fails on live rows"],
  ["warning", "set_role", /\bset\s+(local\s+)?role\b/gi, "SET ROLE inside a migration"],
];

export function lintMigration(sqlText) {
  const sql = strip(sqlText);
  const findings = [];
  for (const [level, id, pattern, message, unless] of RULES) {
    for (const m of sql.matchAll(pattern)) {
      if (unless && unless(sql, m[0])) continue;
      const line = sql.slice(0, m.index).split("\n").length;
      findings.push({ level, id, line, message, excerpt: m[0].replace(/\s+/g, " ").slice(0, 120) });
    }
  }
  return { errors: findings.filter(f => f.level === "error"), warnings: findings.filter(f => f.level === "warning") };
}

// The tool owns the transaction. A file's own top-level BEGIN/COMMIT/ROLLBACK/END would end it early: a dry run's COMMIT made
// 202610294062 live before its exercise ran (2026-10-29). Strip them outside $tag$ bodies; the reviewed text is still what's
// hashed and recorded.
export function withoutTxnControl(sql) {
  return sql.split(/(\$[A-Za-z_]*\$[\s\S]*?\$[A-Za-z_]*\$)/).map((part, i) => i % 2 ? part
    : part.replace(/(^|;)(\s*)(?:begin|start\s+transaction|commit|rollback|end)(?:\s+(?:transaction|work))?\s*;/gim, "$1$2-- (transaction control removed by migrate.mjs);")).join("");
}
