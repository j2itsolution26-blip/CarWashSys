/**
 * The CG Car Wash price board, expressed as data.
 *
 * This is the ONLY place these numbers appear in the repository. They are
 * inserted into `service_prices` on first seed and are owned by the database
 * from that moment on — the admin pricing screen is how they change afterwards.
 * Re-running the seed will NOT overwrite a price the owner has since edited.
 *
 * ASSUMPTION (flagged for the owner): the price board quotes motorcycles as a
 * single flat price per engine displacement rather than per service, so
 * motorcycles are seeded with one service — "Motorcycle Wash" — priced per
 * displacement tier. If motorcycles should also offer Body Wax etc., add those
 * prices in Settings → Services & Pricing; no code change is required.
 */

export interface SeedServiceDefinition {
  slug: string;
  name: string;
  description: string;
  allowsQuantity: boolean;
  sortOrder: number;
}

export interface SeedVariantDefinition {
  slug: string;
  name: string;
  minDisplacementCc?: number;
  maxDisplacementCc?: number;
  sortOrder: number;
  /** service slug → peso amount as a string (never a float literal). */
  prices: Record<string, string>;
}

export interface SeedCategoryDefinition {
  slug: string;
  name: string;
  icon: string;
  description: string;
  sortOrder: number;
  variants: SeedVariantDefinition[];
}

export const SEED_SERVICES: SeedServiceDefinition[] = [
  {
    slug: "body-wash",
    name: "Body Wash",
    description: "Exterior soap wash and rinse",
    allowsQuantity: false,
    sortOrder: 1,
  },
  {
    slug: "vacuum",
    name: "Vacuum",
    description: "Interior vacuum of seats, floor and trunk",
    allowsQuantity: false,
    sortOrder: 2,
  },
  {
    slug: "under-wash",
    name: "Under Wash",
    description: "Undercarriage pressure wash",
    allowsQuantity: false,
    sortOrder: 3,
  },
  {
    slug: "engine-cleaning",
    name: "Engine Cleaning",
    description: "Engine bay degrease and rinse",
    allowsQuantity: false,
    sortOrder: 4,
  },
  {
    slug: "body-wax",
    name: "Body Wax",
    description: "Hand-applied wax and buff",
    allowsQuantity: false,
    sortOrder: 5,
  },
  {
    slug: "motorcycle-wash",
    name: "Motorcycle Wash",
    description: "Full motorcycle wash, priced by engine displacement",
    allowsQuantity: false,
    sortOrder: 6,
  },
];

/** Convenience: the five services every four-wheeled vehicle offers. */
function carPrices(
  bodyWash: string,
  vacuum: string,
  underWash: string,
  engineCleaning: string,
  bodyWax: string,
): Record<string, string> {
  return {
    "body-wash": bodyWash,
    vacuum: vacuum,
    "under-wash": underWash,
    "engine-cleaning": engineCleaning,
    "body-wax": bodyWax,
  };
}

export const SEED_CATEGORIES: SeedCategoryDefinition[] = [
  {
    slug: "motorcycle",
    name: "Motorcycle",
    icon: "🏍️",
    description: "Priced by engine displacement",
    sortOrder: 1,
    variants: [
      {
        slug: "100-125cc",
        name: "100–125cc",
        minDisplacementCc: 100,
        maxDisplacementCc: 125,
        sortOrder: 1,
        prices: { "motorcycle-wash": "100.00" },
      },
      {
        slug: "150-200cc",
        name: "150–200cc",
        minDisplacementCc: 150,
        maxDisplacementCc: 200,
        sortOrder: 2,
        prices: { "motorcycle-wash": "110.00" },
      },
      {
        slug: "250-300cc",
        name: "250–300cc",
        minDisplacementCc: 250,
        maxDisplacementCc: 300,
        sortOrder: 3,
        prices: { "motorcycle-wash": "150.00" },
      },
      {
        slug: "300-1000cc",
        name: "300–1000cc",
        minDisplacementCc: 300,
        maxDisplacementCc: 1000,
        sortOrder: 4,
        prices: { "motorcycle-wash": "200.00" },
      },
    ],
  },
  {
    slug: "small-hatchback",
    name: "Small Hatchback",
    icon: "🚗",
    description: "Compact hatchback vehicles",
    sortOrder: 2,
    variants: [
      {
        slug: "standard",
        name: "Standard",
        sortOrder: 1,
        prices: carPrices("125.00", "125.00", "125.00", "80.00", "150.00"),
      },
    ],
  },
  {
    slug: "sedan-car",
    name: "Sedan Car",
    icon: "🚘",
    description: "Four-door sedans",
    sortOrder: 3,
    variants: [
      {
        slug: "standard",
        name: "Standard",
        sortOrder: 1,
        prices: carPrices("135.00", "135.00", "135.00", "90.00", "160.00"),
      },
    ],
  },
  {
    slug: "suv-pickup",
    name: "SUV / Pick Up",
    icon: "🚙",
    description: "Sport utility vehicles and pick-up trucks",
    sortOrder: 4,
    variants: [
      {
        slug: "standard",
        name: "Standard",
        sortOrder: 1,
        prices: carPrices("160.00", "160.00", "160.00", "110.00", "300.00"),
      },
    ],
  },
  {
    slug: "regular-van",
    name: "Regular Size Van",
    icon: "🚐",
    description: "Standard-height vans",
    sortOrder: 5,
    variants: [
      {
        slug: "standard",
        name: "Standard",
        sortOrder: 1,
        prices: carPrices("180.00", "180.00", "180.00", "120.00", "300.00"),
      },
    ],
  },
  {
    slug: "hi-roof-van",
    name: "Hi Roof Van",
    icon: "🚐",
    description: "High-roof vans and large utility vans",
    sortOrder: 6,
    variants: [
      {
        slug: "standard",
        name: "Standard",
        sortOrder: 1,
        // Note: Under Wash (₱200) is intentionally lower than Body Wash (₱215)
        // for this category — taken verbatim from the shop's price board.
        prices: carPrices("215.00", "215.00", "200.00", "130.00", "320.00"),
      },
    ],
  },
];
