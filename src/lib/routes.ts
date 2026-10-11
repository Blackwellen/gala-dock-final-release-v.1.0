export const publicRoutes = [
  { path: "/", title: "Event Marketplace Homepage", file: "Public Pages/Gala Dock Event Marketplace Homepage.png" },
  { path: "/services/elite-sound", title: "Elite Sound Events", file: "Public Pages/Gala·Dock Elite Sound Events Page.png" },
  { path: "/events/neon-nights", title: "Neon Nights Festival 2026", file: "Public Pages/Gala·Dock Neon Nights Festival 2026.png" },
  { path: "/venues/riverside-arena", title: "Riverside Arena", file: "Public Pages/Gala·Dock Riverside Arena Venue Page.png" },
  { path: "/events/london", title: "London Events", file: "Public Pages/London Events Discovery Marketplace.png" },
  { path: "/organizers/neon-events", title: "Neon Events", file: "Public Pages/Neon Events Organizer Profile.png" },
];
export const authScreens = ["login", "register", "verify-email", "forgot-password", "reset-password", "mfa", "invite", "access"] as const;
export type AuthScreen = typeof authScreens[number];
/** Onboarding screens and their design references (route: /onboarding/<flow>?step=N). */
export const onboardingRoutes = [
  { flow: "experience", step: 0, title: "Choose your experience", file: "Gala Dock Event Onboarding Dashboard.png" },
  { flow: "customer", step: 1, title: "Your preferences", file: "Gala Dock Preferences Setup.png" },
  { flow: "organizer", step: 1, title: "Set up your organization", file: "Gala Dock Organizer Workspace Setup.png" },
  { flow: "organizer", step: 2, title: "How do you run events?", file: "Gala Dock Event Setup Dashboard.png" },
  { flow: "organizer", step: 3, title: "Brand, payments and communications", file: "Gala·Dock Organizer Setup Dashboard.png" },
  { flow: "organizer", step: 4, title: "Invite your team and get started", file: "GalaDock Organizer Setup Dashboard.png" },
  { flow: "provider", step: 1, title: "Tell us about your business", file: "Gala Dock Provider Setup Dashboard.png" },
  { flow: "provider", step: 2, title: "Add your first venue or service", file: "Gala Dock Venue Setup Dashboard.png" },
  { flow: "provider", step: 3, title: "Booking rules and response commitment", file: "Gala-Dock Provider Setup Dashboard.png" },
  { flow: "provider", step: 4, title: "Trust, team and publish", file: "Gala Dock Provider Setup Dashboard(1).png" },
] as const;
export const roles = ["customer", "organizer", "provider", "admin"] as const;
export type Role = typeof roles[number];
