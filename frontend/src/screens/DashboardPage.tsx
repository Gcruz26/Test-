"use client";

import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  FileSpreadsheet,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useAppUser } from "@/hooks/use-app-user";

const quickLinks = [
  {
    title: "Upload Reports",
    copy: "Upload and process client reports for validation and export.",
    href: "/upload-reports",
    icon: FileSpreadsheet,
    tone: "sky",
  },
  {
    title: "Interpreter Management",
    copy: "View and manage interpreter profiles, assignments, and sync status.",
    href: "/interpreters",
    icon: UsersRound,
    tone: "teal",
  },
  {
    title: "Report Summaries",
    copy: "Browse processed reports with totals, trends, and export history.",
    href: "/report-summaries",
    icon: Boxes,
    tone: "amber",
  },
] as const;

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function toneClass(tone: string) {
  switch (tone) {
    case "sky":
      return "from-sky-500/20 to-blue-500/8 text-sky-950";
    case "teal":
      return "from-teal-500/20 to-emerald-500/8 text-teal-950";
    case "amber":
      return "from-amber-400/25 to-orange-500/10 text-amber-950";
    default:
      return "from-slate-400/20 to-slate-500/10 text-slate-950";
  }
}

export function DashboardPage() {
  const user = useAppUser();
  const firstName = user?.full_name?.split(" ")[0] || "Team";

  return (
    <section className="dashboard-v2">
      <div className="dashboard-v2-hero dashboard-v2-hero--compact">
        <div className="dashboard-v2-copy dashboard-v2-copy--compact">
          <h1>{getGreeting()}, {firstName}.</h1>
          <div className="dashboard-v2-actions">
            <Link href="/upload-reports" className="dashboard-v2-primary">
              Upload Reports
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/interpreters" className="dashboard-v2-secondary">
              Manage Interpreters
            </Link>
          </div>
        </div>

        <div className="dashboard-v2-session">
          <div className="dashboard-v2-session-user">
            <div className="dashboard-v2-avatar-sm">{firstName.slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>{user?.full_name || "Unknown user"}</strong>
              <p>{user?.email || "No email loaded"}</p>
            </div>
          </div>
          <span className="dashboard-v2-role-badge">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {user?.role || "Unknown"}
          </span>
        </div>
      </div>

      <div className="dashboard-v2-grid">
        <div className="dashboard-v2-panel" style={{ gridColumn: "1 / -1" }}>
          <div className="dashboard-v2-panel-head">
            <div>
              <p className="dashboard-v2-eyebrow">Quick Access</p>
              <h2>Where do you want to go?</h2>
            </div>
          </div>
          <div className="dashboard-v2-focus-list">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.title} href={item.href} className={`dashboard-v2-focus-card bg-gradient-to-br ${toneClass(item.tone)}`}>
                  <div className="dashboard-v2-focus-icon">
                    <Icon className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.copy}</p>
                  </div>
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
