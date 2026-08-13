/**
 * Boundary validation.
 *
 * Every payload that enters the server — server action argument or route
 * handler body — is parsed here BEFORE it reaches business logic. Nothing
 * downstream re-checks shapes, so this file is the contract.
 *
 * Note the `.strict()` on transaction and payment inputs: an unexpected key is
 * a hard failure, not something to ignore. That is what makes a client that
 * tries to smuggle `{ unitPrice: 1 }` into a checkout get rejected outright
 * instead of silently having the field dropped.
 */
import { z } from "zod";
import { isGmailAddress } from "@/lib/owner/verification-code";

/** Peso amount on the wire: a plain decimal string, max 2 places. */
export const amountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter a valid peso amount, e.g. 500 or 500.50");

export const optionalAmountSchema = amountSchema.optional().nullable();

export const idSchema = z.string().trim().min(1, "Missing identifier").max(64);

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "Invalid request key")
  .max(64, "Invalid request key");

export const paymentMethodSchema = z.enum([
  "CASH",
  "GCASH",
  "MAYA",
  "BANK_TRANSFER",
  "OTHER",
]);

export const transactionStatusSchema = z.enum([
  "PENDING",
  "QUEUED",
  "WASHING",
  "QUALITY_CHECK",
  "COMPLETED",
  "PAID",
  "CANCELLED",
]);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password").max(200),
});

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200, "Password is too long")
  .refine((value) => /[a-z]/.test(value), "Include a lowercase letter")
  .refine((value) => /[A-Z]/.test(value), "Include an uppercase letter")
  .refine((value) => /\d/.test(value), "Include a number");

// ---------------------------------------------------------------------------
// Owner self-registration
// ---------------------------------------------------------------------------

/**
 * One-time owner registration.
 *
 * The Gmail rule is enforced here rather than in the service so the user sees
 * it inline on the form, and again server-side because this schema IS the
 * server-side check — the same parse runs for a direct POST.
 */
export const ownerRegistrationSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name").max(80),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .refine(isGmailAddress, "Please enter a valid Gmail address."),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Re-enter the password"),
  })
  .strict()
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type OwnerRegistrationInput = z.infer<typeof ownerRegistrationSchema>;

export const verifyOwnerCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s-]/g, ""))
      .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email.")),
  })
  .strict();

// ---------------------------------------------------------------------------
// POS / transactions
// ---------------------------------------------------------------------------

/**
 * A checkout line. Note what is ABSENT: no price, no line total, no subtotal.
 * The client tells the server WHAT was selected; the server decides what it
 * costs by reading the current price rows.
 */
export const transactionItemInputSchema = z
  .object({
    serviceId: idSchema,
    quantity: z.number().int().min(1, "Quantity must be at least 1").max(99, "Quantity is too high"),
  })
  .strict();

export const createTransactionSchema = z
  .object({
    variantId: idSchema,
    items: z
      .array(transactionItemInputSchema)
      .min(1, "Select at least one service")
      .max(20, "Too many services on one transaction"),
    discountCode: z.string().trim().max(40).optional().nullable(),
    additionalCharges: optionalAmountSchema,
    notes: z.string().trim().max(500).optional().nullable(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionItemsSchema = z
  .object({
    transactionId: idSchema,
    variantId: idSchema,
    items: z.array(transactionItemInputSchema).min(1, "Select at least one service").max(20),
    discountCode: z.string().trim().max(40).optional().nullable(),
    additionalCharges: optionalAmountSchema,
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export const capturePaymentSchema = z
  .object({
    transactionId: idSchema,
    method: paymentMethodSchema,
    /** For non-cash methods the client still sends the exact amount due. */
    amountTendered: amountSchema,
    referenceNumber: z.string().trim().max(60).optional().nullable(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CapturePaymentInput = z.infer<typeof capturePaymentSchema>;

export const changeStatusSchema = z
  .object({
    transactionId: idSchema,
    toStatus: transactionStatusSchema,
    note: z.string().trim().max(300).optional().nullable(),
  })
  .strict();

export const cancelTransactionSchema = z
  .object({
    transactionId: idSchema,
    reason: z.string().trim().min(3, "Give a reason for cancelling").max(300),
  })
  .strict();

export const assignStaffSchema = z
  .object({
    transactionId: idSchema,
    staffId: idSchema.nullable(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Catalog administration
// ---------------------------------------------------------------------------

export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short").max(60),
    icon: z.string().trim().min(1).max(8).default("🚗"),
    description: z.string().trim().max(200).optional().nullable(),
    sortOrder: z.number().int().min(0).max(999).default(0),
  })
  .strict();

export const variantInputSchema = z
  .object({
    categoryId: idSchema,
    name: z.string().trim().min(1, "Name is required").max(60),
    minDisplacementCc: z.number().int().min(0).max(10_000).optional().nullable(),
    maxDisplacementCc: z.number().int().min(0).max(10_000).optional().nullable(),
    sortOrder: z.number().int().min(0).max(999).default(0),
  })
  .strict()
  .refine(
    (value) =>
      value.minDisplacementCc == null ||
      value.maxDisplacementCc == null ||
      value.maxDisplacementCc >= value.minDisplacementCc,
    { message: "Maximum displacement must be greater than the minimum", path: ["maxDisplacementCc"] },
  );

export const serviceInputSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short").max(60),
    description: z.string().trim().max(200).optional().nullable(),
    allowsQuantity: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(999).default(0),
  })
  .strict();

export const setPriceSchema = z
  .object({
    variantId: idSchema,
    serviceId: idSchema,
    amount: amountSchema,
    note: z.string().trim().max(200).optional().nullable(),
  })
  .strict();

export const toggleActiveSchema = z
  .object({
    id: idSchema,
    isActive: z.boolean(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Staff administration
// ---------------------------------------------------------------------------

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short").max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    password: passwordSchema,
    roleKeys: z.array(z.string().trim().min(1)).min(1, "Assign at least one role").max(4),
  })
  .strict();

export const updateUserSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    roleKeys: z.array(z.string().trim().min(1)).min(1, "Assign at least one role").max(4),
    isActive: z.boolean(),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    id: idSchema,
    password: passwordSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Discounts
// ---------------------------------------------------------------------------

export const discountInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(2, "Code is too short")
      .max(24)
      .regex(/^[A-Z0-9_-]+$/, "Use letters, numbers, dashes or underscores only"),
    name: z.string().trim().min(2).max(80),
    type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
    value: amountSchema,
    maxAmount: optionalAmountSchema,
    minSubtotal: optionalAmountSchema,
    requiresApproval: z.boolean().default(true),
  })
  .strict()
  .refine(
    (value) => value.type !== "PERCENTAGE" || Number(value.value) <= 100,
    { message: "A percentage discount cannot exceed 100%", path: ["value"] },
  );

// ---------------------------------------------------------------------------
// Reporting filters
// ---------------------------------------------------------------------------

export const transactionFilterSchema = z
  .object({
    status: transactionStatusSchema.optional(),
    from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    search: z.string().trim().max(60).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .strict();

/**
 * Turn a ZodError into a single sentence a cashier can act on, plus a
 * field-keyed map for inline form errors.
 */
export function formatZodError(error: z.ZodError): {
  message: string;
  fieldErrors: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "form";
    if (!(path in fieldErrors)) fieldErrors[path] = issue.message;
  }
  const first = error.issues[0];
  return {
    message: first ? first.message : "Please check the information you entered.",
    fieldErrors,
  };
}
