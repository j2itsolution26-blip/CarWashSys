import { CatalogManager } from "@/components/admin/catalog-manager";
import { requirePermission } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/permissions/permissions";
import { listCategories, listServices } from "@/server/services/catalog.service";

export const metadata = { title: "Services & Vehicles" };
export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  await requirePermission(PERMISSIONS.CATALOG_MANAGE);

  const [services, categories] = await Promise.all([listServices(), listCategories()]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Services &amp; vehicles</h1>
        <p className="text-sm text-muted">
          Items are disabled rather than deleted, so past receipts always stay readable.
        </p>
      </div>

      <CatalogManager
        services={services.map((service) => ({
          id: service.id,
          name: service.name,
          description: service.description,
          allowsQuantity: service.allowsQuantity,
          sortOrder: service.sortOrder,
          isActive: service.isActive,
        }))}
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
          icon: category.icon,
          description: category.description,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
          transactionCount: category._count.transactions,
          variants: category.variants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            isActive: variant.isActive,
            minDisplacementCc: variant.minDisplacementCc,
            maxDisplacementCc: variant.maxDisplacementCc,
          })),
        }))}
      />
    </div>
  );
}
