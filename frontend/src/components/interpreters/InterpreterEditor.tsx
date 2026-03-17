"use client";

import { useEffect, useState } from "react";
import { getInterpreter } from "@/api/interpreters";
import type { InterpreterItem } from "@/types/interpreter";
import { InterpreterForm } from "./InterpreterForm";

type InterpreterEditorProps = {
  interpreterId: number;
};

export function InterpreterEditor({ interpreterId }: InterpreterEditorProps) {
  const [interpreter, setInterpreter] = useState<InterpreterItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function bootstrap() {
      try {
        const response = await getInterpreter(interpreterId);
        setInterpreter(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load interpreter.");
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, [interpreterId]);

  if (loading) {
    return <div className="loading">Loading interpreter form…</div>;
  }

  if (error || !interpreter) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error || "Interpreter not found."}</div>;
  }

  return <InterpreterForm mode="edit" interpreter={interpreter} />;
}
