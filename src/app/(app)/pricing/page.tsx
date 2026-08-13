import { PricingManager } from "@/components/admin/pricing-manager";
import { requirePermission } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/permissions/permissions";
import { getPricingMatrix } from "@/server/services/catalog.service";

export const metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  await requirePermission(PERMISSIONS.PRICING_MANAGE);
  const { categories, services } = await getPricingMatrix();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Services &amp; pricing</h1>
        <p className="text-sm text-muted">
          Prices are per vehicle type. Changing one supersedes it — past transactions keep the
          amount they were charged.
        </p>
      </div>

      <PricingManager categories={categories} services={services} />
    </div>
  );
}
