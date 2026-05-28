"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { brand } from "@/lib/brand";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/claims", label: "Claims", icon: "▤" },
  { href: "/uploads", label: "Uploads", icon: "↥" },
  { href: "/contracts", label: "Contracts", icon: "▣" },
  { href: "/team", label: "Team", icon: "◍" },
  { href: "/account", label: "Account", icon: "◎" }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-slate-900 px-4 py-6 text-slate-300">
      <div className="px-2">
        <span className="text-xl font-bold tracking-tight text-white">
          {brand.name}
        </span>
        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
          RCM Intelligence
        </p>
      </div>
      <nav className="mt-8 flex flex-col gap-1">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
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
    </aside>
  );
}
