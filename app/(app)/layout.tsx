import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logout } from "@/app/actions/auth";

export default async function AppLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {user.organizationName}
            </p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
          <form action={logout}>
            <button type="submit" className="btn-secondary">
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
