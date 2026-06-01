"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { brand } from "@/lib/brand";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/claims", label: "Claims", icon: "▤" },
  { href: "/risk", label: "Denial risk", icon: "⚠" },
  { href: "/assistant", label: "Assistant", icon: "✦" },
  { href: "/uploads", label: "Uploads", icon: "↥" },
  { href: "/integrations", label: "Integrations", icon: "⇄" },
  { href: "/contracts", label: "Contracts", icon: "▣" },
  { href: "/team", label: "Team", icon: "◍" },
  { href: "/audit", label: "Audit log", icon: "❑" },
  { href: "/account", label: "Account", icon: "◎" },
  { href: "/how-it-works", label: "How It Works", icon: "◈" }
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="mt-8 flex flex-col gap-1">
      {NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-brand-600 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="px-2">
      <span className="text-xl font-bold tracking-tight text-white">
        {brand.name}
      </span>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
        RCM Intelligence
      </p>
    </div>
  );
}

/**
 * Desktop sidebar — kept exactly as before, but only visible at `lg:` and up.
 * On smaller screens it is hidden in favor of the mobile drawer below.
 */
export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-slate-900 px-4 py-6 text-slate-300 lg:flex">
      <Brand />
      <NavLinks />
    </aside>
  );
}

/**
 * Mobile/tablet navigation. Renders a hamburger button (shown below `lg:`)
 * that opens the nav as a full-height drawer with a backdrop. Tapping a link,
 * the close button, or the backdrop dismisses it.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
      >
        <span className="text-lg leading-none">☰</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-900/50"
          />
          <aside className="absolute inset-y-0 left-0 flex w-60 max-w-[80%] flex-col bg-slate-900 px-4 py-6 text-slate-300 shadow-xl">
            <div className="flex items-start justify-between">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="-mr-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                <span className="text-lg leading-none">✕</span>
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </div>
  );
}
