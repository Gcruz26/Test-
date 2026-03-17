"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe2 } from "lucide-react";
import { createInterpreter, getInterpreterMeta, updateInterpreter } from "@/api/interpreters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InterpreterItem, InterpreterMetaResponse, InterpreterPayload } from "@/types/interpreter";

const emptyForm: InterpreterPayload = {
  employee_id: "",
  full_name: "",
  email: "",
  language: "",
  location: "",
  country: "",
  client_id: 0,
  payment_frequency: "Weekly",
  weekly: "",
  rate: "",
  status: "Active",
  propio_interpreter_id: "",
  big_interpreter_id: "",
  equiti_voyce_id: "",
  equiti_martti_id: "",
  mercury_recipient_id: "",
};

type InterpreterFormProps = {
  mode?: "create" | "edit";
  interpreter?: InterpreterItem | null;
};

function mapInterpreterToForm(interpreter: InterpreterItem): InterpreterPayload {
  return {
    employee_id: interpreter.employee_id,
    full_name: interpreter.full_name,
    email: interpreter.email,
    language: interpreter.language,
    location: interpreter.location,
    country: interpreter.country,
    client_id: interpreter.associated_client_id,
    payment_frequency: interpreter.payment_frequency,
    weekly: interpreter.weekly,
    rate: interpreter.rate,
    status: interpreter.status,
    propio_interpreter_id: interpreter.propio_interpreter_id,
    big_interpreter_id: interpreter.big_interpreter_id,
    equiti_voyce_id: interpreter.equiti_voyce_id,
    equiti_martti_id: interpreter.equiti_martti_id,
    mercury_recipient_id: interpreter.mercury_recipient_id,
  };
}

function trimPayload(form: InterpreterPayload): InterpreterPayload {
  return {
    ...form,
    employee_id: form.employee_id.trim(),
    full_name: form.full_name.trim(),
    email: form.email.trim(),
    language: form.language.trim(),
    location: form.location.trim(),
    country: form.country.trim(),
    weekly: form.weekly.trim(),
    rate: form.rate.trim(),
    propio_interpreter_id: form.propio_interpreter_id.trim(),
    big_interpreter_id: form.big_interpreter_id.trim(),
    equiti_voyce_id: form.equiti_voyce_id.trim(),
    equiti_martti_id: form.equiti_martti_id.trim(),
    mercury_recipient_id: form.mercury_recipient_id.trim(),
  };
}

