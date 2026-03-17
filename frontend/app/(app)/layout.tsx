import type { ReactNode } from "react";
import { AppShell } from "../../src/components/AppShell";

export default function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
