import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { MainTabs } from "@/components/sidebar/main-tabs";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen md:flex">
      <AppSidebar />
      <main className="flex-1 px-6 py-8">
        <MainTabs />
        {children}
      </main>
    </div>
  );
}
