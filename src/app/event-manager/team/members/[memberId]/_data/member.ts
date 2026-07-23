import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export interface MemberDetail {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  memberCode: string | null;
  role: string | null;
  department: string | null;
  location: string | null;
  employmentType: string;
  standardWeeklyHours: number;
  travelRadiusMiles: number | null;
  willingToTravel: boolean;
  dayRateCents: number | null;
  hourRateCents: number | null;
  overtimeRateCents: number | null;
  currency: string;
  rating: number | null;
  bio: string | null;
  joinedAt: string | null;
  skills: { name: string; proficiency: string }[];
  certifications: { name: string; issuer: string | null; status: string; expiresAt: string | null }[];
  regions: { name: string; tier: string }[];
}

export async function getMemberDetail(workspaceId: string, userId: string): Promise<MemberDetail> {
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("user_id, joined_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!membership) notFound();

  const [{ data: profile }, { data: tp }, { data: skillLinks }, { data: certs }, { data: regions }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("user_id", userId).maybeSingle(),
    supabase.from("team_member_profiles").select("*").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
    supabase.from("team_member_skills").select("skill_id, proficiency, skills(name)").eq("workspace_id", workspaceId).eq("user_id", userId),
    supabase
      .from("team_member_certifications")
      .select("status, expires_at, certification_types(name, issuer)")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId),
    supabase.from("team_member_regions").select("region_name, tier").eq("workspace_id", workspaceId).eq("user_id", userId),
  ]);

  let department: string | null = null;
  let role: string | null = null;
  if (tp?.department_id) {
    const { data } = await supabase.from("team_departments").select("name").eq("id", tp.department_id).maybeSingle();
    department = data?.name ?? null;
  }
  if (tp?.primary_role_id) {
    const { data } = await supabase.from("staffing_roles").select("name").eq("id", tp.primary_role_id).maybeSingle();
    role = data?.name ?? null;
  }

  return {
    userId,
    name: profile?.display_name ?? "Team member",
    email: null,
    phone: tp?.phone ?? null,
    memberCode: tp?.member_code ?? null,
    role,
    department,
    location: tp?.home_location ?? null,
    employmentType: tp?.employment_type ?? "employee",
    standardWeeklyHours: tp?.standard_weekly_hours ?? 40,
    travelRadiusMiles: tp?.travel_radius_miles ?? null,
    willingToTravel: tp?.willing_to_travel ?? true,
    dayRateCents: tp?.day_rate_cents ?? null,
    hourRateCents: tp?.hour_rate_cents ?? null,
    overtimeRateCents: tp?.overtime_rate_cents ?? null,
    currency: tp?.currency ?? "GBP",
    rating: tp?.rating ?? null,
    bio: tp?.bio ?? null,
    joinedAt: membership.joined_at,
    skills: (skillLinks ?? []).map((s: any) => ({ name: s.skills?.name ?? "Skill", proficiency: s.proficiency })),
    certifications: (certs ?? []).map((c: any) => ({
      name: c.certification_types?.name ?? "Certification",
      issuer: c.certification_types?.issuer ?? null,
      status: c.status,
      expiresAt: c.expires_at,
    })),
    regions: (regions ?? []).map((r) => ({ name: r.region_name, tier: r.tier })),
  };
}
