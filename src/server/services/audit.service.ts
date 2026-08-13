import "server-only";
import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/guards";

/**
 * Append-only audit trail.
 *
 * This module deliberately exposes NO update and NO delete function. The
 * strongest guarantee that an audit log has not been quietly edited is that the
 * application contains no code capable of editing it. Retention/erasure, if
 * ever needed, is a deliberate DBA action — not a button.
 */

export interface AuditEntryInput {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  actor?: Pick<SessionUser, "id" | "name" | "email"> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

type TransactionClient = Prisma.TransactionClient;

function toCreateData(entry: AuditEntryInput): Prisma.AuditLogUncheckedCreateInput {
  return {
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    actorId: entry.actor?.id ?? null,
    actorName: entry.actor?.name ?? null,
    actorEmail: entry.actor?.email ?? null,
    summary: entry.summary,
    ...(entry.before != null ? { before: entry.before } : {}),
    ...(entry.after != null ? { after: entry.after } : {}),
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
  };
}

/**
 * Record inside an existing database transaction.
 *
 * Preferred for anything financial: if the payment rolls back, its audit row
 * rolls back with it, so the log can never claim money moved when it did not.
 */
export async function recordAuditIn(
  tx: TransactionClient,
  entry: AuditEntryInput,
): Promise<void> {
  await tx.auditLog.create({ data: toCreateData(entry) });
}

/**
 * Record outside any transaction (logins, reads, best-effort events).
 *
 * Never throws: a failure to write an audit row must not take down the action
 * the user was performing. Failures are logged loudly for operators.
 */
export async function recordAudit(entry: AuditEntryInput): Promise<void> {
  try {
    await prisma.auditLog.create({ data: toCreateData(entry) });
  } catch (error) {
    console.error("[audit] failed to write audit entry", {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface AuditQuery {
  page?: number;
  pageSize?: number;
  action?: AuditAction;
  entityType?: string;
  actorId?: string;
}

export async function listAuditLogs(query: AuditQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, query.pageSize ?? 50));

  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { entries, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}
