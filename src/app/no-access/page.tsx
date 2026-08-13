import { signOutAction } from "@/server/actions/auth.actions";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "No access" };

/** Shown when an account exists but currently holds no usable permissions. */
export default function NoAccessPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-4 text-center">
          <p aria-hidden="true" className="text-4xl">
            🔒
          </p>
          <div>
            <h1 className="text-xl font-semibold">No access assigned</h1>
            <p className="mt-1 text-sm text-muted">
              Your account is active but has no role permissions yet. Ask the owner to assign you a
              role, then sign in again.
            </p>
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="secondary" fullWidth>
              Sign out
            </Button>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
