"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import type {
  CatalogCategoryOption,
  CatalogServiceOption,
  CatalogVariantOption,
} from "@/server/services/catalog.service";
import {
  capturePaymentAction,
  openTransactionAction,
  updateTransactionAction,
} from "@/server/actions/pos.actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState, useToast } from "@/components/ui/feedback";
import { formatPeso } from "@/lib/money";
import { computeTotals } from "@/lib/pricing/engine";
import { newIdempotencyKey } from "@/lib/utils";
import type { TransactionDTO, TransactionSummaryDTO } from "@/types/dto";
import { PaymentPanel, type PaymentSubmission } from "./payment-panel";
import { Receipt } from "./receipt";
import { ServicePicker } from "./service-picker";
import { VehiclePicker } from "./vehicle-picker";

/**
 * The POS terminal.
 *
 * Flow: New Transaction → Vehicle → Services → Payment → Receipt.
 *
 * PERFORMANCE: service selection is entirely local state. Tapping a service
 * does not hit the network, so the total updates in the same frame as the tap.
 * The server is consulted exactly twice per sale — once to save and re-price the
 * basket, once to take the money — and its numbers override the local ones on
 * both occasions.
 *
 * DOUBLE-SUBMIT SAFETY: each network step carries an idempotency key generated
 * once per attempt and reused on retry, so a double-tap, an impatient refresh,
 * or a flaky connection cannot produce two transactions or two payments.
 */

type Stage = "idle" | "build" | "pay" | "done";

