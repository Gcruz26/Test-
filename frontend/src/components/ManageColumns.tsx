"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

type ManageColumnsOption = {
  key: string;
  label: string;
};

type ManageColumnsProps = {
  columns: ManageColumnsOption[];
  visibleColumns: string[];
  onToggleColumn: (columnKey: string) => void;
  onReset: () => void;
};

export function ManageColumns({ columns, visibleColumns, onToggleColumn, onReset }: ManageColumnsProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!panelRef.current || panelRef.current.contains(event.target as Node)) {
        return;
      }

      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className="relative" ref={panelRef}>
      <Button type="button" variant="outline" onClick={() => setOpen((current) => !current)}>
        <SlidersHorizontal className="size-4" />
        Manage Columns
      </Button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 w-[280px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.12)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <strong className="block text-sm text-slate-950">Visible columns</strong>
              <p className="mt-1 text-xs leading-5 text-slate-500">Choose which interpreter fields appear in the roster table.</p>
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-slate-500 transition hover:text-slate-900"
              onClick={onReset}
            >
              Reset to Default
            </button>
          </div>
          <div className="mt-4 grid gap-2">
            {columns.map((column) => {
              const checked = visibleColumns.includes(column.key);
              return (
                <label
                  key={column.key}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                    checked={checked}
                    onChange={() => onToggleColumn(column.key)}
                  />
                  <span>{column.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
