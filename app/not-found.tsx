import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="card max-w-md p-8 text-center">
        <p className="text-5xl font-bold text-brand-600">404</p>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">
          We couldn&apos;t find that page
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          The page you&apos;re looking for may have moved or no longer exists.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/dashboard" className="btn-primary">
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
