import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinAware",
  description: "Secure & Private Financial Rehabilitation"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">{children}</div>
        <footer className="border-t border-slate-200 bg-white/90 px-6 py-3 text-center text-xs text-slate-500">
          Demo data only. Not financial advice.
        </footer>
      </body>
    </html>
  );
}
