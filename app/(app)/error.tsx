"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="card max-w-md p-8 text-center">
        <p className="text-4xl">⚠️</p>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">
          Something went wrong loading this page
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          An unexpected error occurred. You can try again, or head back to your
          dashboard.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button type="button" onClick={() => reset()} className="btn-primary">
            Try again
          </button>
          <Link href="/dashboard" className="btn-secondary">
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
