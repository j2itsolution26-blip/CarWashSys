"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPriceAction } from "@/server/actions/admin.actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { Alert, useToast } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { formatPeso } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Price administration.
 *
 * Laid out as grouped lists rather than a category × service matrix: a matrix
 * needs horizontal scrolling on anything smaller than a laptop, and this screen
 * is used on a phone in the office as often as at a desk.
 *
 * Saving a price never overwrites the old row — the server supersedes it — so
 * the confirmation copy here says "new price applies to new transactions",
 * which is exactly what happens.
 */

export interface PricingService {
  id: string;
  name: string;
  isActive: boolean;
}

export interface PricingVariant {
  id: string;
  name: string;
  isActive: boolean;
  prices: Array<{ id: string; serviceId: string; amount: string; isActive: boolean }>;
}

export interface PricingCategory {
  id: string;
  name: string;
  icon: string;
  isActive: boolean;
  variants: PricingVariant[];
}

interface EditTarget {
  variantId: string;
  serviceId: string;
  vehicleLabel: string;
  serviceName: string;
  currentAmount: string | null;
}

export function PricingManager({
  categories,
  services,
}: {
  categories: PricingCategory[];
  services: PricingService[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [target, setTarget] = useState<EditTarget | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeServices = services.filter((service) => service.isActive);

  function openEditor(edit: EditTarget) {
    setTarget(edit);
    setAmount(edit.currentAmount ?? "");
    setNote("");
    setError(null);
  }

  function save() {
    if (!target) return;
    setError(null);

    startTransition(async () => {
      const result = await setPriceAction({
        variantId: target.variantId,
        serviceId: target.serviceId,
        amount: amount.trim(),
        note: note.trim() || null,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      toast.push(
        "success",
        result.data.previousAmount
          ? `${target.serviceName}: ${formatPeso(result.data.previousAmount)} → ${formatPeso(
              result.data.newAmount,
            )}`
          : `${target.serviceName} priced at ${formatPeso(result.data.newAmount)}`,
      );
      setTarget(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {categories.map((category) => (
        <Card key={category.id}>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <span aria-hidden="true">{category.icon}</span>
                {category.name}
                {!category.isActive ? (
                  <span className="rounded-full bg-[var(--surface-inset)] px-2 py-0.5 text-xs font-semibold text-muted">
                    Disabled
                  </span>
                ) : null}
              </span>
            }
            description={`${category.variants.length} vehicle type${
              category.variants.length === 1 ? "" : "s"
            }`}
          />

          <div className="divide-y divide-[var(--line)]">
            {category.variants.map((variant) => {
              const vehicleLabel =
                variant.name.toLowerCase() === "standard"
                  ? category.name
                  : `${category.name} ${variant.name}`;

              return (
                <div key={variant.id} className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-strong">
                      {variant.name}
                    </h3>
                    {!variant.isActive ? (
                      <span className="rounded-full bg-[var(--surface-inset)] px-2 py-0.5 text-xs font-semibold text-muted">
                        Disabled
                      </span>
                    ) : null}
                  </div>

                  <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {activeServices.map((service) => {
                      const price = variant.prices.find(
                        (entry) => entry.serviceId === service.id,
                      );

                      return (
                        <li key={service.id}>
                          <button
                            type="button"
                            onClick={() =>
                              openEditor({
                                variantId: variant.id,
                                serviceId: service.id,
                                vehicleLabel,
                                serviceName: service.name,
                                currentAmount: price?.amount ?? null,
                              })
                            }
                            className={cn(
                              "flex min-h-14 w-full items-center justify-between gap-2 rounded-lg border px-3 text-left transition-colors hover:bg-[var(--surface-muted)]",
                              price
                                ? "border-[var(--line)]"
                                : "border-dashed border-[var(--line-strong)]",
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-strong">
                                {service.name}
                              </span>
                              <span className="block text-xs text-muted">
                                {price ? "Tap to change" : "Not offered — tap to add"}
                              </span>
                            </span>
                            <span className="tabular shrink-0 text-base font-bold text-strong">
                              {price ? formatPeso(price.amount) : "—"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={target ? `${target.serviceName} — ${target.vehicleLabel}` : ""}
        description={
          target?.currentAmount
            ? `Current price ${formatPeso(target.currentAmount)}`
            : "This service has no price for this vehicle yet."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={save} isLoading={isPending} disabled={amount.trim() === ""}>
              Save price
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <TextField
            label="New price"
            prefix="₱"
            inputMode="decimal"
            inputSize="lg"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0.00"
            required
          />

          <TextField
            label="Reason (optional)"
            hint="Stored with the price history, e.g. “supplier increase”."
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={200}
          />

          <Alert tone="info" title="Historical prices are safe">
            The new price applies to new transactions only. Receipts already issued keep the price
            they were charged.
          </Alert>
        </div>
      </Modal>
    </div>
  );
}
