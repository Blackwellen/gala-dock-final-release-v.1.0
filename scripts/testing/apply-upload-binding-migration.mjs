// Explicit application of this task's migration only. Never log management credentials.
import fs from 'node:fs/promises';
if (!process.argv.includes('--apply')) throw new Error('Use --apply to apply the reviewed migration');
const query=await fs.readFile('supabase/migrations/202610280034_upload_object_binding.sql','utf8');
if (!process.env.SUPABASE_PROJECT_REF || !process.env.SUPABASE_PAT_KEY) throw new Error('Missing database management configuration');
const response=await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_PAT_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(60000)});
if(!response.ok)throw new Error(`Migration application failed: HTTP ${response.status}`);
const result=await response.json();if(!Array.isArray(result))throw new Error('Unexpected database result');
console.log('Applied 202610280034_upload_object_binding.sql');
