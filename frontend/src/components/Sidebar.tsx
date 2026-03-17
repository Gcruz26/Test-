"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, ChartNoAxesCombined, ChevronsLeft, ChevronsRight, FileUp, LogOut, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { logout } from "../api/auth";
import { User } from "../types/auth";

type Props = {
  user: User;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
};

type NavLink = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: User["role"][];
};

const links: NavLink[] = [
  { to: "/dashboard", label: "Dashboard", icon: ChartNoAxesCombined },
  { to: "/upload-reports", label: "Upload Reports", icon: FileUp },
  { to: "/report-summaries", label: "Report Summaries", icon: BarChart3 },
  { to: "/interpreters", label: "Interpreter Management", icon: Users },
];

export function Sidebar({ user, isCollapsed, onToggleCollapse }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <aside className="sidebar-v2" data-collapsed={isCollapsed}>
      <div className="sidebar-v2-header">
        <div className="sidebar-v2-brand">
          <div className="sidebar-v2-logo">A</div>
          {!isCollapsed ? (
            <div className="sidebar-v2-brand-copy">
              <h2>Alfa Processing</h2>
              <p>Modern operations layer</p>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="sidebar-v2-toggle"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      </div>
      <div className="sidebar-v2-main">
        <div className="sidebar-v2-user">
          <div className="sidebar-v2-user-avatar">{user.full_name.slice(0, 1).toUpperCase()}</div>
          {!isCollapsed ? (
            <>
              <div className="sidebar-v2-user-copy">
                <strong>{user.full_name}</strong>
                <span>{user.email}</span>
              </div>
              <small>
                <ShieldCheck className="size-3.5" />
                {user.role}
              </small>
            </>
          ) : (
            <small title={`${user.full_name} - ${user.role}`}>
              <ShieldCheck className="size-3.5" />
              {user.role}
            </small>
          )}
        </div>
        <nav className="sidebar-v2-nav">
          {links
            .filter((item) => !item.roles || item.roles.includes(user.role))
            .map((item) => (
              <Link
                key={item.to}
                href={item.to}
                className={pathname === item.to || pathname.startsWith(`${item.to}/`) ? "active" : ""}
                title={isCollapsed ? item.label : undefined}
                aria-label={item.label}
              >
                <item.icon className="size-4" />
                {!isCollapsed ? <span>{item.label}</span> : null}
              </Link>
            ))}
        </nav>
      </div>
      <button
        className="sidebar-v2-logout"
        onClick={handleLogout}
        title={isCollapsed ? "Logout" : undefined}
        aria-label="Logout"
      >
        <LogOut className="size-4" />
        {!isCollapsed ? "Logout" : null}
      </button>
    </aside>
  );
}
