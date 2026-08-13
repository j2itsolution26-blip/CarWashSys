"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeStatusAction } from "@/server/actions/pos.actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState, useToast } from "@/components/ui/feedback";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatTimeOnly } from "@/lib/business-date";
import { formatPeso } from "@/lib/money";
import {
  STATUS_LABELS,
  nextStatuses,
  type TransactionStatusValue,
} from "@/lib/transactions/status-machine";
import type { TransactionSummaryDTO } from "@/types/dto";

/**
 * Wash-floor queue board.
 *
 * Grouped by stage so a washer sees their column at a glance. The only moves
 * offered on each card are the ones the state machine actually permits from
 * that status — an illegal transition is not a disabled button here, it is a
 * button that does not exist.
 */

const COLUMNS: Array<{ status: TransactionStatusValue; hint: string }> = [
  { status: "QUEUED", hint: "Waiting for a bay" },
  { status: "WASHING", hint: "Being washed now" },
  { status: "QUALITY_CHECK", hint: "Final inspection" },
];

export function QueueBoard({
  jobs,
  canUpdate,
}: {
  jobs: TransactionSummaryDTO[];
  canUpdate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function advance(job: TransactionSummaryDTO, toStatus: TransactionStatusValue) {
    if (isPending) return;
    setError(null);
    setBusyId(job.id);

    startTransition(async () => {
      const result = await changeStatusAction({
        transactionId: job.id,
        toStatus,
        note: null,
      });
      setBusyId(null);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      toast.push("success", `${job.customerLabel} → ${STATUS_LABELS[toStatus]}`);
      router.refresh();
    });
  }

  if (jobs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="🚿"
          title="Nothing in the queue"
          description="Vehicles appear here once a transaction is sent to the wash floor."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const columnJobs = jobs.filter((job) => job.status === column.status);

          return (
            <Card key={column.status} className="min-w-0">
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {STATUS_LABELS[column.status]}
                    <span className="rounded-full bg-[var(--surface-inset)] px-2 py-0.5 text-xs font-semibold text-muted">
                      {columnJobs.length}
                    </span>
                  </span>
                }
                description={column.hint}
              />

              {columnJobs.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">Empty</p>
              ) : (
                <ul className="divide-y divide-[var(--line)]">
                  {columnJobs.map((job) => {
                    const moves = nextStatuses(job.status).filter(
                      (status) => status !== "CANCELLED" && status !== "PAID",
                    );

                    return (
                      <li key={job.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-base font-bold text-strong">{job.customerLabel}</p>
                            <p className="truncate text-xs text-muted">
                              {job.transactionNumber} · {job.vehicleLabel ?? "No vehicle"}
                            </p>
                          </div>
                          <StatusBadge status={job.status} isPaid={job.isPaid} />
                        </div>

                        <p className="mt-2 line-clamp-2 text-sm text-muted">
                          {job.serviceNames.join(", ")}
                        </p>

                        <div className="mt-2 flex items-center justify-between text-xs text-muted">
                          <span>In since {formatTimeOnly(job.createdAt)}</span>
                          <span className="tabular font-semibold text-strong">
                            {formatPeso(job.total)}
                          </span>
                        </div>

                        {job.assignedStaffName ? (
                          <p className="mt-1 text-xs text-muted">
                            Assigned to {job.assignedStaffName}
                          </p>
                        ) : null}

                        {canUpdate && moves.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {moves.map((status) => (
                              <Button
                                key={status}
                                size="sm"
                                variant={status === "COMPLETED" ? "success" : "primary"}
                                onClick={() => advance(job, status)}
                                isLoading={busyId === job.id && isPending}
                              >
                                {status === "COMPLETED"
                                  ? "Mark complete"
                                  : `Move to ${STATUS_LABELS[status]}`}
                              </Button>
                            ))}
                          </div>
                        ) : null}

                        <Link
                          href={`/transactions/${job.id}`}
                          className="mt-2 inline-block text-xs font-medium text-muted underline underline-offset-2"
                        >
                          Details
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
