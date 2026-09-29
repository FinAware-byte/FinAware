"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

// Shared by the desktop sidebar and the mobile header, so signing out behaves identically in both.
export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/microservices/auth/logout", { method: "POST" });
    } finally {
      router.replace("/");
      router.refresh();
      setLoggingOut(false);
    }
  };

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loggingOut}
      className={cn(
        "rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60",
        className
      )}
    >
      {loggingOut ? "Signing out…" : "Log out"}
    </button>
  );
}
