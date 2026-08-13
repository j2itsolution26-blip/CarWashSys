"use server";

import { revalidatePath } from "next/cache";
import { getRequestContext, requirePermission } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/permissions/permissions";
import {
  categoryInputSchema,
  createUserSchema,
  resetPasswordSchema,
  serviceInputSchema,
  setPriceSchema,
  toggleActiveSchema,
  updateUserSchema,
  variantInputSchema,
} from "@/lib/validation/schemas";
import {
  createCategory,
  createService,
  createVariant,
  setCategoryActive,
  setServiceActive,
  setVariantActive,
  updateCategory,
  updateService,
} from "@/server/services/catalog-admin.service";
import { changePrice, setPriceActive } from "@/server/services/pricing.service";
import { createStaff, resetStaffPassword, updateStaff } from "@/server/services/user.service";
import type { ActionResult } from "@/types/dto";
import { runAction } from "./action-result";

/**
 * Administration actions: pricing, catalog and staff.
 *
 * Every mutation here is gated on a permission a cashier does not hold. This is
 * the enforcement point for "the cashier can never change a price" — hiding the
 * screen is not what stops them, this is.
 */

function revalidateCatalog(): void {
  revalidatePath("/pricing");
  revalidatePath("/services");
  revalidatePath("/pos");
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export async function setPriceAction(
  input: unknown,
): Promise<ActionResult<{ previousAmount: string | null; newAmount: string }>> {
  return runAction("setPrice", async () => {
    const actor = await requirePermission(PERMISSIONS.PRICING_MANAGE);
    const payload = setPriceSchema.parse(input);
    const context = await getRequestContext();

    const result = await changePrice(payload, actor, context);
    revalidateCatalog();
    return result;
  });
}

export async function togglePriceActiveAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("togglePriceActive", async () => {
    const actor = await requirePermission(PERMISSIONS.PRICING_MANAGE);
    const payload = toggleActiveSchema.parse(input);

    await setPriceActive(payload.id, payload.isActive, actor);
    revalidateCatalog();
    return null;
  });
}

// ---------------------------------------------------------------------------
// Vehicle categories & variants
// ---------------------------------------------------------------------------

export async function createCategoryAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("createCategory", async () => {
    const actor = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
    const payload = categoryInputSchema.parse(input);

    const category = await createCategory(payload, actor);
    revalidateCatalog();
    return { id: category.id };
  });
}

export async function updateCategoryAction(
  id: string,
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction("updateCategory", async () => {
    const actor = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
    const payload = categoryInputSchema.parse(input);

    await updateCategory(id, payload, actor);
    revalidateCatalog();
    return null;
  });
}

export async function toggleCategoryActiveAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("toggleCategoryActive", async () => {
    const actor = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
    const payload = toggleActiveSchema.parse(input);

    await setCategoryActive(payload.id, payload.isActive, actor);
    revalidateCatalog();
    return null;
  });
}

export async function createVariantAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("createVariant", async () => {
    const actor = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
    const payload = variantInputSchema.parse(input);

    const variant = await createVariant(payload, actor);
    revalidateCatalog();
    return { id: variant.id };
  });
}

export async function toggleVariantActiveAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("toggleVariantActive", async () => {
    const actor = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
    const payload = toggleActiveSchema.parse(input);

    await setVariantActive(payload.id, payload.isActive, actor);
    revalidateCatalog();
    return null;
  });
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export async function createServiceAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("createService", async () => {
    const actor = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
    const payload = serviceInputSchema.parse(input);

    const service = await createService(payload, actor);
    revalidateCatalog();
    return { id: service.id };
  });
}

export async function updateServiceAction(id: string, input: unknown): Promise<ActionResult<null>> {
  return runAction("updateService", async () => {
    const actor = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
    const payload = serviceInputSchema.parse(input);

    await updateService(id, payload, actor);
    revalidateCatalog();
    return null;
  });
}

export async function toggleServiceActiveAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("toggleServiceActive", async () => {
    const actor = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
    const payload = toggleActiveSchema.parse(input);

    await setServiceActive(payload.id, payload.isActive, actor);
    revalidateCatalog();
    return null;
  });
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export async function createStaffAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("createStaff", async () => {
    const actor = await requirePermission(PERMISSIONS.USER_MANAGE);
    const payload = createUserSchema.parse(input);

    const user = await createStaff(payload, actor);
    revalidatePath("/users");
    return { id: user.id };
  });
}

export async function updateStaffAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("updateStaff", async () => {
    const actor = await requirePermission(PERMISSIONS.USER_MANAGE);
    const payload = updateUserSchema.parse(input);

    await updateStaff(payload, actor);
    revalidatePath("/users");
    return null;
  });
}

export async function resetStaffPasswordAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("resetStaffPassword", async () => {
    const actor = await requirePermission(PERMISSIONS.USER_MANAGE);
    const payload = resetPasswordSchema.parse(input);

    await resetStaffPassword(payload, actor);
    revalidatePath("/users");
    return null;
  });
}
