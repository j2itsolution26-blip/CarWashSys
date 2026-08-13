import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guards";
import { toClientError } from "@/lib/errors";
import { getTransaction } from "@/server/services/transaction.service";

/**
 * Read a single transaction.
 *
 * Used by the POS to re-hydrate a parked transaction. Authorisation is the same
 * as everywhere else — `getTransaction` applies the viewer's read scope and
 * returns 404 (never 403) for records outside it, so this endpoint cannot be
 * used to probe which transaction IDs exist.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const viewer = await requireUser();
    const { id } = await context.params;
    const transaction = await getTransaction(id, viewer);
    return NextResponse.json({ data: transaction });
  } catch (error) {
    const clientError = toClientError(error, "api:getTransaction");
    return NextResponse.json(clientError, {
      status: clientError.code === "UNAUTHENTICATED" ? 401 : clientError.code === "NOT_FOUND" ? 404 : 400,
    });
  }
}
