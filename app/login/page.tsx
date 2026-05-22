import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { brand } from "@/lib/brand";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="text-2xl font-bold tracking-tight text-brand-700">
            {brand.name}
          </span>
          <p className="mt-1 text-sm text-slate-500">{brand.tagline}</p>
        </div>
        <div className="card p-8">
          <h1 className="mb-6 text-lg font-semibold text-slate-900">
            Sign in to your workspace
          </h1>
          <LoginForm />
          <p className="mt-6 text-center text-sm text-slate-500">
            No account?{" "}
            <Link className="font-semibold text-brand-600" href="/signup">
              Create one
            </Link>
          </p>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          Demo login is pre-filled. Sample data is loaded for the demo workspace.
        </p>
      </div>
    </main>
  );
}