export function PosTerminal({
  catalog,
  openTransactions,
  businessName,
  canTakePayment,
}: {
  catalog: CatalogCategoryOption[];
  openTransactions: TransactionSummaryDTO[];
  businessName: string;
  canTakePayment: boolean;
}) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [stage, setStage] = useState<Stage>("idle");
  const [transaction, setTransaction] = useState<TransactionDTO | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [priceNotice, setPriceNotice] = useState<string | null>(null);

  // One key per attempt; regenerated only when a step succeeds.
  const openKeyRef = useRef<string>(newIdempotencyKey());
  const payKeyRef = useRef<string>(newIdempotencyKey());

  const category = useMemo(
    () => catalog.find((entry) => entry.id === categoryId) ?? null,
    [catalog, categoryId],
  );
  const variant = useMemo<CatalogVariantOption | null>(
    () => category?.variants.find((entry) => entry.id === variantId) ?? null,
    [category, variantId],
  );

  /** Optimistic totals for instant feedback; the server owns the real ones. */
  const draftTotals = useMemo(() => {
    if (!variant || selected.size === 0) return null;
    try {
      return computeTotals({
        lines: [...selected.entries()].map(([serviceId, quantity]) => {
          const service = variant.services.find((entry) => entry.serviceId === serviceId)!;
          return {
            serviceId,
            serviceName: service.name,
            unitPrice: service.unitPrice,
            quantity,
          };
        }),
      });
    } catch {
      return null;
    }
  }, [variant, selected]);

  const resetBasket = useCallback(() => {
    setCategoryId(null);
    setVariantId(null);
    setSelected(new Map());
    setError(null);
    setPriceNotice(null);
  }, []);

  // -------------------------------------------------------------------------
  // Step 1 — open a numbered transaction
  // -------------------------------------------------------------------------
  function handleNewTransaction() {
    if (isPending) return;
    setError(null);

    startTransition(async () => {
      const result = await openTransactionAction(openKeyRef.current);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      openKeyRef.current = newIdempotencyKey();
      payKeyRef.current = newIdempotencyKey();
      setTransaction(result.data.transaction);
      resetBasket();
      setStage("build");

      if (!result.data.deduplicated) {
        toast.push("success", `${result.data.transaction.customerLabel} — ${result.data.transaction.transactionNumber}`);
      }
    });
  }

  function resumeTransaction(summary: TransactionSummaryDTO) {
    // Resuming re-opens the basket from scratch: the saved lines are re-selected
    // by loading the transaction fresh through the update step.
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/transactions/${summary.id}`, { cache: "no-store" });
      if (!response.ok) {
        setError("Could not load that transaction. Refresh and try again.");
        return;
      }
      const loaded = (await response.json()) as { data: TransactionDTO };
      const tx = loaded.data;

      setTransaction(tx);
      payKeyRef.current = newIdempotencyKey();

      if (tx.variantId) {
        const owningCategory = catalog.find((entry) =>
          entry.variants.some((item) => item.id === tx.variantId),
        );
        setCategoryId(owningCategory?.id ?? null);
        setVariantId(tx.variantId);
        setSelected(new Map(tx.items.map((item) => [item.serviceId, item.quantity])));
      } else {
        resetBasket();
      }

      setStage("build");
    });
  }

  // -------------------------------------------------------------------------
  // Step 2 — vehicle & services (local only)
  // -------------------------------------------------------------------------
  function handleSelectCategory(next: CatalogCategoryOption) {
    setCategoryId(next.id);
    setSelected(new Map());
    setPriceNotice(null);
    // Single-tier categories skip the variant step entirely.
    setVariantId(next.hasMultipleVariants ? null : (next.variants[0]?.id ?? null));
  }

  function handleSelectVariant(next: CatalogVariantOption) {
    setVariantId(next.id);
    setSelected(new Map());
  }

  function handleToggleService(service: CatalogServiceOption) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(service.serviceId)) next.delete(service.serviceId);
      else next.set(service.serviceId, 1);
      return next;
    });
  }

  function handleQuantityChange(service: CatalogServiceOption, quantity: number) {
    if (quantity < 1 || quantity > 99) return;
    setSelected((current) => new Map(current).set(service.serviceId, quantity));
  }

  // -------------------------------------------------------------------------
  // Step 3 — save the basket, server re-prices
  // -------------------------------------------------------------------------
  function handleProceedToPayment() {
    if (!transaction || !variantId || selected.size === 0 || isPending) return;
    setError(null);

    startTransition(async () => {
      const result = await updateTransactionAction({
        transactionId: transaction.id,
        variantId,
        items: [...selected.entries()].map(([serviceId, quantity]) => ({ serviceId, quantity })),
        discountCode: null,
        additionalCharges: null,
        notes: null,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      // If the owner changed a price between page load and checkout, the server
      // total is the real one — say so rather than silently swapping the number.
      if (draftTotals && draftTotals.total.toFixed(2) !== result.data.total) {
        setPriceNotice(
          `Prices were updated. The total is ${formatPeso(result.data.total)}, not ${formatPeso(
            draftTotals.total.toFixed(2),
          )}.`,
        );
      }

      setTransaction(result.data);
      setStage("pay");
    });
  }

  // -------------------------------------------------------------------------
  // Step 4 — payment
  // -------------------------------------------------------------------------
  function handlePayment(submission: PaymentSubmission) {
    if (!transaction || isPending) return;
    setError(null);

    startTransition(async () => {
      const result = await capturePaymentAction({
        transactionId: transaction.id,
        method: submission.method,
        amountTendered: submission.amountTendered,
        referenceNumber: submission.referenceNumber,
        idempotencyKey: payKeyRef.current,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setTransaction(result.data.transaction);
      setStage("done");
      toast.push(
        "success",
        result.data.deduplicated
          ? "That payment was already recorded."
          : `Paid. Change ${formatPeso(result.data.change)}.`,
      );
    });
  }

  function startOver() {
    setTransaction(null);
    resetBasket();
    setStage("idle");
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (stage === "done" && transaction) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Alert tone="success" title="Payment recorded">
          {transaction.customerLabel} · {transaction.transactionNumber} is paid. Hand over the
          receipt and send the vehicle to the queue.
        </Alert>

        <Card className="overflow-hidden">
          <Receipt transaction={transaction} businessName={businessName} />
        </Card>

        <div className="no-print flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" size="lg" fullWidth onClick={() => window.print()}>
            Print receipt
          </Button>
          <Link
            href={`/transactions/${transaction.id}`}
            className="inline-flex min-h-13 flex-1 items-center justify-center rounded-lg border border-[var(--line-strong)] px-5 text-base font-semibold text-strong hover:bg-[var(--surface-muted)]"
          >
            Open transaction
          </Link>
          <Button size="lg" fullWidth onClick={startOver}>
            + New transaction
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "idle") {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Card>
          <CardBody className="space-y-4 text-center">
            <div>
              <h1 className="text-xl font-bold">Ready for the next customer</h1>
              <p className="mt-1 text-sm text-muted">
                A customer number and receipt number are issued the moment you start.
                No customer details are required.
              </p>
            </div>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Button size="xl" fullWidth onClick={handleNewTransaction} isLoading={isPending}>
              + New transaction
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Open transactions"
            description="Unpaid transactions you can pick back up."
          />
          {openTransactions.length === 0 ? (
            <EmptyState
              icon="🧾"
              title="Nothing open"
              description="Every transaction has been paid or cancelled."
            />
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {openTransactions.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => resumeTransaction(item)}
                    disabled={isPending}
                    className="flex min-h-16 w-full items-center gap-3 px-4 text-left hover:bg-[var(--surface-muted)] disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-strong">{item.customerLabel}</span>
                      <span className="block truncate text-xs text-muted">
                        {item.transactionNumber} · {item.vehicleLabel ?? "No vehicle yet"}
                      </span>
                    </span>
                    <span className="tabular shrink-0 font-bold text-strong">
                      {formatPeso(item.total)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  // stage === "build" | "pay"
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
      <div className="min-w-0 space-y-4">
        {stage === "build" ? (
          <>
            <Card>
              <CardBody>
                <VehiclePicker
                  categories={catalog}
                  selectedCategoryId={categoryId}
                  selectedVariantId={variantId}
                  onSelectCategory={handleSelectCategory}
                  onSelectVariant={handleSelectVariant}
                  disabled={isPending}
                />
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <ServicePicker
                  variant={variant}
                  selected={selected}
                  onToggle={handleToggleService}
                  onQuantityChange={handleQuantityChange}
                  disabled={isPending}
                />
              </CardBody>
            </Card>
          </>
        ) : (
          <Card>
            <CardHeader title="Payment" description="Confirm the amount and take payment." />
            <CardBody>
              {transaction ? (
                <PaymentPanel
                  transaction={transaction}
                  onSubmit={handlePayment}
                  onBack={() => {
                    setError(null);
                    setStage("build");
                  }}
                  isSubmitting={isPending}
                  error={error}
                />
              ) : null}
            </CardBody>
          </Card>
        )}
      </div>

      {/* Running transaction summary — always visible on desktop, sticky. */}
      <div className="min-w-0">
        <Card className="xl:sticky xl:top-20">
          <CardHeader
            title={transaction?.customerLabel ?? "Transaction"}
            description={transaction?.transactionNumber}
          />
          <CardBody className="space-y-4">
            {priceNotice ? <Alert tone="warning">{priceNotice}</Alert> : null}
            {error && stage === "build" ? <Alert tone="error">{error}</Alert> : null}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Vehicle</p>
              <p className="text-base font-semibold text-strong">
                {variant && category
                  ? category.hasMultipleVariants
                    ? `${category.name} ${variant.name}`
                    : category.name
                  : "Not selected"}
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                Services
              </p>
              {draftTotals ? (
                <ul className="space-y-1.5">
                  {draftTotals.lines.map((line) => (
                    <li key={line.serviceId} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {line.serviceName}
                        {line.quantity > 1 ? (
                          <span className="text-muted"> × {line.quantity}</span>
                        ) : null}
                      </span>
                      <span className="tabular shrink-0 font-semibold text-strong">
                        {formatPeso(line.lineTotal.toFixed(2))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No services selected yet.</p>
              )}
            </div>

            <div className="border-t border-[var(--line)] pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wide text-muted">
                  Total
                </span>
                <span className="tabular text-3xl font-bold text-strong">
                  {formatPeso(
                    stage === "pay" && transaction
                      ? transaction.total
                      : (draftTotals?.total.toFixed(2) ?? "0"),
                  )}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Prices come from the database and cannot be edited here.
              </p>
            </div>

            {stage === "build" ? (
              <div className="space-y-2">
                <Button
                  size="xl"
                  fullWidth
                  onClick={handleProceedToPayment}
                  disabled={!variantId || selected.size === 0 || !canTakePayment}
                  isLoading={isPending}
                >
                  Proceed to payment
                </Button>
                {!canTakePayment ? (
                  <p className="text-center text-xs text-muted">
                    You do not have permission to take payment. Ask a cashier to complete this sale.
                  </p>
                ) : null}
                <Button variant="ghost" size="md" fullWidth onClick={startOver} disabled={isPending}>
                  Park this transaction
                </Button>
              </div>
            ) : null}

            {transaction ? (
              <Link
                href={`/transactions/${transaction.id}`}
                className="block text-center text-xs font-medium text-muted underline underline-offset-2"
              >
                View full transaction
              </Link>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
