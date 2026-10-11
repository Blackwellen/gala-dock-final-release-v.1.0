import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
export async function hasRequiredAssurance(client: SupabaseClient<Database>) {
 const {data,error}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
 return !error && !!data && !(data.nextLevel==="aal2" && data.currentLevel!=="aal2");
}
