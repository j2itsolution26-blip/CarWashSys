import { PosTerminal } from "@/components/pos/pos-terminal";
import { EmptyState } from "@/components/ui/feedback";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guards";
import { PERMISSIONS, hasPermission } from "@/lib/permissions/permissions";
import { getPosCatalog } from "@/server/services/catalog.service";
import { getOpenTransactions } from "@/server/services/transaction.service";

export const metadata = { title: "POS" };

/**
 * Point of sale.
 *
 * `force-dynamic` because the catalog and the open-transaction list must
 * reflect what is true right now — a cached price on a POS screen is a wrong
 * price.
 */
export const dynamic = "force-dynamic";

export default async function PosPage() {
  const user = await requirePermission(PERMISSIONS.POS_OPERATE);

  const [catalog, openTransactions] = await Promise.all([
    getPosCatalog(),
    getOpenTransactions(user),
  ]);

  if (catalog.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="💰"
          title="No priced services yet"
          description="An owner or administrator needs to set up vehicle types and prices before the POS can be used."
        />
      </Card>
    );
  }

  return (
    <PosTerminal
      catalog={catalog}
      openTransactions={openTransactions}
      businessName={process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "CG CAR WASH"}
      canTakePayment={hasPermission(user.permissions, PERMISSIONS.PAYMENT_CAPTURE)}
    />
  );
}
