// Shared worklist status definitions used by the server action and the UI.

export const WORK_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "APPEALED",
  "RESOLVED",
  "WONT_PURSUE"
] as const;

export type WorkStatusValue = (typeof WORK_STATUSES)[number];

export const WORK_STATUS_LABELS: Record<WorkStatusValue, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  APPEALED: "Appealed",
  RESOLVED: "Resolved",
  WONT_PURSUE: "Won't pursue"
};

// Tailwind class fragments for status badges.
export const WORK_STATUS_BADGE: Record<WorkStatusValue, string> = {
  NEW: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  APPEALED: "bg-amber-100 text-amber-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  WONT_PURSUE: "bg-slate-100 text-slate-400"
};

export function isWorkStatus(value: unknown): value is WorkStatusValue {
  return (
    typeof value === "string" &&
    (WORK_STATUSES as readonly string[]).includes(value)
  );
}

export function workStatusLabel(value: string | null | undefined): string {
  if (value && isWorkStatus(value)) return WORK_STATUS_LABELS[value];
  return "New";
}

// Resolution outcomes capture *what happened* when a claim is worked to a
// conclusion — most meaningful once the status is RESOLVED.
export const RESOLUTION_OUTCOMES = [
  "RECOVERED_FULL",
  "RECOVERED_PARTIAL",
  "UPHELD",
  "WRITTEN_OFF"
] as const;

export type ResolutionOutcome = (typeof RESOLUTION_OUTCOMES)[number];

export const RESOLUTION_OUTCOME_LABELS: Record<ResolutionOutcome, string> = {
  RECOVERED_FULL: "Recovered in full",
  RECOVERED_PARTIAL: "Partially recovered",
  UPHELD: "Denial upheld",
  WRITTEN_OFF: "Written off"
};

export function isResolutionOutcome(value: unknown): value is ResolutionOutcome {
  return (
    typeof value === "string" &&
    (RESOLUTION_OUTCOMES as readonly string[]).includes(value)
  );
}
