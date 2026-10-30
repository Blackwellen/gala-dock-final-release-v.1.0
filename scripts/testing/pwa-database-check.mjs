// Execute only the repository's rollback-only integrity fixtures. Never apply migrations here.
import fs from 'node:fs/promises';
import path from 'node:path';
const allowed = new Set(['resale-refund-integrity.sql', 'resale-liability-accounting.sql']);
for (const name of process.argv.slice(2)) {
 if (!allowed.has(name)) throw new Error('Unknown rollback-only fixture');
 const sql = await fs.readFile(path.join('scripts/testing', name), 'utf8');
 const rollback = sql.toLowerCase().lastIndexOf('rollback;');
 if (!/^begin;/i.test(sql.replace(/^\s*--[^\n]*(\n|$)/gm, '').trim()) || rollback < 0) throw new Error('Fixture must roll back its transaction');
 const transactionalSql = sql.slice(0, rollback + 'rollback;'.length);
 if (!process.env.SUPABASE_PROJECT_REF || !process.env.SUPABASE_PAT_KEY) throw new Error('Missing database management configuration');
 const response = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: transactionalSql }), signal: AbortSignal.timeout(60000) });
 if (!response.ok) throw new Error(`Rollback fixture ${name} failed with HTTP ${response.status}`);
 const result = await response.json(); if (!Array.isArray(result)) throw new Error('Unexpected database result');
 console.log(JSON.stringify({ fixture: name, result: 'PASS', transaction: 'rolled back' }));
}
