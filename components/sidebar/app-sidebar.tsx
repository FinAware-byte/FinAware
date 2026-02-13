"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
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
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/microservices/auth/logout", {
        method: "POST"
      });
    } finally {
      router.replace("/");
      router.refresh();
      setLoggingOut(false);
    }
  };

  return (
    <aside className="h-full min-h-[calc(100vh-56px)] w-full border-r border-slate-200 bg-white p-5 md:flex md:w-64 md:flex-col">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-brand-700">FinAware</h1>
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
        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
        >
          {loggingOut ? "Logging out..." : "Logout"}
        </button>
      </div>
    </aside>
  );
}
