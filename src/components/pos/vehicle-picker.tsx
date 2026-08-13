"use client";

import type { CatalogCategoryOption, CatalogVariantOption } from "@/server/services/catalog.service";
import { formatPesoCompact } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Vehicle selection.
 *
 * Two levels, but the second only appears when it earns its place: categories
 * with a single price tier (Sedan, SUV…) select straight through, while
 * Motorcycle expands into its displacement tiers. The cc range is rendered as
 * the tile's headline because that is what the cashier is matching against the
 * bike in front of them.
 */

export function VehiclePicker({
  categories,
  selectedCategoryId,
  selectedVariantId,
  onSelectCategory,
  onSelectVariant,
  disabled,
}: {
  categories: CatalogCategoryOption[];
  selectedCategoryId: string | null;
  selectedVariantId: string | null;
  onSelectCategory: (category: CatalogCategoryOption) => void;
  onSelectVariant: (variant: CatalogVariantOption) => void;
  disabled?: boolean;
}) {
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;

  return (
    <div className="space-y-5">
      <fieldset disabled={disabled} className="min-w-0">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          1. Vehicle
        </legend>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
          {categories.map((category) => {
            const isSelected = category.id === selectedCategoryId;
            const from = cheapestOf(category);

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => onSelectCategory(category)}
                aria-pressed={isSelected}
                className={cn(
                  "flex min-h-24 flex-col items-start justify-between gap-1 rounded-xl border-2 p-3 text-left transition-colors",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  isSelected
                    ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                    : "border-[var(--line)] bg-[var(--surface-card)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)]",
                )}
              >
                <span aria-hidden="true" className="text-2xl leading-none">
                  {category.icon}
                </span>
                <span className="w-full">
                  <span
                    className={cn(
                      "block text-sm font-semibold leading-tight",
                      isSelected ? "text-[var(--brand-strong)]" : "text-strong",
                    )}
                  >
                    {category.name}
                  </span>
                  {from ? (
                    <span className="tabular mt-0.5 block text-xs text-muted">from {from}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {selectedCategory && selectedCategory.hasMultipleVariants ? (
        <fieldset disabled={disabled} className="min-w-0">
          <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Engine displacement
          </legend>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
            {selectedCategory.variants.map((variant) => {
              const isSelected = variant.id === selectedVariantId;
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => onSelectVariant(variant)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex min-h-20 flex-col items-start justify-center gap-1 rounded-xl border-2 p-3 text-left transition-colors",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    isSelected
                      ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                      : "border-[var(--line)] bg-[var(--surface-card)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)]",
                  )}
                >
                  <span
                    className={cn(
                      "text-base font-bold leading-tight",
                      isSelected ? "text-[var(--brand-strong)]" : "text-strong",
                    )}
                  >
                    {variant.name}
                  </span>
                  {variant.startingPrice ? (
                    <span className="tabular text-sm font-semibold text-muted">
                      {formatPesoCompact(variant.startingPrice)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

function cheapestOf(category: CatalogCategoryOption): string | null {
  const prices = category.variants
    .map((variant) => variant.startingPrice)
    .filter((price): price is string => price !== null);
  if (prices.length === 0) return null;
  const min = prices.reduce((lowest, price) => (Number(price) < Number(lowest) ? price : lowest));
  return formatPesoCompact(min);
}
