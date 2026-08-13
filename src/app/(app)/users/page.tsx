import { StaffManager } from "@/components/admin/staff-manager";
import { requirePermission } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/permissions/permissions";
import { listRoles, listStaff } from "@/server/services/user.service";

export const metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requirePermission(PERMISSIONS.USER_MANAGE);
  const [staff, roles] = await Promise.all([listStaff(), listRoles()]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Staff</h1>
        <p className="text-sm text-muted">
          Accounts are deactivated rather than deleted, so the transactions they rang up keep their
          attribution.
        </p>
      </div>

      <StaffManager staff={staff} roles={roles} currentUserId={user.id} />
    </div>
  );
}
