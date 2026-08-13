import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sidebar, MobileNav } from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logout } from "@/app/actions/auth";

// Applies to every page in this route group. Pages here set their own titles
// but none set `robots`, so they all inherit this: the signed-in application
// must never be indexed, and crawlers must not follow links deeper into it.
export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

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
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <MobileNav />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {user.organizationName}
              </p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <form action={logout}>
            <button type="submit" className="btn-secondary">
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
