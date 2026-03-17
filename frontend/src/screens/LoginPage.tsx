"use client";

import { AlertCircle, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useCapsLock } from "@/hooks/use-caps-lock";
import { useLoginForm } from "@/hooks/use-login-form";
import { usePasswordVisibility } from "@/hooks/use-password-visibility";
import { Button } from "@/components/ui/button";
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
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-slate-900 text-sm font-bold text-white">A</div>
          <h1 className="text-lg font-semibold text-slate-900">Alfa Processing Platform</h1>
          <p className="mt-1 text-xs text-slate-500">Sign in to your workspace</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-1.5">
              <Label htmlFor="email" className="text-xs">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
                className="h-9 rounded-lg border-slate-200 text-sm"
              />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs">Password</Label>
                <button
                  type="button"
                  onClick={toggleVisibility}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700"
                >
                  {isVisible ? <EyeOff className="size-3" aria-hidden="true" /> : <Eye className="size-3" aria-hidden="true" />}
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
                className="h-9 rounded-lg border-slate-200 text-sm"
              />
              {isCapsLockOn ? (
                <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
                  <AlertCircle className="size-3" aria-hidden="true" />
                  Caps Lock is on
                </div>
              ) : null}
            </div>
            <label className="flex items-center gap-3 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={rememberEmail}
                onChange={(event) => setRememberEmail(event.target.checked)}
                className="size-3.5 rounded border-slate-300"
              />
              Remember my email on this device
            </label>
            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            ) : null}
            <Button type="submit" className="h-9 w-full rounded-lg text-xs font-semibold" disabled={isPending}>
              {isPending ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                  Signing in{"\u2026"}
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
