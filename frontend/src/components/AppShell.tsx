"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Search, Sparkles } from "lucide-react";
import { AppUserContext } from "@/hooks/use-app-user";
import { useSidebarCollapse } from "@/hooks/use-sidebar-collapse";
import { fetchCurrentUser } from "../api/auth";
import { Sidebar } from "./Sidebar";
import { User } from "../types/auth";

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const { isCollapsed, setIsCollapsed } = useSidebarCollapse();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch(() => {
        router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
      })
      .finally(() => setLoading(false));
  }, [pathname, router]);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <AppUserContext.Provider value={user}>
      <div className="workspace-shell" style={{ ["--sidebar-width" as string]: isCollapsed ? "84px" : "252px" }}>
        <Sidebar user={user} isCollapsed={isCollapsed} onToggleCollapse={() => setIsCollapsed((current) => !current)} />
        <div className="workspace-main">
          <header className="workspace-topbar">
            <div>
              <p className="workspace-topbar-label">Alfa Processing Platform</p>
              <strong>{pathname === "/dashboard" ? "Operations workspace" : "Module workspace"}</strong>
            </div>
            <div className="workspace-topbar-tools">
              <div className="workspace-search">
                <Search className="size-4" />
                <span>Migration-ready UX layer</span>
              </div>
              <div className="workspace-chip">
                <Sparkles className="size-4" />
                Next.js shell
              </div>
              <div className="workspace-notify">
                <Bell className="size-4" />
              </div>
            </div>
          </header>
          <main className="workspace-content">{children}</main>
        </div>
      </div>
    </AppUserContext.Provider>
  );
}
