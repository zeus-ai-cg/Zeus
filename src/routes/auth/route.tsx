import { createFileRoute, Outlet } from "@tanstack/react-router";

// /auth layout — a bare Outlet so the two pages under /auth are standalone:
//   - /auth         → the normal web login (auth/index.tsx)
//   - /auth/desktop → the dedicated desktop device-confirmation gateway
//                     (auth/desktop.tsx)
// Keeping the login page a leaf with no Outlet previously swallowed the
// desktop page, so a signed-in browser user visiting /auth/desktop saw the
// normal web login (which redirects to /chat) instead of the confirmation.
export const Route = createFileRoute("/auth")({
  component: AuthLayout,
});

function AuthLayout() {
  return <Outlet />;
}
