"use client";

import { AlertCircle, CheckCircle2, Eye, EyeOff, LoaderCircle, ShieldCheck, Waves, Workflow } from "lucide-react";
import { useCapsLock } from "@/hooks/use-caps-lock";
import { useLoginForm } from "@/hooks/use-login-form";
import { usePasswordVisibility } from "@/hooks/use-password-visibility";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginPageProps = {
  nextPath?: string;
};

export function LoginPage({ nextPath = "/dashboard" }: LoginPageProps) {
  const {
    email,
    password,
    error,
    rememberEmail,
    isPending,
    setEmail,
    setPassword,
    setRememberEmail,
    handleSubmit,
  } = useLoginForm({ nextPath });
  const { isVisible, inputType, toggleVisibility } = usePasswordVisibility();
  const { isCapsLockOn, updateCapsLock, resetCapsLock } = useCapsLock();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.2),_transparent_28%),linear-gradient(145deg,_#06131f_0%,_#0f1e35_44%,_#eef4f8_44%,_#f8fafc_100%)]">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl items-center gap-10 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
        <section className="text-white">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100/90 backdrop-blur">
            <Waves className="size-4" />
            Ops Control Surface
          </div>
          <div className="mt-8 max-w-2xl space-y-6">
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Move uploads, validation, and delivery through one cleaner workspace.
            </h1>
            <p className="max-w-xl text-base leading-7 text-slate-200/78 sm:text-lg">
              The platform is shifting to Next.js and Supabase. This sign-in flow now uses reusable hooks and
              shadcn primitives, so the UI can scale without turning the auth screen into another one-off form.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/12 bg-white/8 p-5 backdrop-blur-sm">
              <ShieldCheck className="mb-4 size-5 text-cyan-200" />
              <p className="text-sm font-medium text-white">Server-first auth</p>
              <p className="mt-2 text-sm text-slate-300/78">Supabase-backed session handling with fallback support during migration.</p>
            </div>
            <div className="rounded-3xl border border-white/12 bg-white/8 p-5 backdrop-blur-sm">
              <Workflow className="mb-4 size-5 text-cyan-200" />
              <p className="text-sm font-medium text-white">Modular migration</p>
              <p className="mt-2 text-sm text-slate-300/78">Frontend modules can be upgraded incrementally without rewriting the whole surface.</p>
            </div>
            <div className="rounded-3xl border border-white/12 bg-white/8 p-5 backdrop-blur-sm">
              <Waves className="mb-4 size-5 text-cyan-200" />
              <p className="text-sm font-medium text-white">UI foundation</p>
              <p className="mt-2 text-sm text-slate-300/78">shadcn components are installed and ready for broader adoption across the app.</p>
            </div>
          </div>
        </section>

        <section className="lg:justify-self-end">
          <Card className="w-full max-w-xl border-white/55 bg-white/82 shadow-[0_28px_90px_rgba(15,23,42,0.20)] backdrop-blur-xl">
            <CardHeader className="space-y-3">
              <div className="inline-flex w-fit items-center rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                Sign In
              </div>
              <CardTitle className="text-3xl text-slate-950">Alfa Processing Platform</CardTitle>
              <CardDescription className="max-w-md text-sm leading-6 text-slate-600">
                Use your workspace credentials to access dashboard, interpreters, reports, and the remaining migration surfaces.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Stack</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">Next.js + Supabase</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mode</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">Server-side auth first</p>
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-100 bg-cyan-50/80 p-4 text-sm text-slate-700">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-cyan-700" />
                  <div className="space-y-1">
                    <p className="font-medium text-slate-900">Faster return sign-ins</p>
                    <p className="leading-6 text-slate-600">
                      Keep your email prefilled on this machine and get immediate feedback for common input mistakes.
                    </p>
                  </div>
                </div>
              </div>

              <form className="grid gap-5" onSubmit={handleSubmit}>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="h-11 rounded-xl border-slate-300 bg-white"
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={toggleVisibility}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-950"
                    >
                      {isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      {isVisible ? "Hide" : "Show"}
                    </button>
                  </div>
                  <Input
                    id="password"
                    type={inputType}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={updateCapsLock}
                    onBlur={resetCapsLock}
                    required
                    autoComplete="current-password"
                    className="h-11 rounded-xl border-slate-300 bg-white"
                  />
                  {isCapsLockOn ? (
                    <div className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                      <AlertCircle className="size-4" />
                      Caps Lock is on
                    </div>
                  ) : null}
                </div>
                <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <span>
                    <span className="block font-medium text-slate-900">Remember my email</span>
                    <span className="block text-xs text-slate-500">Only stores the address locally on this device.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={rememberEmail}
                    onChange={(event) => setRememberEmail(event.target.checked)}
                    className="size-4 rounded border-slate-300 text-slate-950 focus:ring-slate-400"
                  />
                </label>
                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                ) : null}
                <Button type="submit" className="h-11 w-full rounded-xl text-sm font-semibold" disabled={isPending}>
                  {isPending ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Enter Workspace"
                  )}
                </Button>
                <p className="text-center text-xs leading-5 text-slate-500">
                  Secure session routing is handled through the Next.js app layer with the current migration fallback still available.
                </p>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
