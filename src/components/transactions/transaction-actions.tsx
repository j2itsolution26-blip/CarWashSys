"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  cancelTransactionAction,
  changeStatusAction,
  voidPaymentAction,
} from "@/server/actions/pos.actions";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { Alert, useToast } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { STATUS_LABELS, nextStatuses } from "@/lib/transactions/status-machine";
import type { TransactionDTO } from "@/types/dto";

/**
 * Actions available on a transaction, filtered by BOTH the state machine and
 * the viewer's permissions.
 *
 * Destructive actions (cancel, void) require a typed reason — it lands in the
 * audit log, which is the only reason anyone will ever be able to reconstruct
 * why a sale disappeared from a day's takings.
 */
export function TransactionActions({
  transaction,
  canUpdateQueue,
  canCancel,
  canVoidPayment,
}: {
  transaction: TransactionDTO;
  canUpdateQueue: boolean;
  canCancel: boolean;
  canVoidPayment: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const moves = nextStatuses(transaction.status).filter(
    (status) => status !== "CANCELLED" && status !== "PAID",
  );
  const capturedPayment = transaction.payments.find((payment) => payment.status === "CAPTURED");

  function advance(toStatus: (typeof moves)[number]) {
    setError(null);
    startTransition(async () => {
      const result = await changeStatusAction({
        transactionId: transaction.id,
        toStatus,
        note: null,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.push("success", `Moved to ${STATUS_LABELS[toStatus]}`);
      router.refresh();
    });
  }

  function submitCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelTransactionAction({
        transactionId: transaction.id,
        reason: reason.trim(),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCancelOpen(false);
      setReason("");
      toast.push("success", "Transaction cancelled");
      router.refresh();
    });
  }

  function submitVoid(paymentId: string) {
    setError(null);
    startTransition(async () => {
      const result = await voidPaymentAction(paymentId, reason.trim());
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setVoidOpen(null);
      setReason("");
      toast.push("success", "Payment voided");
      router.refresh();
    });
  }

  const hasAnyAction =
    (canUpdateQueue && moves.length > 0) ||
    (canCancel && !transaction.isPaid && transaction.status !== "CANCELLED") ||
    (canVoidPayment && Boolean(capturedPayment));

  return (
    <div className="no-print space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => window.print()}>
          Print receipt
        </Button>

        {canUpdateQueue
          ? moves.map((status) => (
              <Button
                key={status}
                variant={status === "COMPLETED" ? "success" : "primary"}
                onClick={() => advance(status)}
                isLoading={isPending}
              >
                {status === "COMPLETED" ? "Mark complete" : `Move to ${STATUS_LABELS[status]}`}
              </Button>
            ))
          : null}

        {canCancel && !transaction.isPaid && transaction.status !== "CANCELLED" ? (
          <Button variant="danger" onClick={() => setCancelOpen(true)}>
            Cancel transaction
          </Button>
        ) : null}

        {canVoidPayment && capturedPayment ? (
          <Button variant="outline" onClick={() => setVoidOpen(capturedPayment.id)}>
            Void payment
          </Button>
        ) : null}
      </div>

      {!hasAnyAction ? (
        <p className="text-xs text-muted">No further actions are available on this transaction.</p>
      ) : null}

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this transaction?"
        description={`${transaction.customerLabel} · ${transaction.transactionNumber}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={isPending}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={submitCancel}
              isLoading={isPending}
              disabled={reason.trim().length < 3}
            >
              Cancel transaction
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Reason"
          hint="Recorded in the audit log. At least 3 characters."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={300}
        />
      </Modal>

      <Modal
        open={voidOpen !== null}
        onClose={() => setVoidOpen(null)}
        title="Void this payment?"
        description="The payment record is kept and marked voided. The transaction returns to unpaid."
        footer={
          <>
            <Button variant="secondary" onClick={() => setVoidOpen(null)} disabled={isPending}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => voidOpen && submitVoid(voidOpen)}
              isLoading={isPending}
              disabled={reason.trim().length < 3}
            >
              Void payment
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Reason"
          hint="Recorded in the audit log. At least 3 characters."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={300}
        />
      </Modal>
    </div>
  );
}
