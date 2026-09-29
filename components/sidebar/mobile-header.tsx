import { LogoutButton } from "@/components/sidebar/logout-button";

// Phone-only header. The desktop sidebar carries the wordmark and sign-out on wider screens;
// on a phone they belong in a compact bar so the page content starts near the top.
export function MobileHeader() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur md:hidden">
      <div>
        <p className="text-lg font-bold leading-none text-brand-700">FinAware</p>
        <p className="mt-0.5 text-xs text-slate-500">Secure &amp; private</p>
      </div>
      <LogoutButton />
    </header>
  );
}
