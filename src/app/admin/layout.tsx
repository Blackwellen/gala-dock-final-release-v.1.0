// Deliberately no auth/shell logic here — /admin/login must render unguarded (see
// (dashboard)/layout.tsx for the requirePlatformAdmin() guard + AdminShellClient, which wraps
// every actual admin page but not the login page itself).
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
