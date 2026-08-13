/**
 * Error taxonomy.
 *
 * Rule: the browser only ever sees `AppError.message`, which is written for a
 * cashier standing at a counter. Prisma errors, stack traces, connection
 * strings and SQL never cross the boundary — `toClientError` is the single
 * choke point that guarantees it.
 */

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "DUPLICATE"
  | "PRICE_UNAVAILABLE"
  | "INSUFFICIENT_PAYMENT"
  | "INVALID_TRANSITION"
  | "RATE_LIMITED"
  | "DATABASE_UNAVAILABLE"
  | "INTERNAL";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  DUPLICATE: 409,
  PRICE_UNAVAILABLE: 409,
  INSUFFICIENT_PAYMENT: 422,
  INVALID_TRANSITION: 409,
  RATE_LIMITED: 429,
  DATABASE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export const unauthenticated = (message = "Your session has expired. Please sign in again.") =>
  new AppError("UNAUTHENTICATED", message);

export const forbidden = (message = "You do not have permission to do that.") =>
  new AppError("FORBIDDEN", message);

export const notFound = (message = "That record could not be found.") =>
  new AppError("NOT_FOUND", message);

export const validation = (message: string, details?: Record<string, unknown>) =>
  new AppError("VALIDATION", message, details);

export const conflict = (message: string, details?: Record<string, unknown>) =>
  new AppError("CONFLICT", message, details);

export interface ClientError {
  ok: false;
  code: AppErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Convert anything thrown anywhere into a safe, staff-readable payload, and log
 * the real cause server-side with enough context to debug without reproducing.
 */
export function toClientError(error: unknown, context?: string): ClientError {
  if (error instanceof AppError) {
    // Expected, already-safe errors are logged at info level only.
    if (error.status >= 500) {
      console.error(`[${context ?? "app"}] ${error.code}: ${error.message}`, error.details);
    }
    return { ok: false, code: error.code, message: error.message, details: error.details };
  }

  const prismaCode = extractPrismaCode(error);
  if (prismaCode) {
    console.error(`[${context ?? "app"}] Prisma ${prismaCode}`, serialiseForLog(error));
    return mapPrismaError(prismaCode);
  }

  console.error(`[${context ?? "app"}] Unhandled error`, serialiseForLog(error));
  return {
    ok: false,
    code: "INTERNAL",
    message: "Something went wrong on our end. Please try again.",
  };
}

function extractPrismaCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { name?: string; code?: string };
  if (typeof candidate.code !== "string") {
    // Connection-level failures surface as PrismaClientInitializationError.
    return candidate.name === "PrismaClientInitializationError" ? "P1001" : null;
  }
  return candidate.code.startsWith("P") ? candidate.code : null;
}

function mapPrismaError(code: string): ClientError {
  switch (code) {
    case "P2002":
      return {
        ok: false,
        code: "DUPLICATE",
        message: "That record already exists.",
      };
    case "P2003":
      return {
        ok: false,
        code: "CONFLICT",
        message: "That record is still in use and cannot be changed.",
      };
    case "P2025":
      return { ok: false, code: "NOT_FOUND", message: "That record could not be found." };
    case "P1001":
    case "P1002":
    case "P1017":
      return {
        ok: false,
        code: "DATABASE_UNAVAILABLE",
        message: "Cannot reach the database right now. Please try again in a moment.",
      };
    default:
      return {
        ok: false,
        code: "INTERNAL",
        message: "Something went wrong on our end. Please try again.",
      };
  }
}

/** Never serialise the full error — `message` on a Prisma error can echo SQL. */
function serialiseForLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack?.split("\n").slice(0, 4) };
  }
  return { value: String(error) };
}