export function InterpreterForm({ mode = "create", interpreter = null }: InterpreterFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<InterpreterPayload>(emptyForm);
  const [meta, setMeta] = useState<InterpreterMetaResponse>({ clients: [], payment_frequency_options: [], status_options: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const title = mode === "edit" ? "Edit Interpreter" : "Create Interpreter";
  const description = mode === "edit" ? "Update the interpreter profile and client platform identifiers." : "Create a new interpreter profile using the operational field set.";

  const hydratedInitialForm = useMemo(() => (interpreter ? mapInterpreterToForm(interpreter) : null), [interpreter]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const metaResponse = await getInterpreterMeta();
        setMeta(metaResponse);
        if (hydratedInitialForm) {
          setForm(hydratedInitialForm);
        } else {
          setForm({
            ...emptyForm,
            client_id: metaResponse.clients[0]?.id || 0,
            payment_frequency: metaResponse.payment_frequency_options[0] || "Weekly",
            status: metaResponse.status_options[0] || "Active",
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load interpreter form.");
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, [hydratedInitialForm]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const payload = trimPayload(form);

    if (
      !payload.employee_id ||
      !payload.full_name ||
      !payload.email ||
      !payload.language ||
      !payload.location ||
      !payload.country ||
      !payload.client_id ||
      !payload.rate
    ) {
      setError("All interpreter profile fields are required.");
      return;
    }

    setSaving(true);
    try {
      if (mode === "edit" && interpreter) {
        await updateInterpreter(interpreter.id, payload);
        router.push(`/interpreters/${interpreter.id}`);
      } else {
        await createInterpreter(payload);
        router.push("/interpreters");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${mode} interpreter.`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="loading">Loading interpreter form...</div>;
  }

  return (
    <Card className="border-slate-200/90 bg-white/90">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl text-slate-950">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="interpreter-employee-id">Employee ID</Label>
              <Input id="interpreter-employee-id" value={form.employee_id} onChange={(e) => setForm((current) => ({ ...current, employee_id: e.target.value }))} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="interpreter-full-name">Full Name</Label>
              <Input id="interpreter-full-name" value={form.full_name} onChange={(e) => setForm((current) => ({ ...current, full_name: e.target.value }))} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="interpreter-email">E-mail</Label>
              <Input id="interpreter-email" type="email" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="interpreter-language">Language</Label>
              <Input id="interpreter-language" value={form.language} onChange={(e) => setForm((current) => ({ ...current, language: e.target.value }))} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="interpreter-location">Location</Label>
              <Input id="interpreter-location" value={form.location} onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="interpreter-country">Country</Label>
              <div className="relative">
                <Globe2 className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" />
                <Input id="interpreter-country" className="pl-9" value={form.country} onChange={(e) => setForm((current) => ({ ...current, country: e.target.value }))} required />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="interpreter-client">Associated Client</Label>
              <select id="interpreter-client" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm" value={form.client_id} onChange={(e) => setForm((current) => ({ ...current, client_id: Number(e.target.value) }))} required>
                <option value={0}>Select a client</option>
                {meta.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="interpreter-status">Status</Label>
              <select id="interpreter-status" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm" value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value as InterpreterPayload["status"] }))}>
                {meta.status_options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
            <div>
              <h3 className="text-base font-semibold text-slate-950">Payment Details</h3>
              <p className="mt-1 text-sm text-slate-500">Store payout cadence and Mercury recipient details used for payment workflows.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="interpreter-payment-frequency">Payment Frequency</Label>
                <select id="interpreter-payment-frequency" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm" value={form.payment_frequency} onChange={(e) => setForm((current) => ({ ...current, payment_frequency: e.target.value as InterpreterPayload["payment_frequency"] }))} required>
                  {meta.payment_frequency_options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="interpreter-rate">Rate</Label>
                <Input id="interpreter-rate" type="number" min="0" step="0.01" value={form.rate} onChange={(e) => setForm((current) => ({ ...current, rate: e.target.value }))} required />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="interpreter-mercury-recipient-id">Mercury Recipient ID</Label>
                <Input
                  id="interpreter-mercury-recipient-id"
                  value={form.mercury_recipient_id}
                  placeholder="Enter Mercury recipient ID"
                  onChange={(e) => setForm((current) => ({ ...current, mercury_recipient_id: e.target.value }))}
                />
                <p className="text-sm text-slate-500">Mercury recipient or bank account identifier used for payments.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
            <div>
              <h3 className="text-base font-semibold text-slate-950">Client Platform IDs</h3>
              <p className="mt-1 text-sm text-slate-500">Store the identifiers used by each client platform for this interpreter profile.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="propio-interpreter-id">Propio ID</Label>
                <Input id="propio-interpreter-id" value={form.propio_interpreter_id} onChange={(e) => setForm((current) => ({ ...current, propio_interpreter_id: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="big-interpreter-id">BIG ID</Label>
                <Input id="big-interpreter-id" value={form.big_interpreter_id} onChange={(e) => setForm((current) => ({ ...current, big_interpreter_id: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="equiti-voyce-id">Equity Voyce ID</Label>
                <Input id="equiti-voyce-id" value={form.equiti_voyce_id} onChange={(e) => setForm((current) => ({ ...current, equiti_voyce_id: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="equiti-martti-id">Equity Martti ID</Label>
                <Input id="equiti-martti-id" value={form.equiti_martti_id} onChange={(e) => setForm((current) => ({ ...current, equiti_martti_id: e.target.value }))} />
              </div>
            </div>
          </div>

          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? (mode === "edit" ? "Saving..." : "Creating...") : mode === "edit" ? "Save Changes" : "Create Interpreter"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push(mode === "edit" && interpreter ? `/interpreters/${interpreter.id}` : "/interpreters")}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
