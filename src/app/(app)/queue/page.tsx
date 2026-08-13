import { QueueBoard } from "@/components/queue/queue-board";
import { requirePermission } from "@/lib/auth/guards";
import { PERMISSIONS, hasPermission } from "@/lib/permissions/permissions";
import { getQueue } from "@/server/services/transaction.service";

export const metadata = { title: "Queue" };
export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const user = await requirePermission(PERMISSIONS.QUEUE_READ);
  const jobs = await getQueue();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Wash queue</h1>
        <p className="text-sm text-muted">
          {jobs.length === 0
            ? "No vehicles on the floor right now."
            : `${jobs.length} vehicle${jobs.length === 1 ? "" : "s"} in progress.`}
        </p>
      </div>

      <QueueBoard
        jobs={jobs}
        canUpdate={hasPermission(user.permissions, PERMISSIONS.QUEUE_UPDATE)}
      />
    </div>
  );
}
