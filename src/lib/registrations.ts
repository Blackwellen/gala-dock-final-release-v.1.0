/**
 * Registrations feature flag (owner, 2026-11-17). New sign-ups are CLOSED unless the deployment sets
 * REGISTRATIONS_OPEN=true (Vercel → Settings → Environment Variables, then redeploy). Existing accounts sign in as normal.
 * Server-only: read in server components, route handlers and server actions.
 */
export function registrationsOpen(): boolean {
  return process.env.REGISTRATIONS_OPEN === "true";
}

export const REGISTRATIONS_CLOSED_COPY = {
  title: "Registrations are closed for now",
  body: "Gala Dock is currently open only to people who have already registered. If you already have an account, sign in to continue.",
  signIn: "Sign in",
  contact: "support@galadock.com",
};
