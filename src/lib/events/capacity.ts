// Gala Dock — capacity & safety engine (EB-J area 19). Pure: occupancy, oversell warnings and
// staff/security-ratio checks against room/venue capacity + headcount. Used by the capacity tab
// and the Copilot /event-capacity command.

export interface CapacityInput {
  capacity: number; // total bookable capacity (sum of rooms / venue)
  headcount: number; // guests + tickets sold
  staffCount: number;
  securityCount?: number;
}

export interface CapacityResult {
  occupancyPct: number;
  remaining: number;
  oversell: boolean;
  recommendedStaff: number;
  recommendedSecurity: number;
  warnings: string[];
}

// Defaults — overridable per event type (nightlife typically needs tighter security ratios).
const DEFAULT_STAFF_PER = 100; // 1 steward per 100 attendees
const DEFAULT_SECURITY_PER = 100; // 1 SIA per 100 attendees

export function computeCapacity(
  input: CapacityInput,
  opts: { staffPer?: number; securityPer?: number } = {}
): CapacityResult {
  const cap = Math.max(0, input.capacity);
  const staffPer = opts.staffPer ?? DEFAULT_STAFF_PER;
  const securityPer = opts.securityPer ?? DEFAULT_SECURITY_PER;

  const occupancyPct = cap > 0 ? Math.round((input.headcount / cap) * 100) : 0;
  const oversell = cap > 0 && input.headcount > cap;
  const recommendedStaff = Math.ceil(input.headcount / staffPer);
  const recommendedSecurity = Math.ceil(input.headcount / securityPer);

  const warnings: string[] = [];
  if (oversell) warnings.push(`Oversell: ${input.headcount} attendees vs capacity ${cap}.`);
  else if (cap > 0 && occupancyPct >= 90) warnings.push(`Near capacity (${occupancyPct}%).`);
  if (input.staffCount < recommendedStaff) warnings.push(`Understaffed: ${input.staffCount}/${recommendedStaff} stewards.`);
  const sec = input.securityCount ?? 0;
  if (sec < recommendedSecurity) warnings.push(`Security below recommended: ${sec}/${recommendedSecurity}.`);

  return {
    occupancyPct,
    remaining: cap - input.headcount,
    oversell,
    recommendedStaff,
    recommendedSecurity,
    warnings,
  };
}

/** Staff/security ratios by event category (nightlife tighter). */
export function ratiosFor(category: string): { staffPer: number; securityPer: number } {
  if (category === "nightlife") return { staffPer: 75, securityPer: 75 };
  if (category === "public") return { staffPer: 100, securityPer: 100 };
  return { staffPer: 150, securityPer: 250 };
}
