import { formatDateOnly, formatTimeOnly } from "@/lib/business-date";
import { formatPeso } from "@/lib/money";
import { describeMethod } from "@/lib/payment-methods";
import type { TransactionDTO } from "@/types/dto";

/**
 * Receipt.
 *
 * Every figure is read from the transaction record, including the service names
 * and unit prices, which were snapshotted at the time of sale. Reprinting this
 * receipt in a year — after any number of price changes — produces byte-identical
 * amounts.
 *
 * Styled to print correctly on both A4 and an 80mm thermal roll (see the
 * `.receipt-sheet` print rules in globals.css).
 */
export function Receipt({
  transaction,
  businessName,
}: {
  transaction: TransactionDTO;
  businessName: string;
}) {
  const capturedPayment = transaction.payments.find((payment) => payment.status === "CAPTURED");
  const paidStamp = transaction.paidAt ?? transaction.createdAt;

  return (
    <div className="receipt-sheet mx-auto w-full max-w-sm bg-[var(--surface-card)] px-5 py-6 font-mono text-sm text-[var(--text-strong)]">
      <header className="text-center">
        <h1 className="text-lg font-bold uppercase tracking-widest">{businessName}</h1>
        <p className="mt-1 text-xs">Official Transaction Receipt</p>
      </header>

      <Divider />

      <dl className="space-y-1 text-xs">
        <Row label="Transaction" value={transaction.transactionNumber} />
        <Row label="Customer" value={transaction.customerLabel} />
        <Row label="Date" value={formatDateOnly(paidStamp)} />
        <Row label="Time" value={formatTimeOnly(paidStamp)} />
        <Row label="Cashier" value={transaction.createdByName} />
      </dl>

      <Divider />

      <p className="text-xs uppercase tracking-wide">Vehicle</p>
      <p className="font-bold">{transaction.vehicleLabel ?? "—"}</p>

      <Divider />

      <p className="mb-1 text-xs uppercase tracking-wide">Services</p>
      <ul className="space-y-1">
        {transaction.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1">
              {item.serviceName}
              {item.quantity > 1 ? (
                <span className="block text-xs">
                  {item.quantity} × {formatPeso(item.unitPrice)}
                </span>
              ) : null}
            </span>
            <span className="tabular shrink-0 font-semibold">{formatPeso(item.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <Divider />

      <dl className="space-y-1">
        <Amount label="Subtotal" value={transaction.subtotal} />
        {Number(transaction.discountAmount) > 0 ? (
          <Amount
            label={`Discount${transaction.discountCode ? ` (${transaction.discountCode})` : ""}`}
            value={`-${transaction.discountAmount}`}
          />
        ) : null}
        {Number(transaction.additionalCharges) > 0 ? (
          <Amount label="Additional charges" value={transaction.additionalCharges} />
        ) : null}
      </dl>

      <div className="mt-2 flex items-center justify-between border-t-2 border-dashed border-current pt-2">
        <span className="text-base font-bold uppercase">Total</span>
        <span className="tabular text-xl font-bold">{formatPeso(transaction.total)}</span>
      </div>

      {capturedPayment ? (
        <>
          <Divider />
          <p className="text-xs uppercase tracking-wide">Payment</p>
          <dl className="mt-1 space-y-1">
            <Row label="Method" value={describeMethod(capturedPayment.method)} />
            {capturedPayment.referenceNumber ? (
              <Row label="Reference" value={capturedPayment.referenceNumber} />
            ) : null}
            <Amount label="Received" value={capturedPayment.amountTendered} />
            <Amount label="Change" value={capturedPayment.changeGiven} />
          </dl>
        </>
      ) : null}

      <Divider />

      <p className="text-center text-base font-bold uppercase tracking-widest">
        {transaction.isPaid ? "Paid" : "Unpaid"}
      </p>

      <p className="mt-4 text-center text-[10px] leading-relaxed">
        Thank you for choosing {businessName}.
        <br />
        This receipt is your proof of service.
      </p>
    </div>
  );
}

function Divider() {
  return <div aria-hidden="true" className="my-3 border-t border-dashed border-current" />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0">{label}</dt>
      <dd className="min-w-0 text-right font-semibold">{value}</dd>
    </div>
  );
}

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd className="tabular font-semibold">{formatPeso(value)}</dd>
    </div>
  );
}
