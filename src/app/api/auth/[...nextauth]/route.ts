import { handlers } from "@/lib/auth";

/**
 * Auth.js endpoints (sign-in, sign-out, session, CSRF).
 *
 * Node runtime is required: the Credentials provider uses bcrypt and Prisma,
 * neither of which runs on the Edge.
 */
export const runtime = "nodejs";

export const { GET, POST } = handlers;
