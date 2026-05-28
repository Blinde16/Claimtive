import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { TeamManager } from "@/components/TeamManager";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const user = (await getCurrentUser())!;

  const members = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    select: { id: true, name: true, email: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }]
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Team</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage who can access {user.organizationName}&apos;s workspace.
          {user.role !== "OWNER"
            ? " Only owners can add or remove members."
            : ""}
        </p>
      </div>

      <TeamManager
        isOwner={user.role === "OWNER"}
        currentUserId={user.id}
        members={members}
      />
    </div>
  );
}
