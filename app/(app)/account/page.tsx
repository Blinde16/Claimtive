import { getCurrentUser } from "@/lib/auth/current-user";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const user = (await getCurrentUser())!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Account</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user.name} · {user.email} · {user.role === "OWNER" ? "Owner" : "Member"}
        </p>
      </div>

      <section className="card p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">
          Change password
        </h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
