import "server-only";
import { z } from "zod";
import { toClientError } from "@/lib/errors";
import { formatZodError } from "@/lib/validation/schemas";
import type { ActionResult } from "@/types/dto";

/**
 * One error funnel for every server action.
 *
 * Actions never throw at the client. They return a discriminated result, which
 * means a component always has to acknowledge the failure case, and a stack
 * trace can never leak into a React error overlay in production.
 */
export async function runAction<T>(
  context: string,
  handler: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await handler() };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const { message, fieldErrors } = formatZodError(error);
      return { ok: false, code: "VALIDATION", message, fieldErrors };
    }
    const clientError = toClientError(error, context);
    return { ok: false, code: clientError.code, message: clientError.message };
  }
}

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}
