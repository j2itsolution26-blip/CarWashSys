import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getSessionUser } from "@/lib/auth/guards";
import { visibleNavItems } from "@/lib/navigation";

/**
 * Authenticated shell.
 *
 * Re-checks the session server-side rather than trusting middleware: a user
 * whose account was deactivated mid-shift loses their permission set on the
 * next token refresh and lands here with an empty nav, which sends them out.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  const navItems = visibleNavItems(user.permissions);

  if (navItems.length === 0) {
    redirect("/no-access");
  }

  return (
    <AppShell
      user={{ name: user.name, email: user.email, roles: user.roles }}
      navItems={navItems}
      businessName={process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "CG Car Wash"}
    >
      {children}
    </AppShell>
  );
}
