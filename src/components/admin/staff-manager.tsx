"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createStaffAction,
  resetStaffPasswordAction,
  updateStaffAction,
} from "@/server/actions/admin.actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { Alert, useToast } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { formatDateTime } from "@/lib/business-date";
import { cn } from "@/lib/utils";
import type { StaffListItem } from "@/server/services/user.service";

/**
 * Staff administration.
 *
 * Roles are checkboxes rather than a single dropdown because a small shop
 * genuinely has people who are both cashier and washer, and forcing one role
 * would push staff into sharing an account — which would silently destroy the
 * value of the audit log.
 */
export function StaffManager({
  staff,
  roles,
  currentUserId,
}: {
  staff: StaffListItem[];
  roles: Array<{ key: string; name: string; description: string | null }>;
  currentUserId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"create" | "edit" | "password" | null>(null);
  const [editing, setEditing] = useState<StaffListItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleKeys, setRoleKeys] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  function openCreate() {
    setError(null);
    setEditing(null);
    setName("");
    setEmail("");
    setPassword("");
    setRoleKeys(["CASHIER"]);
    setIsActive(true);
    setDialog("create");
  }

  function openEdit(member: StaffListItem) {
    setError(null);
    setEditing(member);
    setName(member.name);
    setEmail(member.email);
    setRoleKeys(member.roles.map((role) => role.key));
    setIsActive(member.isActive);
    setDialog("edit");
  }

  function openPassword(member: StaffListItem) {
    setError(null);
    setEditing(member);
    setPassword("");
    setDialog("password");
  }

  function toggleRole(key: string) {
    setRoleKeys((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );
  }

  function run(action: () => Promise<{ ok: boolean; message?: string }>, message: string) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? "That did not work.");
        return;
      }
      toast.push("success", message);
      setDialog(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Staff accounts"
          description={`${staff.filter((member) => member.isActive).length} active`}
          action={
            <Button size="sm" onClick={openCreate}>
              + Add staff
            </Button>
          }
        />

        <ul className="divide-y divide-[var(--line)]">
          {staff.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "font-semibold",
                    member.isActive ? "text-strong" : "text-muted line-through",
                  )}
                >
                  {member.name}
                  {member.id === currentUserId ? (
                    <span className="ml-2 text-xs font-normal text-muted">(you)</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted">{member.email}</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {member.roles.map((role) => (
                    <span
                      key={role.key}
                      className="rounded-full bg-[var(--surface-inset)] px-2 py-0.5 text-xs font-medium text-[var(--text-body)]"
                    >
                      {role.name}
                    </span>
                  ))}
                </p>
              </div>

              <div className="text-right text-xs text-muted">
                <p>
                  {member.lastLoginAt
                    ? `Last in ${formatDateTime(member.lastLoginAt)}`
                    : "Never signed in"}
                </p>
                <p>
                  {member.transactionCount} transaction
                  {member.transactionCount === 1 ? "" : "s"}
                </p>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(member)}>
                  Edit
                </Button>
                <Button size="sm" variant="secondary" onClick={() => openPassword(member)}>
                  Reset password
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Create / edit ---------------------------------------------------- */}
      <Modal
        open={dialog === "create" || dialog === "edit"}
        onClose={() => setDialog(null)}
        title={dialog === "edit" ? `Edit ${editing?.name ?? "staff"}` : "Add staff member"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              isLoading={isPending}
              disabled={name.trim().length < 2 || !email.trim() || roleKeys.length === 0}
              onClick={() =>
                dialog === "edit" && editing
                  ? run(
                      () =>
                        updateStaffAction({
                          id: editing.id,
                          name: name.trim(),
                          email: email.trim(),
                          roleKeys,
                          isActive,
                        }),
                      "Staff updated",
                    )
                  : run(
                      () =>
                        createStaffAction({
                          name: name.trim(),
                          email: email.trim(),
                          password,
                          roleKeys,
                        }),
                      "Staff account created",
                    )
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {dialog === "create" ? (
            <TextField
              label="Temporary password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hint="At least 10 characters with upper case, lower case and a number."
              required
            />
          ) : null}

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-strong">Roles</legend>
            <div className="space-y-2">
              {roles.map((role) => (
                <label
                  key={role.key}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-[var(--line)] px-3"
                >
                  <input
                    type="checkbox"
                    checked={roleKeys.includes(role.key)}
                    onChange={() => toggleRole(role.key)}
                    className="size-4"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-strong">{role.name}</span>
                    {role.description ? (
                      <span className="block text-xs text-muted">{role.description}</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {dialog === "edit" ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-[var(--line)] px-3">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                className="size-4"
              />
              <span className="text-sm font-medium text-strong">
                Account is active (can sign in)
              </span>
            </label>
          ) : null}
        </div>
      </Modal>

      {/* Password reset --------------------------------------------------- */}
      <Modal
        open={dialog === "password"}
        onClose={() => setDialog(null)}
        title={`Reset password for ${editing?.name ?? ""}`}
        description="The staff member should change it after signing in."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              isLoading={isPending}
              disabled={password.length < 10}
              onClick={() =>
                editing &&
                run(
                  () => resetStaffPasswordAction({ id: editing.id, password }),
                  "Password reset",
                )
              }
            >
              Reset password
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <TextField
            label="New password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="At least 10 characters with upper case, lower case and a number."
            required
          />
        </div>
      </Modal>
    </div>
  );
}
