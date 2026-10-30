import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { untyped } from "@/lib/workspace/db";
import { gate } from "@/lib/files/service";

/** Authoritative request RLS includes only the requester and actually selected provider workspaces. */
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params;const path=new URL(request.url).searchParams.get("path")??"";
 const missing=()=>NextResponse.json({error:"File not found"},{status:404,headers:{"Cache-Control":"private, no-store"}});
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^([0-9a-f-]{36})\/[0-9a-f-]{36}\.(png|jpg|webp|pdf)$/i.test(path))return missing();
 const db=await createClient();const auth=await db.auth.getUser();if(!auth.data.user)return missing();
 if(!(await hasRequiredAssurance(db)))return NextResponse.json({error:"Complete multi-factor authentication first"},{status:403});
 const {data:record,error}=await db.from("provider_requests").select("created_by,requirements").eq("id",id).maybeSingle();
 if(error||!record||!path.startsWith(`${record.created_by}/`))return missing();
 const raw=(record.requirements as {attachments?:{path:string;name:string}[]}|null)?.attachments;
 const attachment=Array.isArray(raw)?raw.find(file=>file.path===path):null;if(!attachment)return missing();
 const admin=createAdminClient();const proof=await untyped(admin).from("verified_private_uploads").select("owner_id").eq("path",path).eq("owner_id",record.created_by).not("object_id","is",null).maybeSingle();
 if(proof.error||!proof.data)return missing();
 const blocked=await gate(admin,"workspace-files",path);if(blocked)return blocked;   // Q04 quarantine gate
 const signed=await admin.storage.from("workspace-files").createSignedUrl(path,60,{download:attachment.name.replace(/[^\w .()-]/g,"_")});
 if(signed.error||!signed.data)return missing();
 return NextResponse.redirect(signed.data.signedUrl,{headers:{"Cache-Control":"private, no-store"}});
}
