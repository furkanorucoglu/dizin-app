"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AcceptMap = Record<string, string[]>;

export function UploadDropzone({
  label,
  accept,
  file,
  onSelect,
}: {
  label: string;
  accept?: AcceptMap;
  file: File | null;
  onSelect: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const acceptText = accept ? Object.values(accept).flat().join(",") : undefined;

  const pickFile = (files: FileList | null) => {
    const nextFile = files?.[0] ?? null;
    if (nextFile) onSelect(nextFile);
  };

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        pickFile(event.dataTransfer.files);
      }}
      className={cn(
        "rounded-3xl border border-dashed p-4 transition-all",
        dragging ? "border-slate-950 bg-slate-100" : file ? "border-emerald-300 bg-emerald-50/70" : "border-slate-300 bg-white hover:bg-slate-50",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptText}
        className="hidden"
        onChange={(event) => pickFile(event.target.files)}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", file ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600")}>
            {file ? <CheckCircle2 className="h-5 w-5" /> : <FileUp className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{label}</p>
            <p className="mt-1 truncate text-xs text-slate-500">
              {file ? `${file.name} • ${formatBytes(file.size)}` : "Dosyayı sürükle bırak veya seç"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {file && (
            <Button variant="ghost" size="sm" onClick={() => onSelect(null)} className="rounded-2xl text-red-600 hover:bg-red-50">
              <X className="h-4 w-4" /> Kaldır
            </Button>
          )}
          <Button variant={file ? "outline" : "default"} size="sm" onClick={() => inputRef.current?.click()} className="rounded-2xl">
            Dosya seç
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
