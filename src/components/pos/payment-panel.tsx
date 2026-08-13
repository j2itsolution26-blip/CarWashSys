"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { formatPeso } from "@/lib/money";
import { computeChange } from "@/lib/pricing/engine";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { cn } from "@/lib/utils";
import type { TransactionDTO } from "@/types/dto";

/**
 * Payment screen.
 *
 * The change shown here is computed client-side purely so the cashier sees it
 * the instant they type; the server recomputes it from the stored total before
 * anything is written, and its answer is what lands on the receipt.
 */

export interface PaymentSubmission {
  method: (typeof PAYMENT_METHODS)[number]["value"];
  amountTendered: string;
  referenceNumber: string | null;
}

/** Common Philippine note denominations for one-tap cash entry. */
const QUICK_CASH = ["100", "200", "500", "1000"];

export function PaymentPanel({
  transaction,
  onSubmit,
  onBack,
  isSubmitting,
  error,
}: {
  transaction: TransactionDTO;
  onSubmit: (submission: PaymentSubmission) => void;
  onBack: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [method, setMethod] = useState<PaymentSubmission["method"]>("CASH");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");

  const methodConfig = PAYMENT_METHODS.find((entry) => entry.value === method)!;
  const total = transaction.total;

  const cash = useMemo(() => {
    if (!methodConfig.isCash) return null;
    if (tendered.trim() === "") return null;
    try {
      return computeChange(total, tendered);
    } catch {
      return null;
    }
  }, [methodConfig.isCash, tendered, total]);

  const canSubmit = methodConfig.isCash ? Boolean(cash?.isSufficient) : true;

  function submit() {
    onSubmit({
      method,
      // Non-cash methods settle the exact amount due; the server enforces this.
      amountTendered: methodConfig.isCash ? tendered.trim() : total,
      referenceNumber: methodConfig.needsReference && reference.trim() ? reference.trim() : null,
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-[var(--surface-inset)] p-4 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-muted">Amount due</p>
        <p className="tabular mt-1 text-4xl font-bold text-strong sm:text-5xl">
          {formatPeso(total)}
        </p>
        <p className="mt-1 text-sm text-muted">
          {transaction.customerLabel} · {transaction.transactionNumber}
        </p>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <fieldset disabled={isSubmitting}>
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Payment method
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PAYMENT_METHODS.map((entry) => {
            const isSelected = entry.value === method;
            return (
              <button
                key={entry.value}
                type="button"
                onClick={() => {
                  setMethod(entry.value);
                  setTendered("");
                  setReference("");
                }}
                aria-pressed={isSelected}
                className={cn(
                  "min-h-13 rounded-xl border-2 px-3 text-sm font-semibold transition-colors",
                  isSelected
                    ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]"
                    : "border-[var(--line)] bg-[var(--surface-card)] text-strong hover:bg-[var(--surface-muted)]",
                )}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {methodConfig.isCash ? (
        <div className="space-y-3">
          <TextField
            label="Cash received"
            inputMode="decimal"
            prefix="₱"
            inputSize="lg"
            value={tendered}
            onChange={(event) => setTendered(event.target.value.replace(/[^\d.]/g, ""))}
            disabled={isSubmitting}
            error={
              cash && !cash.isSufficient
                ? `Short by ${formatPeso(cash.shortfall)}`
                : undefined
            }
            placeholder="0.00"
          />

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setTendered(total)}>
              Exact {formatPeso(total)}
            </Button>
            {QUICK_CASH.filter((amount) => Number(amount) >= Number(total)).map((amount) => (
              <Button
                key={amount}
                variant="outline"
                size="sm"
                onClick={() => setTendered(amount)}
              >
                ₱{amount}
              </Button>
            ))}
          </div>

          <div
            className={cn(
              "flex items-center justify-between rounded-xl px-4 py-3",
              cash?.isSufficient
                ? "bg-[var(--positive-soft)]"
                : "bg-[var(--surface-inset)]",
            )}
          >
            <span className="text-sm font-semibold uppercase tracking-wide text-muted">Change</span>
            <span className="tabular text-3xl font-bold text-strong">
              {formatPeso(cash?.change ?? 0)}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl bg-[var(--surface-inset)] px-4 py-3 text-sm text-muted">
            {methodConfig.label} settles the exact amount of {formatPeso(total)}. No change is
            given.
          </div>
          {methodConfig.needsReference ? (
            <TextField
              label="Reference number"
              hint="Optional — the confirmation number from the wallet or bank."
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              disabled={isSubmitting}
              maxLength={60}
            />
          ) : null}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="secondary" size="lg" onClick={onBack} disabled={isSubmitting}>
          Edit transaction
        </Button>
        <Button
          variant="success"
          size="lg"
          fullWidth
          onClick={submit}
          disabled={!canSubmit}
          isLoading={isSubmitting}
        >
          {isSubmitting ? "Recording payment…" : `Complete payment · ${formatPeso(total)}`}
        </Button>
      </div>
    </div>
  );
}
