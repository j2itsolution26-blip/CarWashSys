import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/guards";
import { landingPathFor } from "@/lib/navigation";

/**
 * Entry point. Sends each role to the screen they actually work in: a cashier
 * to the POS, a washer to the queue, an owner to the dashboard.
 */
export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(landingPathFor(user.permissions));
}
