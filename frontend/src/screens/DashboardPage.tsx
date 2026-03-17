"use client";

import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  ChartNoAxesColumn,
  Clock3,
  FileSpreadsheet,
  GitBranchPlus,
  Sparkles,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { useAppUser } from "@/hooks/use-app-user";

const focusAreas = [
  {
    title: "Reports intake",
    copy: "Normalize intake around one upload flow and reduce manual handoff before validation begins.",
    href: "/upload-reports",
    icon: FileSpreadsheet,
    tone: "sky",
  },
  {
    title: "Interpreter operations",
    copy: "Keep profiles, assignment readiness, and sync visibility in one clean management surface.",
    href: "/interpreter-management",
    icon: UsersRound,
    tone: "teal",
  },
  {
    title: "Summary history",
    copy: "Turn uploaded productivity workbooks into a browsable monthly archive with clear totals and roster trends.",
    href: "/upload-reports",
    icon: Boxes,
    tone: "amber",
  },
] as const;

const workboard = [
  {
    label: "UX direction",
    value: "Next-native workspace",
    note: "The app shell now defines the primary user journey.",
  },
  {
    label: "Auth mode",
    value: "Server-first",
    note: "Protected routes remain driven by the Next app layer.",
  },
  {
    label: "Data posture",
    value: "Supabase-first",
    note: "New modules should ship on the App Router data layer only.",
  },
] as const;

const timeline = [
  {
    phase: "Now",
    title: "Reframe the daily workspace",
    description: "A cleaner shell, a stronger dashboard, and clearer module entry points.",
  },
  {
    phase: "Next",
    title: "Move operational forms into shared primitives",
    description: "Upload, validation, and export surfaces should share interaction patterns and feedback states.",
  },
  {
    phase: "Then",
    title: "Add persisted productivity history",
    description: "Reconnect live analytics once uploaded summaries are stored and queryable inside the new model.",
  },
] as const;

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
      <div className="dashboard-v2-hero">
        <div className="dashboard-v2-copy">
          <div className="dashboard-v2-pill">
            <Sparkles className="size-4" />
            New workspace direction
          </div>
          <h1>Good morning, {firstName}.</h1>
          <p>
            This dashboard is now front-end first. It gives you a stable control surface for the next phase: where to
            work next, what to persist, and which modules should carry the new UI pattern.
          </p>
          <div className="dashboard-v2-actions">
            <Link href="/upload-reports" className="dashboard-v2-primary">
              Open reports intake
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/interpreter-management" className="dashboard-v2-secondary">
              Review interpreter workspace
            </Link>
          </div>
        </div>

        <div className="dashboard-v2-status-card">
          <span className="dashboard-v2-eyebrow">Workspace posture</span>
          <strong>Frontend-led</strong>
          <p>
            The shell and dashboard are now designed to stand on their own while the data layer is migrated module by
            module.
          </p>
          <div className="dashboard-v2-status-grid">
            <article>
              <Clock3 className="size-4" />
              <span>Session role</span>
              <strong>{user?.role || "Unknown"}</strong>
            </article>
            <article>
              <GitBranchPlus className="size-4" />
              <span>Next move</span>
              <strong>Reports + queue UX</strong>
            </article>
          </div>
        </div>
      </div>

      <div className="dashboard-v2-metrics">
        {workboard.map((item) => (
          <article key={item.label} className="dashboard-v2-metric">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.note}</p>
          </article>
        ))}
      </div>

      <div className="dashboard-v2-grid">
        <div className="dashboard-v2-panel">
          <div className="dashboard-v2-panel-head">
            <div>
              <p className="dashboard-v2-eyebrow">Focus areas</p>
              <h2>Where the new UX should land next</h2>
            </div>
            <ChartNoAxesColumn className="size-5 text-slate-400" />
          </div>
          <div className="dashboard-v2-focus-list">
            {focusAreas.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.title} href={item.href} className={`dashboard-v2-focus-card bg-gradient-to-br ${toneClass(item.tone)}`}>
                  <div className="dashboard-v2-focus-icon">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.copy}</p>
                  </div>
                  <ArrowRight className="size-4" />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="dashboard-v2-side-stack">
          <div className="dashboard-v2-panel">
            <div className="dashboard-v2-panel-head">
              <div>
                <p className="dashboard-v2-eyebrow">Migration notes</p>
                <h2>Why this screen changed</h2>
              </div>
              <TriangleAlert className="size-5 text-amber-500" />
            </div>
            <ul className="dashboard-v2-notes">
              <li>The new dashboard keeps navigation and daily entry points stable while reporting flows are rebuilt.</li>
              <li>Live metrics should return only after the Supabase-backed summary model is in place.</li>
              <li>This gives the rest of the product a UI baseline before analytics and history views are reintroduced.</li>
            </ul>
          </div>

          <div className="dashboard-v2-panel">
            <div className="dashboard-v2-panel-head">
              <div>
                <p className="dashboard-v2-eyebrow">Operator card</p>
                <h2>Current session</h2>
              </div>
            </div>
            <div className="dashboard-v2-operator">
              <div className="dashboard-v2-avatar">{firstName.slice(0, 1).toUpperCase()}</div>
              <div>
                <strong>{user?.full_name || "Unknown user"}</strong>
                <p>{user?.email || "No email loaded"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-v2-panel">
        <div className="dashboard-v2-panel-head">
          <div>
            <p className="dashboard-v2-eyebrow">Execution sequence</p>
            <h2>Recommended rollout</h2>
          </div>
        </div>
        <div className="dashboard-v2-timeline">
          {timeline.map((item) => (
            <article key={item.phase} className="dashboard-v2-timeline-item">
              <span>{item.phase}</span>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
