import type { ReactNode } from "react";

/**
 * Inline glossary helper. Renders `label` followed by a small "?" marker that
 * exposes a plain-English explanation via the native tooltip (`title`) and to
 * screen readers (`aria-label`). Server-component safe — no client JS — so it
 * can be dropped into any table header or label.
 */
export function InfoTip({
  label,
  text,
  className = ""
}: {
  label: ReactNode;
  text: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span>{label}</span>
      <span
        tabIndex={0}
        role="note"
        aria-label={`${typeof label === "string" ? label + ": " : ""}${text}`}
        title={text}
        className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold leading-none text-slate-600 hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        ?
      </span>
    </span>
  );
}
