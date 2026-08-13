"use client";

import type { CatalogServiceOption, CatalogVariantOption } from "@/server/services/catalog.service";
import { formatPeso } from "@/lib/money";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/feedback";

/**
 * Service selection for the chosen vehicle.
 *
 * NOTE WHAT IS NOT HERE: there is no price input. The amount beside each
 * service is rendered text straight from the database — the cashier can select
 * or deselect, and adjust quantity where the service allows it, but there is no
 * control anywhere on this screen capable of setting a price.
 */

export interface SelectedService {
  serviceId: string;
  quantity: number;
}

export function ServicePicker({
  variant,
  selected,
  onToggle,
  onQuantityChange,
  disabled,
}: {
  variant: CatalogVariantOption | null;
  selected: Map<string, number>;
  onToggle: (service: CatalogServiceOption) => void;
  onQuantityChange: (service: CatalogServiceOption, quantity: number) => void;
  disabled?: boolean;
}) {
  if (!variant) {
    return (
      <EmptyState
        icon="🚗"
        title="Pick a vehicle first"
        description="Services and prices load once a vehicle type is selected."
      />
    );
  }

  if (variant.services.length === 0) {
    return (
      <EmptyState
        icon="🧰"
        title="No services priced for this vehicle"
        description="An owner or administrator needs to set prices for this vehicle type."
      />
    );
  }

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        2. Services
      </legend>

      <ul className="space-y-2">
        {variant.services.map((service) => {
          const quantity = selected.get(service.serviceId) ?? 0;
          const isSelected = quantity > 0;

          return (
            <li key={service.serviceId}>
              <div
                className={cn(
                  "flex items-stretch gap-2 rounded-xl border-2 transition-colors",
                  isSelected
                    ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                    : "border-[var(--line)] bg-[var(--surface-card)]",
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggle(service)}
                  aria-pressed={isSelected}
                  className="flex min-h-16 flex-1 items-center gap-3 rounded-l-lg px-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {/* Checkbox is decorative: the whole row is the control. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-md border-2 text-sm font-bold",
                      isSelected
                        ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-contrast)]"
                        : "border-[var(--line-strong)]",
                    )}
                  >
                    {isSelected ? "✓" : ""}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-base font-semibold",
                        isSelected ? "text-[var(--brand-strong)]" : "text-strong",
                      )}
                    >
                      {service.name}
                    </span>
                    {service.description ? (
                      <span className="block truncate text-xs text-muted">
                        {service.description}
                      </span>
                    ) : null}
                  </span>

                  <span className="tabular shrink-0 text-lg font-bold text-strong">
                    {formatPeso(service.unitPrice)}
                  </span>
                </button>

                {isSelected && service.allowsQuantity ? (
                  <div className="flex items-center gap-1 pr-2">
                    <QuantityButton
                      label={`Decrease ${service.name} quantity`}
                      onClick={() => onQuantityChange(service, quantity - 1)}
                      disabled={quantity <= 1}
                    >
                      −
                    </QuantityButton>
                    <span
                      className="tabular w-8 text-center text-base font-bold"
                      aria-label={`${service.name} quantity`}
                    >
                      {quantity}
                    </span>
                    <QuantityButton
                      label={`Increase ${service.name} quantity`}
                      onClick={() => onQuantityChange(service, quantity + 1)}
                      disabled={quantity >= 99}
                    >
                      +
                    </QuantityButton>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

function QuantityButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-10 place-items-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface-card)] text-lg font-bold text-strong disabled:opacity-40"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
