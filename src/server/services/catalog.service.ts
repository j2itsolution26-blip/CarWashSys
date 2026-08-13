import "server-only";
import { prisma } from "@/lib/db";
import { toAmountString } from "@/lib/money";

/**
 * Read model for the vehicle/service menu.
 *
 * Everything returned here is plain JSON — amounts are decimal STRINGS, never
 * Prisma `Decimal` objects, because these values cross the server/client
 * boundary into the POS and React cannot serialise a Decimal.
 *
 * The POS fetches this once per session and holds it in memory: it is a few
 * hundred rows that change a few times a year, so re-querying on every tile tap
 * would be pure latency for no freshness benefit.
 */

export interface CatalogServiceOption {
  serviceId: string;
  servicePriceId: string;
  name: string;
  description: string | null;
  allowsQuantity: boolean;
  sortOrder: number;
  /** Decimal string, e.g. "135.00". Display only — the server re-reads it at checkout. */
  unitPrice: string;
}

export interface CatalogVariantOption {
  id: string;
  name: string;
  slug: string;
  minDisplacementCc: number | null;
  maxDisplacementCc: number | null;
  sortOrder: number;
  services: CatalogServiceOption[];
  /** Cheapest live price, used to show "from ₱100" on a category tile. */
  startingPrice: string | null;
}

export interface CatalogCategoryOption {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string | null;
  sortOrder: number;
  variants: CatalogVariantOption[];
  /** True when the category has more than one price tier (motorcycles). */
  hasMultipleVariants: boolean;
}

/**
 * The active menu, as the cashier sees it.
 * Excludes: inactive categories, inactive variants, inactive services, and any
 * service with no current price for that variant.
 */
export async function getPosCatalog(): Promise<CatalogCategoryOption[]> {
  const categories = await prisma.vehicleCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      description: true,
      sortOrder: true,
      variants: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          minDisplacementCc: true,
          maxDisplacementCc: true,
          sortOrder: true,
          prices: {
            // `currentKey: { not: null }` is the "this is the live price" filter.
            where: { currentKey: { not: null }, isActive: true, service: { isActive: true } },
            select: {
              id: true,
              amount: true,
              service: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  allowsQuantity: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return categories
    .map((category) => {
      const variants = category.variants
        .map((variant) => {
          const services = variant.prices
            .map((price) => ({
              serviceId: price.service.id,
              servicePriceId: price.id,
              name: price.service.name,
              description: price.service.description,
              allowsQuantity: price.service.allowsQuantity,
              sortOrder: price.service.sortOrder,
              unitPrice: toAmountString(price.amount),
            }))
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

          const startingPrice = services.length
            ? services.reduce((min, service) =>
                Number(service.unitPrice) < Number(min.unitPrice) ? service : min,
              ).unitPrice
            : null;

          return {
            id: variant.id,
            name: variant.name,
            slug: variant.slug,
            minDisplacementCc: variant.minDisplacementCc,
            maxDisplacementCc: variant.maxDisplacementCc,
            sortOrder: variant.sortOrder,
            services,
            startingPrice,
          };
        })
        // A variant with no priced services would be a dead-end tile.
        .filter((variant) => variant.services.length > 0);

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        icon: category.icon,
        description: category.description,
        sortOrder: category.sortOrder,
        variants,
        hasMultipleVariants: variants.length > 1,
      };
    })
    .filter((category) => category.variants.length > 0);
}

/**
 * Full matrix for the admin pricing screen, including inactive rows and
 * variant/service pairs that have no price yet (so the owner can add one).
 */
export async function getPricingMatrix() {
  const [categories, services] = await Promise.all([
    prisma.vehicleCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        icon: true,
        slug: true,
        isActive: true,
        sortOrder: true,
        variants: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            minDisplacementCc: true,
            maxDisplacementCc: true,
            sortOrder: true,
            prices: {
              where: { currentKey: { not: null } },
              select: { id: true, amount: true, serviceId: true, isActive: true, effectiveFrom: true },
            },
          },
        },
      },
    }),
    prisma.service.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        isActive: true,
        allowsQuantity: true,
        sortOrder: true,
      },
    }),
  ]);

  return {
    services,
    categories: categories.map((category) => ({
      ...category,
      variants: category.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        slug: variant.slug,
        isActive: variant.isActive,
        minDisplacementCc: variant.minDisplacementCc,
        maxDisplacementCc: variant.maxDisplacementCc,
        sortOrder: variant.sortOrder,
        prices: variant.prices.map((price) => ({
          id: price.id,
          serviceId: price.serviceId,
          amount: toAmountString(price.amount),
          isActive: price.isActive,
          effectiveFrom: price.effectiveFrom.toISOString(),
        })),
      })),
    })),
  };
}

export async function listServices() {
  return prisma.service.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function listCategories() {
  return prisma.vehicleCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      variants: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      _count: { select: { transactions: true } },
    },
  });
}
