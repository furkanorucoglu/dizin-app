"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Anchor } from "@/lib/types";

type AnchorRow = Pick<Anchor, "en_page" | "tr_page"> & {
  id: string;
  auto_detected?: boolean;
  confirmed?: boolean;
};

export function AnchorEditor({
  initialAnchors,
  onSave,
  isSaving,
}: {
  projectId?: string;
  initialAnchors: Anchor[];
  onSave: (anchors: { en_page: number; tr_page: number }[]) => void;
  isSaving?: boolean;
}) {
  const [rows, setRows] = useState<AnchorRow[]>(() => normalizeAnchors(initialAnchors));

  useEffect(() => {
    setRows(normalizeAnchors(initialAnchors));
  }, [initialAnchors]);

  const validRows = useMemo(
    () => rows.filter((row) => Number(row.en_page) > 0 && Number(row.tr_page) > 0),
    [rows],
  );

  const updateRow = (id: string, field: "en_page" | "tr_page", value: number) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: normalizePage(value) } : row)));
  };

  const removeRow = (id: string) => {
    setRows((current) => current.filter((row) => row.id !== id));
  };

  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows((current) => [
      ...current,
      {
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        en_page: Number(last?.en_page ?? 0) + 10 || 1,
        tr_page: Number(last?.tr_page ?? 0) + 10 || 1,
        confirmed: true,
      },
    ]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 rounded-3xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-slate-950">Bölüm başlangıç eşleşmeleri</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            EN sayfa ve TR sayfa numaralarını kontrol et. Bu eşleşmeler dönüşüm kalitesini belirler.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="muted">{validRows.length} geçerli çapa</Badge>
          <Button variant="outline" size="sm" onClick={addRow} className="rounded-2xl bg-white">
            <Plus className="h-4 w-4" /> Çapa ekle
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="grid grid-cols-[1fr_1fr_64px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>İngilizce sayfa</span>
          <span>Türkçe sayfa</span>
          <span />
        </div>

        <div className="divide-y divide-slate-100">
          {rows.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-500">Henüz çapa yok. İlk eşleşmeyi ekleyebilirsin.</div>
          )}

          {rows.map((row, index) => (
            <div key={row.id} className="grid grid-cols-[1fr_1fr_64px] gap-3 px-4 py-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`en-${row.id}`} className="sr-only">EN sayfa</Label>
                <Input
                  id={`en-${row.id}`}
                  type="number"
                  min={1}
                  value={row.en_page}
                  onChange={(event) => updateRow(row.id, "en_page", Number(event.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`tr-${row.id}`} className="sr-only">TR sayfa</Label>
                <Input
                  id={`tr-${row.id}`}
                  type="number"
                  min={1}
                  value={row.tr_page}
                  onChange={(event) => updateRow(row.id, "tr_page", Number(event.target.value))}
                />
              </div>
              <div className="flex items-center justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-2xl text-slate-500 hover:bg-red-50 hover:text-red-600"
                  onClick={() => removeRow(row.id)}
                  aria-label={`${index + 1}. çapayı sil`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => onSave(validRows.map(({ en_page, tr_page }) => ({ en_page, tr_page })))}
          disabled={isSaving || validRows.length === 0}
          className="rounded-2xl"
        >
          <Save className="h-4 w-4" /> Çapaları kaydet
        </Button>
      </div>
    </div>
  );
}

function normalizeAnchors(anchors: Anchor[]): AnchorRow[] {
  return (anchors ?? []).map((anchor, index) => ({
    id: `${anchor.en_page}-${anchor.tr_page}-${index}`,
    en_page: normalizePage(anchor.en_page),
    tr_page: normalizePage(anchor.tr_page),
    auto_detected: anchor.auto_detected,
    confirmed: anchor.confirmed,
  }));
}

function normalizePage(value: number) {
  if (!value || Number.isNaN(value)) return 1;
  return Math.max(1, Math.round(value));
}
