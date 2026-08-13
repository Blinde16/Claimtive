import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/SignupForm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Create your workspace",
  // Keep the sign-up form out of search results — the marketing page is the
  // indexable entry point, and it links here.
  robots: { index: false, follow: false }
};

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="text-2xl font-bold tracking-tight text-brand-700">
            {brand.name}
          </span>
          <p className="mt-1 text-sm text-slate-500">{brand.tagline}</p>
        </div>
        <div className="card p-8">
          <h1 className="mb-6 text-lg font-semibold text-slate-900">
            Create your workspace
          </h1>
          <SignupForm />
          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link className="font-semibold text-brand-600" href="/login">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
