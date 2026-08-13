import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/permissions/permissions";
import { getSalesReport } from "@/server/services/report.service";
import { toClientError } from "@/lib/errors";

/**
 * CSV export of the current report range.
 *
 * Behind the same permission as the page itself — an export endpoint is a
 * data-exfiltration route if it is not, and it must never be reachable just by
 * knowing the URL.
 *
 * The file is built from the SAME `getSalesReport` call the page renders, so the
 * numbers in the spreadsheet cannot drift from the numbers on screen.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Escapes a value for CSV, and defuses spreadsheet formula injection. */
function csvCell(value: string | number): string {
  const raw = String(value);
  // A leading =, +, - or @ makes Excel/Sheets evaluate the cell as a formula.
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvRow(cells: Array<string | number>): string {
  return cells.map(csvCell).join(",");
}

export async function GET(request: Request): Promise<Response> {
  try {
    await requirePermission(PERMISSIONS.REPORT_READ);

    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
      return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
    }

    const report = await getSalesReport(from, to);

    const lines: string[] = [
      csvRow(["CG Car Wash — sales report"]),
      csvRow(["From", report.from, "To", report.to]),
      "",
      csvRow(["Summary"]),
      csvRow(["Metric", "Value", "Previous period"]),
      csvRow(["Revenue", report.totalRevenue, report.previous.totalRevenue]),
      csvRow(["Transactions", report.transactionCount, report.previous.transactionCount]),
      csvRow(["Paid", report.paidCount, report.previous.paidCount]),
      csvRow(["Cancelled", report.cancelledCount, report.previous.cancelledCount]),
      csvRow(["Average ticket", report.averageTicket, report.previous.averageTicket]),
      csvRow(["Vehicles served", report.vehiclesServed, report.previous.vehiclesServed]),
      "",
      csvRow(["Revenue by payment method"]),
      csvRow(["Method", "Amount", "Count"]),
      ...report.byMethod.map((row) => csvRow([row.method, row.amount, row.count])),
      "",
      csvRow(["Revenue by service"]),
      csvRow(["Service", "Quantity", "Revenue"]),
      ...report.byService.map((row) => csvRow([row.serviceName, row.quantity, row.revenue])),
      "",
      csvRow(["Revenue by vehicle type"]),
      csvRow(["Vehicle", "Count", "Revenue"]),
      ...report.byVehicle.map((row) => csvRow([row.vehicle, row.count, row.revenue])),
      "",
      csvRow(["Transactions by hour band"]),
      csvRow(["Band", "Transactions", "Revenue"]),
      ...report.byHourBand.map((row) => csvRow([row.band, row.count, row.revenue])),
      "",
      csvRow(["Cashier performance"]),
      csvRow(["Cashier", "Transactions", "Revenue", "Average ticket", "Cancelled", "Share %"]),
      ...report.cashierPerformance.map((row) =>
        csvRow([row.name, row.transactions, row.revenue, row.averageTicket, row.cancelled, row.performance]),
      ),
      "",
      csvRow(["Daily trend"]),
      csvRow(["Date", "Revenue", "Transactions"]),
      ...report.trend.map((row) => csvRow([row.date, row.revenue, row.transactions])),
    ];

    // BOM so Excel opens UTF-8 (and the ₱ sign) correctly on Windows.
    const body = `﻿${lines.join("\r\n")}\r\n`;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cg-carwash-sales-${from}-to-${to}.csv"`,
        // A financial export must never be cached by a proxy or the browser.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    // `toClientError` strips anything that should not leave the server and logs
    // the real cause; only its safe message reaches the caller.
    const clientError = toClientError(error, "reports.export");
    const status =
      clientError.code === "UNAUTHENTICATED" ? 401 : clientError.code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: clientError.message }, { status });
  }
}
