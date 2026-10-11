/** Shared password policy (client hints; Supabase Auth enforces its own configured minimums server-side). */
export function passwordChecks(value: string) {
  return [
    { label: "Be at least 8 characters long", met: value.length >= 8 },
    { label: "Include at least one uppercase letter (A–Z)", met: /[A-Z]/.test(value) },
    { label: "Include at least one lowercase letter (a–z)", met: /[a-z]/.test(value) },
    { label: "Include at least one number (0–9)", met: /\d/.test(value) },
    { label: "Include at least one special character (e.g. ! @ # $ % ^ & *)", met: /[^A-Za-z0-9]/.test(value) },
  ];
}

export function passwordStrength(value: string) {
  let score = passwordChecks(value).filter(c => c.met).length + (value.length >= 12 ? 1 : 0) + (value.length >= 16 ? 1 : 0);
  if (/(.)\1{2,}/.test(value) || /^(password|qwerty|123456)/i.test(value)) score = Math.min(score, 2);
  const level = score >= 6 ? "strong" : score >= 4 ? "fair" : "weak";
  return { level, label: level === "strong" ? "Strong password" : level === "fair" ? "Fair — add length for a stronger password" : "Weak password", percent: Math.min(100, Math.round((score / 7) * 100)) };
}
