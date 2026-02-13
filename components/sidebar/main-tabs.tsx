"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const mainTabs = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/identity", label: "My Identity" },
  { href: "/debts", label: "Debts & Liabilities" },
  { href: "/rehab", label: "Financial Rehab" },
  { href: "/help", label: "Get Help" }
];

function isTabActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MainTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-5 overflow-x-auto border-b border-slate-200 pb-3">
      <nav className="flex min-w-max items-center gap-2">
        {mainTabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              isTabActive(pathname, tab.href)
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
