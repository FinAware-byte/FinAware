"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/sidebar/logout-button";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/income-expense", label: "Income vs Expense" },
  { href: "/identity", label: "My Identity" },
  { href: "/debts", label: "Debts & Liabilities" },
  { href: "/rehab", label: "Financial Rehab" },
  { href: "/help", label: "Get Help" }
];

export function AppSidebar() {
  const pathname = usePathname();

  // Hidden on phones: MobileHeader plus the tab strip already carry navigation there, and a
  // full-height column of the same links pushed every screen's content below the fold.
  return (
    <aside className="hidden h-full min-h-[calc(100vh-56px)] w-full border-r border-slate-200 bg-white p-5 md:flex md:w-64 md:flex-col">
      <div className="mb-8">
        <p className="text-xl font-bold text-brand-700">FinAware</p>
        <p className="text-xs text-slate-500">Secure &amp; Private Financial Rehabilitation</p>
      </div>
      <nav className="space-y-2 md:flex-1">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-lg px-3 py-2 text-sm font-medium transition",
                active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 border-t border-slate-200 pt-4">
        <LogoutButton className="w-full" />
      </div>
    </aside>
  );
}
