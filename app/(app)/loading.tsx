export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-1/3 rounded-lg bg-slate-200" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card h-28 bg-slate-100" />
        <div className="card h-28 bg-slate-100" />
        <div className="card h-28 bg-slate-100" />
      </div>
      <div className="card h-64 bg-slate-100" />
    </div>
  );
}
