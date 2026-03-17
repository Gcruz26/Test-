"use client";

import { useEffect, useMemo, useState } from "react";
import { getInterpreter } from "@/api/interpreters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InterpreterItem } from "@/types/interpreter";

type InterpreterProfileProps = {
  interpreterId: number;
};

export function InterpreterProfile({ interpreterId }: InterpreterProfileProps) {
  const [interpreter, setInterpreter] = useState<InterpreterItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function bootstrap() {
      try {
        const response = await getInterpreter(interpreterId);
        setInterpreter(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load interpreter profile.");
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, [interpreterId]);

  const clientIds = useMemo(() => {
    if (!interpreter) {
      return [];
    }

    return [
      { label: "Propio ID", value: interpreter.propio_interpreter_id },
      { label: "BIG ID", value: interpreter.big_interpreter_id },
      { label: "Equity Voyce ID", value: interpreter.equiti_voyce_id },
      { label: "Equity Martti ID", value: interpreter.equiti_martti_id },
    ].filter((item) => item.value.trim().length > 0);
  }, [interpreter]);

  if (loading) {
    return <div className="loading">Loading interpreter profile…</div>;
  }

  if (error || !interpreter) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error || "Interpreter not found."}</div>;
  }

  return (
    <div className="grid gap-5">
      <Card className="border-slate-200/90 bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl text-slate-950">{interpreter.full_name}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Employee ID</div>
              <div className="mt-2 text-sm text-slate-800">{interpreter.employee_id || "-"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">E-mail</div>
              <div className="mt-2 text-sm text-slate-800">{interpreter.email || "-"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Associated Client</div>
              <div className="mt-2 text-sm text-slate-800">{interpreter.associated_client_name || "-"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Language</div>
              <div className="mt-2 text-sm text-slate-800">{interpreter.language || "-"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Location</div>
              <div className="mt-2 text-sm text-slate-800">{interpreter.location || "-"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Country</div>
              <div className="mt-2 text-sm text-slate-800">{interpreter.country || "-"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</div>
              <div className="mt-2 text-sm text-slate-800">{interpreter.status || "-"}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {clientIds.length > 0 ? (
        <Card className="border-slate-200/90 bg-white/90">
          <CardHeader>
            <CardTitle className="text-lg text-slate-950">Client IDs</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {clientIds.map((item) => (
              <div key={item.label}>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</div>
                <div className="mt-2 text-sm text-slate-800">{item.value}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-200/90 bg-white/90">
        <CardHeader>
          <CardTitle className="text-lg text-slate-950">Payment Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Payment Frequency</div>
            <div className="mt-2 text-sm text-slate-800">{interpreter.payment_frequency || "-"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Rate</div>
            <div className="mt-2 text-sm text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>{interpreter.rate || "-"}</div>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Mercury Recipient ID</div>
            <div className="mt-2 text-sm text-slate-800">{interpreter.mercury_recipient_id || "Not provided"}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
