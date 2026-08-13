"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createCategoryAction,
  createServiceAction,
  createVariantAction,
  toggleCategoryActiveAction,
  toggleServiceActiveAction,
  toggleVariantActiveAction,
  updateCategoryAction,
  updateServiceAction,
} from "@/server/actions/admin.actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { Alert, useToast } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/**
 * Catalog administration: what the shop sells, and to which vehicles.
 *
 * Nothing here deletes. Disabling removes an item from the POS while every
 * historical transaction that references it keeps rendering — which is why the
 * buttons say "Disable", not "Delete".
 */

export interface CatalogServiceRow {
  id: string;
  name: string;
  description: string | null;
  allowsQuantity: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface CatalogVariantRow {
  id: string;
  name: string;
  isActive: boolean;
  minDisplacementCc: number | null;
  maxDisplacementCc: number | null;
}

export interface CatalogCategoryRow {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  variants: CatalogVariantRow[];
  transactionCount: number;
}

type Dialog =
  | { kind: "service"; row: CatalogServiceRow | null }
  | { kind: "category"; row: CatalogCategoryRow | null }
  | { kind: "variant"; categoryId: string; categoryName: string }
  | null;

export function CatalogManager({
  services,
  categories,
}: {
  services: CatalogServiceRow[];
  categories: CatalogCategoryRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state, reused across dialogs — reset every time one opens.
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🚗");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [allowsQuantity, setAllowsQuantity] = useState("no");
  const [minCc, setMinCc] = useState("");
  const [maxCc, setMaxCc] = useState("");

  function openDialog(next: Dialog) {
    setError(null);
    setDialog(next);

    if (next?.kind === "service") {
      setName(next.row?.name ?? "");
      setDescription(next.row?.description ?? "");
      setSortOrder(String(next.row?.sortOrder ?? 0));
      setAllowsQuantity(next.row?.allowsQuantity ? "yes" : "no");
    } else if (next?.kind === "category") {
      setName(next.row?.name ?? "");
      setIcon(next.row?.icon ?? "🚗");
      setDescription(next.row?.description ?? "");
      setSortOrder(String(next.row?.sortOrder ?? 0));
    } else if (next?.kind === "variant") {
      setName("");
      setMinCc("");
      setMaxCc("");
      setSortOrder("0");
    }
  }

  function run(action: () => Promise<{ ok: boolean; message?: string }>, successMessage: string) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? "That did not work.");
        return;
      }
      toast.push("success", successMessage);
      setDialog(null);
      router.refresh();
    });
  }

  function submitService() {
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      allowsQuantity: allowsQuantity === "yes",
      sortOrder: Number(sortOrder) || 0,
    };
    const existing = dialog?.kind === "service" ? dialog.row : null;

    run(
      () =>
        existing
          ? updateServiceAction(existing.id, payload)
          : createServiceAction(payload),
      existing ? "Service updated" : "Service created",
    );
  }

  function submitCategory() {
    const payload = {
      name: name.trim(),
      icon: icon.trim() || "🚗",
      description: description.trim() || null,
      sortOrder: Number(sortOrder) || 0,
    };
    const existing = dialog?.kind === "category" ? dialog.row : null;

    run(
      () =>
        existing
          ? updateCategoryAction(existing.id, payload)
          : createCategoryAction(payload),
      existing ? "Vehicle category updated" : "Vehicle category created",
    );
  }

  function submitVariant() {
    if (dialog?.kind !== "variant") return;
    run(
      () =>
        createVariantAction({
          categoryId: dialog.categoryId,
          name: name.trim(),
          minDisplacementCc: minCc.trim() ? Number(minCc) : null,
          maxDisplacementCc: maxCc.trim() ? Number(maxCc) : null,
          sortOrder: Number(sortOrder) || 0,
        }),
      "Vehicle type added",
    );
  }

  return (
    <div className="space-y-4">
      {error && !dialog ? <Alert tone="error">{error}</Alert> : null}

      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader
          title="Services"
          description="What the shop offers. Prices are set per vehicle on the Pricing screen."
          action={
            <Button size="sm" onClick={() => openDialog({ kind: "service", row: null })}>
              + Add service
            </Button>
          }
        />
        <ul className="divide-y divide-[var(--line)]">
          {services.map((service) => (
            <li key={service.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "font-semibold",
                    service.isActive ? "text-strong" : "text-muted line-through",
                  )}
                >
                  {service.name}
                </p>
                <p className="truncate text-xs text-muted">
                  {service.description ?? "No description"}
                  {service.allowsQuantity ? " · quantity allowed" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openDialog({ kind: "service", row: service })}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant={service.isActive ? "danger" : "success"}
                  isLoading={isPending}
                  onClick={() =>
                    run(
                      () =>
                        toggleServiceActiveAction({
                          id: service.id,
                          isActive: !service.isActive,
                        }),
                      service.isActive ? "Service disabled" : "Service enabled",
                    )
                  }
                >
                  {service.isActive ? "Disable" : "Enable"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader
          title="Vehicle categories"
          description="Each category has one or more types. Motorcycles use displacement tiers."
          action={
            <Button size="sm" onClick={() => openDialog({ kind: "category", row: null })}>
              + Add category
            </Button>
          }
        />
        <ul className="divide-y divide-[var(--line)]">
          {categories.map((category) => (
            <li key={category.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span aria-hidden="true" className="text-2xl">
                  {category.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "font-semibold",
                      category.isActive ? "text-strong" : "text-muted line-through",
                    )}
                  >
                    {category.name}
                  </p>
                  <p className="text-xs text-muted">
                    {category.transactionCount} transaction
                    {category.transactionCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDialog({ kind: "category", row: category })}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      openDialog({
                        kind: "variant",
                        categoryId: category.id,
                        categoryName: category.name,
                      })
                    }
                  >
                    + Type
                  </Button>
                  <Button
                    size="sm"
                    variant={category.isActive ? "danger" : "success"}
                    isLoading={isPending}
                    onClick={() =>
                      run(
                        () =>
                          toggleCategoryActiveAction({
                            id: category.id,
                            isActive: !category.isActive,
                          }),
                        category.isActive ? "Category disabled" : "Category enabled",
                      )
                    }
                  >
                    {category.isActive ? "Disable" : "Enable"}
                  </Button>
                </div>
              </div>

              <ul className="mt-2 flex flex-wrap gap-2 pl-9">
                {category.variants.map((variant) => (
                  <li key={variant.id}>
                    <span
                      className={cn(
                        "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs",
                        variant.isActive
                          ? "border-[var(--line)] text-[var(--text-body)]"
                          : "border-dashed border-[var(--line)] text-muted line-through",
                      )}
                    >
                      {variant.name}
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          run(
                            () =>
                              toggleVariantActiveAction({
                                id: variant.id,
                                isActive: !variant.isActive,
                              }),
                            variant.isActive ? "Vehicle type disabled" : "Vehicle type enabled",
                          )
                        }
                        className="font-semibold text-[var(--brand-strong)] underline underline-offset-2"
                      >
                        {variant.isActive ? "disable" : "enable"}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Modal
        open={dialog?.kind === "service"}
        onClose={() => setDialog(null)}
        title={dialog?.kind === "service" && dialog.row ? "Edit service" : "Add service"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submitService} isLoading={isPending} disabled={name.trim().length < 2}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <SelectField
            label="Allow quantity above 1?"
            value={allowsQuantity}
            onChange={(e) => setAllowsQuantity(e.target.value)}
            options={[
              { value: "no", label: "No — one per transaction" },
              { value: "yes", label: "Yes — cashier can set a quantity" },
            ]}
          />
          <TextField
            label="Sort order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            hint="Lower numbers appear first on the POS."
          />
        </div>
      </Modal>

      <Modal
        open={dialog?.kind === "category"}
        onClose={() => setDialog(null)}
        title={dialog?.kind === "category" && dialog.row ? "Edit category" : "Add vehicle category"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submitCategory} isLoading={isPending} disabled={name.trim().length < 2}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextField
            label="Icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            hint="A single emoji shown on the POS tile."
            maxLength={8}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <TextField
            label="Sort order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
          {dialog?.kind === "category" && !dialog.row ? (
            <Alert tone="info">
              A “Standard” vehicle type is created automatically. Add displacement tiers afterwards
              if this category needs them.
            </Alert>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={dialog?.kind === "variant"}
        onClose={() => setDialog(null)}
        title={dialog?.kind === "variant" ? `Add type to ${dialog.categoryName}` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submitVariant} isLoading={isPending} disabled={name.trim().length < 1}>
              Add type
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            hint="e.g. “400–600cc” or “Extended”"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Min displacement (cc)"
              type="number"
              value={minCc}
              onChange={(e) => setMinCc(e.target.value)}
            />
            <TextField
              label="Max displacement (cc)"
              type="number"
              value={maxCc}
              onChange={(e) => setMaxCc(e.target.value)}
            />
          </div>
          <Alert tone="info">
            New vehicle types have no prices yet. Set them on the Pricing screen before they appear
            on the POS.
          </Alert>
        </div>
      </Modal>
    </div>
  );
}
