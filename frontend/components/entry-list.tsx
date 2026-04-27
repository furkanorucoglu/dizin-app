"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { IndexEntry } from "@/lib/types";

export function EntryList({
  entries,
  total,
  selectedId,
  onSelect,
  query,
  onQueryChange,
}: {
  entries: IndexEntry[];
  total: number;
  selectedId: number | null;
  onSelect: (entry: IndexEntry) => void;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 bg-white/80 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Dizin kelimesi ara…"
            className="h-10 rounded-2xl bg-white pl-9"
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>{entries.length}/{total} kayıt</span>
          <span className="inline-flex items-center gap-1">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Güvene göre renklidir
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {entries.length === 0 ? (
          <div className="m-2 rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm leading-6 text-slate-500">
            Kayıt bulunamadı. Arama kelimesini değiştir veya analiz tamamlandı mı kontrol et.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => {
              const selected = selectedId === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onSelect(entry)}
                  className={cn(
                    "w-full rounded-2xl border p-3 text-left transition-all duration-200",
                    selected
                      ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-900/15"
                      : "border-slate-200 bg-white text-slate-900 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold leading-5">{entry.headword}</p>
                      <p className={cn("mt-1 text-xs", selected ? "text-slate-300" : "text-slate-500")}>
                        #{entry.paragraph_index + 1} • {pageSummary(entry.translated_pages) || "TR sayfa yok"}
                      </p>
                    </div>
                    <ConfidenceBadge value={entry.confidence} selected={selected} />
                  </div>

                  {entry.aliases?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {entry.aliases.slice(0, 3).map((alias) => (
                        <span
                          key={alias}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            selected ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {alias}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfidenceBadge({ value, selected }: { value: string; selected: boolean }) {
  const normalized = value === "high" || value === "medium" || value === "low" ? value : "medium";
  if (selected) {
    return <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white">{confidenceText(normalized)}</span>;
  }
  return <Badge variant={normalized === "high" ? "success" : normalized === "medium" ? "warning" : "danger"}>{confidenceText(normalized)}</Badge>;
}

function confidenceText(value: "high" | "medium" | "low") {
  return value === "high" ? "Yüksek" : value === "medium" ? "Orta" : "Düşük";
}

function pageSummary(pages: IndexEntry["translated_pages"]) {
  return (pages ?? [])
    .slice(0, 3)
    .map((page) => (page.end && page.end !== page.start ? `${page.start}-${page.end}` : String(page.start)))
    .filter(Boolean)
    .join(", ");
}
