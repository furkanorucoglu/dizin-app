"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import type { IndexEntry, PageRef } from "@/lib/types";

export function ManualEditDialog({
  open,
  onClose,
  entry,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  entry: IndexEntry;
  onSave: (pages: PageRef[]) => Promise<void> | void;
}) {
  const [value, setValue] = useState(serializePages(entry.translated_pages));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(serializePages(entry.translated_pages));
      setError(null);
      setSaving(false);
    }
  }, [open, entry]);

  const parsed = useMemo(() => {
    try {
      return parsePages(value);
    } catch {
      return null;
    }
  }, [value]);

  if (!open) return null;

  const handleSave = async () => {
    setError(null);
    let pages: PageRef[];

    try {
      pages = parsePages(value);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Sayfa formatı okunamadı.");
      return;
    }

    if (pages.length === 0) {
      setError("En az bir Türkçe sayfa girmen gerekiyor.");
      return;
    }

    try {
      setSaving(true);
      await onSave(pages);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kayıt sırasında hata oluştu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/80 px-6 py-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Manuel sayfa düzeltmesi</p>
            <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-950">{entry.headword}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-2xl">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-5 p-6">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            Türkçe PDF sayfalarını virgülle yazabilirsin. Aralık için tire kullan: <strong>12, 15-17, 24</strong>
          </div>

          <div className="space-y-2">
            <Label htmlFor="translated-pages">Türkçe sayfalar</Label>
            <textarea
              id="translated-pages"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="min-h-32 w-full resize-y rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              placeholder="Örn. 12, 15-17, 24"
              autoFocus
            />
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Önizleme</p>
            {parsed && parsed.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {parsed.map((page, index) => (
                  <span key={`${page.start}-${page.end}-${index}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {page.end && page.end !== page.start ? `${page.start}-${page.end}` : page.start}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Geçerli sayfa girildiğinde burada görünecek.</p>
            )}
          </div>

          {error && (
            <div className="flex gap-2 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50/80 px-6 py-4">
          <Button variant="outline" onClick={onClose} className="rounded-2xl bg-white" disabled={saving}>
            Vazgeç
          </Button>
          <Button onClick={handleSave} className="rounded-2xl" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}

function serializePages(pages: PageRef[] = []) {
  return pages
    .map((page) => (page.end && page.end !== page.start ? `${page.start}-${page.end}` : `${page.start}`))
    .join(", ");
}

function parsePages(input: string): PageRef[] {
  const tokens = input
    .split(/[,;\n]+/g)
    .map((item) => item.trim())
    .filter(Boolean);

  const pages: PageRef[] = [];

  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    const singleMatch = token.match(/^(\d+)$/);

    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end <= 0) {
        throw new Error(`Geçersiz sayfa: ${token}`);
      }
      if (end < start) {
        throw new Error(`Aralık ters olamaz: ${token}`);
      }
      pages.push({ start, end, raw: token });
      continue;
    }

    if (singleMatch) {
      const start = Number(singleMatch[1]);
      if (!Number.isInteger(start) || start <= 0) {
        throw new Error(`Geçersiz sayfa: ${token}`);
      }
      pages.push({ start, raw: token });
      continue;
    }

    throw new Error(`Sayfa formatı hatalı: ${token}`);
  }

  return dedupePages(pages);
}

function dedupePages(pages: PageRef[]) {
  const seen = new Set<string>();
  const result: PageRef[] = [];

  for (const page of pages) {
    const key = `${page.start}-${page.end ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(page);
    }
  }

  return result;
}
