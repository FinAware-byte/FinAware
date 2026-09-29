import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { MainTabs } from "@/components/sidebar/main-tabs";
import { MobileHeader } from "@/components/sidebar/mobile-header";
import { requireSessionUser } from "@/lib/auth/require-user";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireSessionUser();

  return (
    <div className="min-h-screen md:flex">
      <MobileHeader />
      <AppSidebar />
      {/* min-w-0: without it a flex item keeps min-width:auto, so the tab strip's min-w-max
          content stretches the whole layout past the viewport instead of scrolling inside its
          own overflow-x-auto wrapper. */}
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <MainTabs />
        {children}
      </main>
    </div>
  );
}
