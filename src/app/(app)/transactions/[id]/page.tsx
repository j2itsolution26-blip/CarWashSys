import Link from "next/link";
import { notFound } from "next/navigation";
import { Receipt } from "@/components/pos/receipt";
import { TransactionActions } from "@/components/transactions/transaction-actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAnyPermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/business-date";
import { AppError } from "@/lib/errors";
import { formatPeso } from "@/lib/money";
import { describeMethod } from "@/lib/payment-methods";
import { PERMISSIONS, hasPermission } from "@/lib/permissions/permissions";
import { STATUS_LABELS } from "@/lib/transactions/status-machine";
import { getTransaction } from "@/server/services/transaction.service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Transaction ${id.slice(0, 8)}` };
}

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAnyPermission([
    PERMISSIONS.TRANSACTION_READ_OWN,
    PERMISSIONS.TRANSACTION_READ_ALL,
  ]);
  const { id } = await params;

  let transaction;
  try {
    transaction = await getTransaction(id, user);
  } catch (error) {
    // getTransaction returns NOT_FOUND for records outside the viewer's scope,
    // so an out-of-scope record and a missing one are indistinguishable here.
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <div className="space-y-4">
      <div className="no-print">
        <Link
          href="/transactions"
          className="text-sm font-medium text-muted underline underline-offset-2"
        >
          ← All transactions
        </Link>
      </div>

      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{transaction.customerLabel}</h1>
          <p className="text-sm text-muted">
            {transaction.transactionNumber} · opened {formatDateTime(transaction.createdAt)}
          </p>
        </div>
        <StatusBadge status={transaction.status} isPaid={transaction.isPaid} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,26rem)]">
        <div className="min-w-0 space-y-4">
          <Card className="no-print">
            <CardHeader title="Services" description={transaction.vehicleLabel ?? "No vehicle selected"} />
            <CardBody className="p-0">
              {transaction.items.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted">
                  No services have been added to this transaction yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-wide text-muted">
                      <th scope="col" className="px-4 py-2.5 font-semibold">Service</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">Price</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">Qty</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">Line total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {transaction.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-medium text-strong">{item.serviceName}</td>
                        <td className="tabular px-4 py-3 text-right text-muted">
                          {formatPeso(item.unitPrice)}
                        </td>
                        <td className="tabular px-4 py-3 text-right text-muted">{item.quantity}</td>
                        <td className="tabular px-4 py-3 text-right font-semibold text-strong">
                          {formatPeso(item.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-[var(--line-strong)]">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-sm text-muted">
                        Subtotal
                      </td>
                      <td className="tabular px-4 py-2 text-right font-semibold">
                        {formatPeso(transaction.subtotal)}
                      </td>
                    </tr>
                    {Number(transaction.discountAmount) > 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-right text-sm text-muted">
                          Discount {transaction.discountCode ? `(${transaction.discountCode})` : ""}
                        </td>
                        <td className="tabular px-4 py-2 text-right font-semibold">
                          −{formatPeso(transaction.discountAmount)}
                        </td>
                      </tr>
                    ) : null}
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-right text-base font-bold">
                        Total
                      </td>
                      <td className="tabular px-4 py-3 text-right text-lg font-bold text-strong">
                        {formatPeso(transaction.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardBody>
          </Card>

          <Card className="no-print">
            <CardHeader title="Payments" />
            <CardBody className="p-0">
              {transaction.payments.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted">No payment recorded yet.</p>
              ) : (
                <ul className="divide-y divide-[var(--line)]">
                  {transaction.payments.map((payment) => (
                    <li key={payment.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold text-strong">
                          {describeMethod(payment.method)}
                          {payment.status !== "CAPTURED" ? (
                            <span className="ml-2 rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-xs font-semibold">
                              {payment.status === "VOIDED" ? "Voided" : "Refunded"}
                            </span>
                          ) : null}
                        </span>
                        <span className="tabular font-bold text-strong">
                          {formatPeso(payment.amountDue)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Received {formatPeso(payment.amountTendered)} · change{" "}
                        {formatPeso(payment.changeGiven)}
                        {payment.referenceNumber ? ` · ref ${payment.referenceNumber}` : ""}
                      </p>
                      <p className="text-xs text-muted">
                        {formatDateTime(payment.createdAt)} by {payment.processedByName ?? "—"}
                      </p>
                      {payment.voidReason ? (
                        <p className="mt-1 text-xs font-medium text-[var(--danger)]">
                          Voided: {payment.voidReason}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card className="no-print">
            <CardHeader title="History" description="Every status change, in order." />
            <CardBody>
              <ol className="space-y-3">
                {transaction.statusHistory.map((event) => (
                  <li key={event.id} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--brand)]"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-strong">
                        {event.fromStatus
                          ? `${STATUS_LABELS[event.fromStatus]} → ${STATUS_LABELS[event.toStatus]}`
                          : STATUS_LABELS[event.toStatus]}
                      </p>
                      <p className="text-xs text-muted">
                        {formatDateTime(event.createdAt)}
                        {event.changedByName ? ` · ${event.changedByName}` : ""}
                      </p>
                      {event.note ? <p className="text-xs text-muted">{event.note}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>

          <Card className="no-print">
            <CardHeader title="Actions" />
            <CardBody>
              <TransactionActions
                transaction={transaction}
                canUpdateQueue={hasPermission(user.permissions, PERMISSIONS.QUEUE_UPDATE)}
                canCancel={hasPermission(user.permissions, PERMISSIONS.TRANSACTION_CANCEL)}
                canVoidPayment={hasPermission(user.permissions, PERMISSIONS.PAYMENT_VOID)}
              />
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="overflow-hidden lg:sticky lg:top-20">
            <Receipt
              transaction={transaction}
              businessName={process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "CG CAR WASH"}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
